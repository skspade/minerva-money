import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Drawer } from 'vaul';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';
import CategoryPicker from './CategoryPicker';

interface SplitRow {
  categoryId: number | null;
  amountStr: string;
}

interface SplitModalProps {
  transaction: { id: string; amount: number; payee: string };
  hasSplits: boolean;
  onClose: () => void;
}

export default function SplitModal({ transaction, hasSplits, onClose }: SplitModalProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [splits, setSplits] = useState<SplitRow[]>([
    { categoryId: null, amountStr: '' },
    { categoryId: null, amountStr: '' },
  ]);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.transactions.list.queryKey() });

  const createSplitsMut = useMutation(trpc.transactions.createSplits.mutationOptions({ onSuccess: () => { invalidate(); onClose(); } }));
  const deleteSplitsMut = useMutation(trpc.transactions.deleteSplits.mutationOptions({ onSuccess: () => { invalidate(); onClose(); } }));

  const totalCents = Math.abs(transaction.amount);

  const parseCents = (str: string): number => {
    const val = parseFloat(str);
    if (isNaN(val)) return 0;
    return Math.round(val * 100);
  };

  const splitTotal = splits.reduce((sum, s) => sum + parseCents(s.amountStr), 0);
  const remaining = totalCents - splitTotal;

  const handleSave = () => {
    setError('');

    const parsed = splits
      .filter(s => s.amountStr.trim() !== '')
      .map(s => ({
        categoryId: s.categoryId,
        amount: parseCents(s.amountStr),
      }));

    if (parsed.length === 0) {
      setError('Add at least one split with an amount.');
      return;
    }

    if (parsed.some(s => s.categoryId === null)) {
      setError('All splits must have a category selected.');
      return;
    }

    const sum = parsed.reduce((acc, s) => acc + s.amount, 0);
    if (sum !== totalCents) {
      setError(`Split amounts must sum to ${formatCurrency(totalCents)} (currently ${formatCurrency(sum)}).`);
      return;
    }

    createSplitsMut.mutate({
      transactionId: transaction.id,
      splits: parsed.map(s => ({ categoryId: s.categoryId!, amount: s.amount })),
    });
  };

  const updateSplit = (index: number, updates: Partial<SplitRow>) => {
    setSplits(prev => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  const removeSplit = (index: number) => {
    setSplits(prev => prev.filter((_, i) => i !== index));
  };

  const header = (
    <div className="flex justify-between items-start mb-4">
      <div>
        <h3 className="text-lg font-semibold">Split Transaction</h3>
        <p className="text-sm text-gray-500">{transaction.payee} — {formatCurrency(transaction.amount)}</p>
      </div>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl max-md:hidden">✕</button>
    </div>
  );

  const splitRows = (
    <div className="space-y-3 mb-4">
      {splits.map((split, i) => (
        <div key={i} className="flex items-center gap-2 max-md:flex-col max-md:gap-2 max-md:items-stretch">
          <CategoryPicker
            value={split.categoryId}
            onChange={categoryId => updateSplit(i, { categoryId })}
            className="flex-1"
          />
          <div className="relative max-md:w-full">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
            <input
              type="text"
              value={split.amountStr}
              onChange={e => updateSplit(i, { amountStr: e.target.value })}
              placeholder="0.00"
              className="w-24 max-md:w-full pl-5 pr-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-right"
            />
          </div>
          {splits.length > 1 && (
            <button
              onClick={() => removeSplit(i)}
              className="text-gray-400 hover:text-red-500 text-sm"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );

  const addButton = (
    <button
      onClick={() => setSplits(prev => [...prev, { categoryId: null, amountStr: '' }])}
      className="text-sm text-blue-600 hover:text-blue-800 mb-4"
    >
      + Add Split
    </button>
  );

  const remainingDisplay = (
    <div className={`text-sm mb-4 ${remaining === 0 ? 'text-green-600' : 'text-red-600'}`}>
      Remaining: {formatCurrency(remaining)}
    </div>
  );

  const errorDisplay = error ? <p className="text-sm text-red-600 mb-3">{error}</p> : null;

  const actions = (
    <div className="flex justify-between">
      <div>
        {hasSplits && (
          <button
            onClick={() => deleteSplitsMut.mutate({ transactionId: transaction.id })}
            className="text-sm text-red-600 hover:text-red-800"
          >
            Remove Splits
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 min-h-[44px]"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={createSplitsMut.isPending}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
        >
          {createSplitsMut.isPending ? 'Saving...' : 'Save Splits'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop modal */}
      <div className="fixed inset-0 bg-black/40 hidden md:flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
          {header}
          {splitRows}
          {addButton}
          {remainingDisplay}
          {errorDisplay}
          {actions}
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <Drawer.Root open={true} onOpenChange={(o) => !o && onClose()}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 md:hidden" />
          <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl max-h-[90svh] flex flex-col pb-safe md:hidden">
            <div className="mx-auto w-12 h-1.5 bg-gray-300 rounded-full mt-3 mb-2 flex-shrink-0" />
            <div className="overflow-y-auto flex-1 px-4 py-4">
              {header}
              {splitRows}
              {addButton}
              {remainingDisplay}
              {errorDisplay}
            </div>
            <div className="flex-shrink-0 px-4 py-3 border-t">
              {actions}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
