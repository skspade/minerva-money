import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';

interface ManualLinkModalProps {
  onClose: () => void;
  onLinked: () => void;
}

export default function ManualLinkModal({ onClose, onLinked }: ManualLinkModalProps) {
  const trpc = useTRPC();
  const { data: transactions } = useQuery(trpc.transactions.list.queryOptions());

  const [searchA, setSearchA] = useState('');
  const [searchB, setSearchB] = useState('');
  const [debouncedA, setDebouncedA] = useState('');
  const [debouncedB, setDebouncedB] = useState('');
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const timerARef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const timerBRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(timerARef.current);
      clearTimeout(timerBRef.current);
    };
  }, []);

  const handleSearchA = useCallback((value: string) => {
    setSearchA(value);
    clearTimeout(timerARef.current);
    timerARef.current = setTimeout(() => setDebouncedA(value), 200);
  }, []);

  const handleSearchB = useCallback((value: string) => {
    setSearchB(value);
    clearTimeout(timerBRef.current);
    timerBRef.current = setTimeout(() => setDebouncedB(value), 200);
  }, []);

  const filterTxns = useCallback((search: string) => {
    if (!transactions) return [];
    if (!search) return transactions.slice(0, 50);
    const lower = search.toLowerCase();
    return transactions.filter(
      t => t.payee.toLowerCase().includes(lower) || (t.memo && t.memo.toLowerCase().includes(lower)),
    ).slice(0, 50);
  }, [transactions]);

  const filteredA = useMemo(() => filterTxns(debouncedA), [filterTxns, debouncedA]);
  const filteredB = useMemo(() => filterTxns(debouncedB), [filterTxns, debouncedB]);

  const linkMut = useMutation(trpc.transfers.manualLink.mutationOptions({
    onSuccess: () => {
      onLinked();
      onClose();
    },
    onError: (err) => {
      setErrorMsg(err.message);
    },
  }));

  const handleLink = () => {
    if (!selectedA || !selectedB) return;
    setErrorMsg(null);
    linkMut.mutate({ transactionAId: selectedA, transactionBId: selectedB });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Link Transactions as Transfer</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="p-4 grid grid-cols-2 gap-4">
          {/* Transaction A */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Transaction A</label>
            <input
              type="text"
              placeholder="Search payee or memo..."
              value={searchA}
              onChange={e => handleSearchA(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="border rounded-md max-h-60 overflow-y-auto">
              {filteredA.map(txn => (
                <button
                  key={txn.id}
                  onClick={() => setSelectedA(txn.id)}
                  className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 hover:bg-gray-50 ${
                    selectedA === txn.id ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                >
                  <div className="flex justify-between">
                    <span className="font-medium">{txn.payee}</span>
                    <span className={txn.amount < 0 ? 'text-red-600' : ''}>{formatCurrency(txn.amount)}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(txn.date + 'T00:00:00').toLocaleDateString()} &middot; {txn.accountName}
                  </div>
                </button>
              ))}
              {filteredA.length === 0 && (
                <p className="px-3 py-2 text-sm text-gray-500">No transactions found.</p>
              )}
            </div>
          </div>

          {/* Transaction B */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Transaction B</label>
            <input
              type="text"
              placeholder="Search payee or memo..."
              value={searchB}
              onChange={e => handleSearchB(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="border rounded-md max-h-60 overflow-y-auto">
              {filteredB.map(txn => (
                <button
                  key={txn.id}
                  onClick={() => setSelectedB(txn.id)}
                  className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 hover:bg-gray-50 ${
                    selectedB === txn.id ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                >
                  <div className="flex justify-between">
                    <span className="font-medium">{txn.payee}</span>
                    <span className={txn.amount < 0 ? 'text-red-600' : ''}>{formatCurrency(txn.amount)}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(txn.date + 'T00:00:00').toLocaleDateString()} &middot; {txn.accountName}
                  </div>
                </button>
              ))}
              {filteredB.length === 0 && (
                <p className="px-3 py-2 text-sm text-gray-500">No transactions found.</p>
              )}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="px-4 pb-2">
            <p className="text-sm text-red-600">{errorMsg}</p>
          </div>
        )}

        <div className="flex justify-end gap-3 p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleLink}
            disabled={!selectedA || !selectedB || selectedA === selectedB || linkMut.isPending}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Link as Transfer
          </button>
        </div>
      </div>
    </div>
  );
}
