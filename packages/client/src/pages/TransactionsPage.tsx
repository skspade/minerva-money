import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';
import CategoryPicker from '../components/CategoryPicker';
import { Drawer } from 'vaul';
import SplitModal from '../components/SplitModal';
import ManualTransactionForm from '../components/ManualTransactionForm';
import TransactionCard from '../components/TransactionCard';
import { Filter, ChevronDown, ChevronUp } from 'lucide-react';

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

  const activeFilterCount = [dateFrom, dateTo, debouncedSearch, amountMin, amountMax, categoryFilter]
    .filter(v => v !== '').length;

  const splitTransaction = splitTransactionId ? transactions?.find(t => t.id === splitTransactionId) : null;

  if (isLoading) {
    return <p className="text-gray-500">Loading transactions...</p>;
  }

  if (error) {
    return <p className="text-red-600">Error loading transactions: {error.message}</p>;
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
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
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
          <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl max-h-[90svh] flex flex-col pb-safe md:hidden">
            <div className="mx-auto w-12 h-1.5 bg-gray-300 rounded-full mt-3 mb-2 flex-shrink-0" />
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
          className="flex items-center gap-2 px-3 min-h-[44px] text-sm border border-gray-300 rounded-md"
        >
          <Filter size={16} />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-2 border border-gray-300 rounded-md text-base"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-2 py-2 border border-gray-300 rounded-md text-base"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Min $</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amountMin}
            onChange={e => setAmountMin(e.target.value)}
            className="w-24 px-2 py-2 border border-gray-300 rounded-md text-base"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Max $</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amountMax}
            onChange={e => setAmountMax(e.target.value)}
            className="w-24 px-2 py-2 border border-gray-300 rounded-md text-base"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Category</label>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-2 py-2 border border-gray-300 rounded-md text-base"
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
        <p className="text-gray-500">
          {transactions && transactions.length > 0
            ? 'No transactions match your filters.'
            : 'No transactions found.'}
        </p>
      ) : (
        <>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left text-sm font-semibold text-gray-700">
                <th
                  className="px-4 py-2 cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('date')}
                >
                  Date{sortIndicator('date')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('payee')}
                >
                  Payee{sortIndicator('payee')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:bg-gray-200 text-right"
                  onClick={() => handleSort('amount')}
                >
                  Amount{sortIndicator('amount')}
                </th>
                <th
                  className="px-4 py-2 cursor-pointer hover:bg-gray-200"
                  onClick={() => handleSort('account')}
                >
                  Account{sortIndicator('account')}
                </th>
                <th className="px-4 py-2">Category</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(txn => (
                <tr key={txn.id} className="border-b border-gray-200 even:bg-gray-50 hover:bg-gray-100">
                  <td className="px-4 py-2 text-sm">
                    {new Date(txn.date + 'T00:00:00').toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {txn.payee}
                    {txn.isTransfer && (
                      <span className="ml-2 inline-block px-1.5 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                        Transfer
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-2 text-sm text-right ${txn.amount < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatCurrency(txn.amount)}
                  </td>
                  <td className="px-4 py-2 text-sm">{txn.accountName}</td>
                  <td className="px-4 py-2 text-sm">
                    <div className="flex items-center gap-1">
                      {txn.splitCount > 0 ? (
                        <button
                          onClick={() => setSplitTransactionId(txn.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
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
                            <div className="text-xs text-gray-400 mt-0.5" title={`Categorized by rule: ${txn.ruleName}`}>
                              Rule: {txn.ruleName}
                            </div>
                          )}
                        </div>
                      )}
                      {txn.splitCount === 0 && (
                        <button
                          onClick={() => setSplitTransactionId(txn.id)}
                          className="text-xs text-gray-400 hover:text-blue-600"
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
        <div className="md:hidden space-y-2">
          {filtered.map(txn => (
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
