import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { formatCurrency, formatRelativeDate } from '../lib/format';
import CategoryPicker from '../components/CategoryPicker';
import { Drawer } from 'vaul';
import SplitModal from '../components/SplitModal';
import ManualTransactionForm from '../components/ManualTransactionForm';
import TransactionCard from '../components/TransactionCard';
import { Filter, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 50;

const DAY_COLORS = [
  { bg: 'var(--color-day-0)', border: 'var(--color-day-border-0)' },
  { bg: 'var(--color-day-1)', border: 'var(--color-day-border-1)' },
  { bg: 'var(--color-day-2)', border: 'var(--color-day-border-2)' },
  { bg: 'var(--color-day-3)', border: 'var(--color-day-border-3)' },
  { bg: 'var(--color-day-4)', border: 'var(--color-day-border-4)' },
  { bg: 'var(--color-day-5)', border: 'var(--color-day-border-5)' },
];

type SortColumn = 'date' | 'payee' | 'amount' | 'account';
type SortDirection = 'asc' | 'desc';

export interface TransactionFilters {
  dateFrom: string;
  dateTo: string;
  search: string;
  amountMin: string;
  amountMax: string;
  categoryFilter: string;
}

interface FilterableTransaction {
  date: string;
  payee: string;
  memo: string | null;
  amount: number;
  categoryId: number | null;
}

export function filterTransactions<T extends FilterableTransaction>(
  transactions: T[],
  filters: TransactionFilters,
): T[] {
  let result = [...transactions];

  if (filters.dateFrom) {
    result = result.filter(t => t.date >= filters.dateFrom);
  }
  if (filters.dateTo) {
    result = result.filter(t => t.date <= filters.dateTo);
  }

  if (filters.search) {
    const search = filters.search.toLowerCase();
    result = result.filter(
      t =>
        t.payee.toLowerCase().includes(search) ||
        (t.memo && t.memo.toLowerCase().includes(search)),
    );
  }

  if (filters.amountMin) {
    const minCents = Math.round(parseFloat(filters.amountMin) * 100);
    result = result.filter(t => Math.abs(t.amount) >= minCents);
  }
  if (filters.amountMax) {
    const maxCents = Math.round(parseFloat(filters.amountMax) * 100);
    result = result.filter(t => Math.abs(t.amount) <= maxCents);
  }

  if (filters.categoryFilter === 'uncategorized') {
    result = result.filter(t => t.categoryId === null);
  } else if (filters.categoryFilter !== '') {
    const catId = parseInt(filters.categoryFilter, 10);
    result = result.filter(t => t.categoryId === catId);
  }

  return result;
}

export default function TransactionsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: transactions, isLoading, error } = useQuery(trpc.transactions.list.queryOptions());
  const { data: categoryGroups } = useQuery(trpc.categories.groups.list.queryOptions());

  const [inputValue, setInputValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [splitTransactionId, setSplitTransactionId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [page, setPage] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setInputValue(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedSearch(value), 200);
  }, []);

  const handleSort = useCallback((column: SortColumn) => {
    setSortColumn(prev => {
      if (prev === column) {
        setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDirection('asc');
      return column;
    });
  }, []);

  const lookupCategory = useCallback((categoryId: number): { name: string; groupName: string } | null => {
    if (!categoryGroups) return null;
    for (const group of categoryGroups) {
      for (const cat of group.categories) {
        if (cat.id === categoryId) {
          return { name: cat.name, groupName: group.name };
        }
      }
    }
    return null;
  }, [categoryGroups]);

  const updateCategoryMut = useMutation(trpc.transactions.updateCategory.mutationOptions({
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: trpc.transactions.list.queryKey() });
      const previous = queryClient.getQueryData(trpc.transactions.list.queryKey());

      queryClient.setQueryData(trpc.transactions.list.queryKey(), (old: typeof transactions) => {
        if (!old) return old;
        return old.map(t => {
          if (t.id !== vars.transactionId) return t;
          const catInfo = vars.categoryId ? lookupCategory(vars.categoryId) : null;
          return {
            ...t,
            categoryId: vars.categoryId,
            categoryName: catInfo?.name ?? null,
            groupName: catInfo?.groupName ?? null,
            ruleId: null,
            ruleName: null,
            splitCount: 0,
          };
        });
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(trpc.transactions.list.queryKey(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: trpc.transactions.list.queryKey() });
    },
  }));

  const filtered = useMemo(() => {
    if (!transactions) return [];

    const result = filterTransactions(transactions, {
      dateFrom,
      dateTo,
      search: debouncedSearch,
      amountMin,
      amountMax,
      categoryFilter,
    });

    result.sort((a, b) => {
      let cmp: number;
      switch (sortColumn) {
        case 'date':
          cmp = a.date.localeCompare(b.date);
          break;
        case 'payee':
          cmp = a.payee.localeCompare(b.payee);
          break;
        case 'amount':
          cmp = a.amount - b.amount;
          break;
        case 'account':
          cmp = a.accountName.localeCompare(b.accountName);
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [transactions, dateFrom, dateTo, debouncedSearch, amountMin, amountMax, categoryFilter, sortColumn, sortDirection]);

  // Reset to first page when filters/sort change
  useEffect(() => {
    setPage(0);
  }, [dateFrom, dateTo, debouncedSearch, amountMin, amountMax, categoryFilter, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginatedRows = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [filtered, safePage],
  );

  const dayGroups = useMemo(() => {
    if (sortColumn !== 'date') return null;
    const groups: Map<string, typeof paginatedRows> = new Map();
    for (const txn of paginatedRows) {
      const existing = groups.get(txn.date);
      if (existing) {
        existing.push(txn);
      } else {
        groups.set(txn.date, [txn]);
      }
    }
    let colorIndex = 0;
    return Array.from(groups.entries()).map(([date, transactions]) => ({
      date,
      label: formatRelativeDate(date),
      color: DAY_COLORS[colorIndex++ % DAY_COLORS.length],
      dailyTotal: transactions.reduce((sum, t) => sum + t.amount, 0),
      transactions,
    }));
  }, [paginatedRows, sortColumn]);

  const activeFilterCount = [dateFrom, dateTo, debouncedSearch, amountMin, amountMax, categoryFilter]
    .filter(v => v !== '').length;

  const splitTransaction = splitTransactionId ? transactions?.find(t => t.id === splitTransactionId) : null;

  if (isLoading) {
    return <p className="text-text-secondary">Loading transactions...</p>;
  }

  if (error) {
    return <p className="text-danger">Error loading transactions: {error.message}</p>;
  }

  const sortIndicator = (column: SortColumn) => {
    if (sortColumn !== column) return '';
    return sortDirection === 'asc' ? ' \u2191' : ' \u2193';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Transactions</h2>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 bg-accent text-text-invert text-sm rounded hover:bg-accent-hover"
          >
            Add Transaction
          </button>
        )}
      </div>

      <div className="hidden md:block">
        {showAddForm && <ManualTransactionForm onClose={() => setShowAddForm(false)} />}
      </div>

      <Drawer.Root open={showAddForm} onOpenChange={(o) => { if (!o) setShowAddForm(false); }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 md:hidden" />
          <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-surface rounded-t-2xl max-h-[90svh] flex flex-col pb-safe md:hidden">
            <div className="mx-auto w-12 h-1.5 bg-surface-tertiary rounded-full mt-3 mb-2 flex-shrink-0" />
            <div className="overflow-y-auto flex-1">
              <ManualTransactionForm onClose={() => setShowAddForm(false)} />
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Mobile filter toggle */}
      <div className="md:hidden flex items-center justify-between mb-4">
        <button
          onClick={() => setFilterPanelOpen(prev => !prev)}
          className="flex items-center gap-2 px-3 min-h-[44px] text-sm border border-border-heavy rounded-md"
        >
          <Filter size={16} />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-accent text-text-invert text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {activeFilterCount}
            </span>
          )}
          {filterPanelOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      <div className={`flex flex-wrap items-end gap-4 mb-4 ${!filterPanelOpen ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex-1 min-w-48">
          <input
            type="text"
            placeholder="Search payee or memo..."
            value={inputValue}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full px-3 py-2 border border-border-heavy rounded-md text-base focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-2 border border-border-heavy rounded-md text-base"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-2 py-2 border border-border-heavy rounded-md text-base"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">Min $</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amountMin}
            onChange={e => setAmountMin(e.target.value)}
            className="w-24 px-2 py-2 border border-border-heavy rounded-md text-base"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">Max $</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amountMax}
            onChange={e => setAmountMax(e.target.value)}
            className="w-24 px-2 py-2 border border-border-heavy rounded-md text-base"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">Category</label>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-2 py-2 border border-border-heavy rounded-md text-base"
          >
            <option value="">All Categories</option>
            <option value="uncategorized">Uncategorized</option>
            {categoryGroups?.map(group => (
              <optgroup key={group.id} label={group.name}>
                {group.categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-text-secondary">
          {transactions && transactions.length > 0
            ? 'No transactions match your filters.'
            : 'No transactions found.'}
        </p>
      ) : (
        <>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-secondary text-left text-sm font-semibold text-text-primary">
                <th
                  className="px-4 py-2 cursor-pointer hover:bg-surface-tertiary"
                  onClick={() => handleSort('date')}
                >
                  Date{sortIndicator('date')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:bg-surface-tertiary"
                  onClick={() => handleSort('payee')}
                >
                  Payee{sortIndicator('payee')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:bg-surface-tertiary text-right"
                  onClick={() => handleSort('amount')}
                >
                  Amount{sortIndicator('amount')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:bg-surface-tertiary"
                  onClick={() => handleSort('account')}
                >
                  Account{sortIndicator('account')}
                </th>
                <th className="px-4 py-2">Category</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map(txn => (
                <tr key={txn.id} className="border-b border-border even:bg-surface-alt hover:bg-surface-secondary">
                  <td className="px-4 py-2 text-sm">
                    {new Date(txn.date + 'T00:00:00').toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {txn.payee}
                    {txn.isTransfer && (
                      <span className="ml-2 inline-block px-1.5 py-0.5 text-xs font-medium bg-highlight text-highlight-text rounded">
                        Transfer
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-2 text-sm text-right ${txn.amount < 0 ? 'text-danger' : 'text-text-primary'}`}>
                    {formatCurrency(txn.amount)}
                  </td>
                  <td className="px-4 py-2 text-sm">{txn.accountName}</td>
                  <td className="px-4 py-2 text-sm">
                    <div className="flex items-center gap-1">
                      {txn.splitCount > 0 ? (
                        <button
                          onClick={() => setSplitTransactionId(txn.id)}
                          className="text-accent hover:text-accent-hover text-sm"
                        >
                          Split ({txn.splitCount})
                        </button>
                      ) : (
                        <div>
                          <CategoryPicker
                            value={txn.categoryId}
                            onChange={categoryId => updateCategoryMut.mutate({ transactionId: txn.id, categoryId })}
                          />
                          {txn.ruleName && (
                            <div className="text-xs text-text-tertiary mt-0.5" title={`Categorized by rule: ${txn.ruleName}`}>
                              Rule: {txn.ruleName}
                            </div>
                          )}
                        </div>
                      )}
                      {txn.splitCount === 0 && (
                        <button
                          onClick={() => setSplitTransactionId(txn.id)}
                          className="text-xs text-text-tertiary hover:text-accent"
                          title="Split transaction"
                        >
                          Split
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden">
          {dayGroups ? (
            dayGroups.map(group => (
              <div key={group.date} className="mb-1">
                <div
                  className="sticky top-0 z-10 flex items-center justify-between px-3 py-1.5 text-sm font-semibold rounded-md mb-1"
                  style={{ backgroundColor: group.color.bg }}
                >
                  <span className="text-text-primary">{group.label}</span>
                  <span className={`text-xs font-medium ${group.dailyTotal < 0 ? 'text-danger' : 'text-text-secondary'}`}>
                    {formatCurrency(group.dailyTotal)}
                  </span>
                </div>
                <div className="space-y-1.5 mb-3">
                  {group.transactions.map(txn => (
                    <TransactionCard
                      key={txn.id}
                      txn={txn}
                      dayColor={group.color}
                      isExpanded={expandedId === txn.id}
                      onToggle={() => setExpandedId(prev => prev === txn.id ? null : txn.id)}
                      onCategoryChange={categoryId => updateCategoryMut.mutate({ transactionId: txn.id, categoryId })}
                      onSplitClick={() => setSplitTransactionId(txn.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="space-y-1.5">
              {paginatedRows.map(txn => (
                <TransactionCard
                  key={txn.id}
                  txn={txn}
                  isExpanded={expandedId === txn.id}
                  onToggle={() => setExpandedId(prev => prev === txn.id ? null : txn.id)}
                  onCategoryChange={categoryId => updateCategoryMut.mutate({ transactionId: txn.id, categoryId })}
                  onSplitClick={() => setSplitTransactionId(txn.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pb-20 md:pb-0 text-sm text-text-secondary">
            <span>
              Showing {safePage * PAGE_SIZE + 1}--{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(0)}
                disabled={safePage === 0}
                className="px-2 py-1 rounded hover:bg-surface-secondary disabled:opacity-30 disabled:cursor-default"
              >
                First
              </button>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="p-1 rounded hover:bg-surface-secondary disabled:opacity-30 disabled:cursor-default"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="px-2">
                Page {safePage + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="p-1 rounded hover:bg-surface-secondary disabled:opacity-30 disabled:cursor-default"
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={safePage >= totalPages - 1}
                className="px-2 py-1 rounded hover:bg-surface-secondary disabled:opacity-30 disabled:cursor-default"
              >
                Last
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {splitTransaction && (
        <SplitModal
          transaction={{ id: splitTransaction.id, amount: splitTransaction.amount, payee: splitTransaction.payee }}
          hasSplits={splitTransaction.splitCount > 0}
          onClose={() => setSplitTransactionId(null)}
        />
      )}
    </div>
  );
}
