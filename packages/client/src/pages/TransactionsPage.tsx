import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';
import CategoryPicker from '../components/CategoryPicker';
import SplitModal from '../components/SplitModal';
import ManualTransactionForm from '../components/ManualTransactionForm';

type SortColumn = 'date' | 'payee' | 'amount' | 'account';
type SortDirection = 'asc' | 'desc';

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
  const [splitTransactionId, setSplitTransactionId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

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

    let result = [...transactions];

    if (dateFrom) {
      result = result.filter(t => t.date >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(t => t.date <= dateTo);
    }

    if (debouncedSearch) {
      const search = debouncedSearch.toLowerCase();
      result = result.filter(
        t =>
          t.payee.toLowerCase().includes(search) ||
          (t.memo && t.memo.toLowerCase().includes(search)),
      );
    }

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
  }, [transactions, dateFrom, dateTo, debouncedSearch, sortColumn, sortDirection]);

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

      {showAddForm && <ManualTransactionForm onClose={() => setShowAddForm(false)} />}

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div className="flex-1 min-w-48">
          <input
            type="text"
            placeholder="Search payee or memo..."
            value={inputValue}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-2 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500">
          {transactions && transactions.length > 0
            ? 'No transactions match your filters.'
            : 'No transactions found.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
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
                  <td className="px-4 py-2 text-sm">{txn.payee}</td>
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
                        <CategoryPicker
                          value={txn.categoryId}
                          onChange={categoryId => updateCategoryMut.mutate({ transactionId: txn.id, categoryId })}
                        />
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
