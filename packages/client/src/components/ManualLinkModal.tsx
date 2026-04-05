import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Drawer } from 'vaul';
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

  const transactionPanel = (label: string, search: string, onSearch: (v: string) => void, filtered: typeof filteredA, selected: string | null, onSelect: (id: string) => void) => (
    <div>
      <label className="block text-sm font-medium text-text-primary mb-1">{label}</label>
      <input
        type="text"
        placeholder="Search payee or memo..."
        value={search}
        onChange={e => onSearch(e.target.value)}
        className="w-full px-3 py-2 border border-border-heavy rounded-md text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <div className="border rounded-md max-h-60 overflow-y-auto">
        {filtered.map(txn => (
          <button
            key={txn.id}
            onClick={() => onSelect(txn.id)}
            className={`w-full text-left px-3 py-2 max-md:py-3 text-sm border-b last:border-b-0 hover:bg-surface-alt ${
              selected === txn.id ? 'bg-accent-light border-accent' : ''
            }`}
          >
            <div className="flex justify-between">
              <span className="font-medium">{txn.payee}</span>
              <span className={txn.amount < 0 ? 'text-danger' : ''}>{formatCurrency(txn.amount)}</span>
            </div>
            <div className="text-xs text-text-secondary">
              {new Date(txn.date + 'T00:00:00').toLocaleDateString()} &middot; {txn.accountName}
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-sm text-text-secondary">No transactions found.</p>
        )}
      </div>
    </div>
  );

  const header = (
    <div className="flex items-center justify-between p-4 border-b">
      <h3 className="text-lg font-semibold">Link Transactions as Transfer</h3>
      <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary text-xl max-md:hidden">&times;</button>
    </div>
  );

  const panelGrid = (
    <div className="p-4 grid grid-cols-2 max-md:grid-cols-1 gap-4">
      {transactionPanel('Transaction A', searchA, handleSearchA, filteredA, selectedA, setSelectedA)}
      {transactionPanel('Transaction B', searchB, handleSearchB, filteredB, selectedB, setSelectedB)}
    </div>
  );

  const errorDisplay = errorMsg ? (
    <div className="px-4 pb-2">
      <p className="text-sm text-danger">{errorMsg}</p>
    </div>
  ) : null;

  const actionButtons = (
    <div className="flex justify-end gap-3 p-4 border-t">
      <button
        onClick={onClose}
        className="px-4 py-2 text-sm text-text-primary bg-surface-secondary rounded hover:bg-surface-tertiary min-h-[44px]"
      >
        Cancel
      </button>
      <button
        onClick={handleLink}
        disabled={!selectedA || !selectedB || selectedA === selectedB || linkMut.isPending}
        className="px-4 py-2 text-sm text-text-invert bg-accent rounded hover:bg-accent-hover disabled:opacity-50 min-h-[44px]"
      >
        Link as Transfer
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop modal */}
      <div className="fixed inset-0 bg-black/50 hidden md:flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-surface rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
          {header}
          {panelGrid}
          {errorDisplay}
          {actionButtons}
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <Drawer.Root open={true} onOpenChange={(o) => !o && onClose()}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 md:hidden" />
          <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-surface rounded-t-2xl max-h-[90svh] flex flex-col pb-safe md:hidden">
            <div className="mx-auto w-12 h-1.5 bg-surface-tertiary rounded-full mt-3 mb-2 flex-shrink-0" />
            <div className="overflow-y-auto flex-1">
              {header}
              {panelGrid}
              {errorDisplay}
            </div>
            <div className="flex-shrink-0">
              {actionButtons}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
