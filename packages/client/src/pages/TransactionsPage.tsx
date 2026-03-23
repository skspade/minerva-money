import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';

type SortColumn = 'date' | 'payee' | 'amount' | 'account';
type SortDirection = 'asc' | 'desc';

export default function TransactionsPage() {
  const trpc = useTRPC();
  const { data: transactions, isLoading, error } = useQuery(trpc.transactions.list.queryOptions(undefined));

  const [inputValue, setInputValue] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
      <h2 className="text-2xl font-bold mb-4">Transactions</h2>

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
                  <td className="px-4 py-2 text-sm text-gray-400">Uncategorized</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
