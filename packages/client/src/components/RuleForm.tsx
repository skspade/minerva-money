import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import CategoryPicker from './CategoryPicker';

interface RuleFormProps {
  initialRule?: {
    id: number;
    name: string;
    merchantPattern: string | null;
    matchType: string;
    amountMin: number | null;
    amountMax: number | null;
    memoPattern: string | null;
    categoryId: number;
  };
  onSaved: (ruleId: number) => void;
  onCancel: () => void;
}

export default function RuleForm({ initialRule, onSaved, onCancel }: RuleFormProps) {
  const trpc = useTRPC();
  const isEdit = !!initialRule;

  const [name, setName] = useState(initialRule?.name ?? '');
  const [merchantPattern, setMerchantPattern] = useState(initialRule?.merchantPattern ?? '');
  const [matchType, setMatchType] = useState<'exact' | 'contains'>((initialRule?.matchType as 'exact' | 'contains') ?? 'contains');
  const [amountMinDollars, setAmountMinDollars] = useState(initialRule?.amountMin != null ? (initialRule.amountMin / 100).toString() : '');
  const [amountMaxDollars, setAmountMaxDollars] = useState(initialRule?.amountMax != null ? (initialRule.amountMax / 100).toString() : '');
  const [memoPattern, setMemoPattern] = useState(initialRule?.memoPattern ?? '');
  const [categoryId, setCategoryId] = useState<number | null>(initialRule?.categoryId ?? null);
  const [validationError, setValidationError] = useState('');

  const createMut = useMutation(trpc.rules.create.mutationOptions({
    onSuccess: (data) => {
      onSaved(data.id);
    },
  }));

  const updateMut = useMutation(trpc.rules.update.mutationOptions({
    onSuccess: () => {
      if (initialRule) onSaved(initialRule.id);
    },
  }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');

    const merchant = merchantPattern.trim() || null;
    const memo = memoPattern.trim() || null;
    const amountMin = amountMinDollars ? Math.round(parseFloat(amountMinDollars) * 100) : null;
    const amountMax = amountMaxDollars ? Math.round(parseFloat(amountMaxDollars) * 100) : null;

    if (!merchant && amountMin === null && amountMax === null && !memo) {
      setValidationError('At least one condition (merchant, amount range, or memo) is required.');
      return;
    }

    if (!categoryId) {
      setValidationError('Please select a target category.');
      return;
    }

    const input = {
      name: name.trim(),
      merchantPattern: merchant,
      matchType,
      amountMin,
      amountMax,
      memoPattern: memo,
      categoryId,
    };

    if (isEdit && initialRule) {
      updateMut.mutate({ id: initialRule.id, ...input });
    } else {
      createMut.mutate(input);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-lg p-4 mb-4">
      <h3 className="text-lg font-semibold mb-3">{isEdit ? 'Edit Rule' : 'Create Rule'}</h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-text-primary mb-1">Rule Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-border-heavy rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="e.g., Amazon Groceries"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Merchant Pattern</label>
          <input
            type="text"
            value={merchantPattern}
            onChange={e => setMerchantPattern(e.target.value)}
            className="w-full px-3 py-2 border border-border-heavy rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="e.g., Amazon"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Match Type</label>
          <select
            value={matchType}
            onChange={e => setMatchType(e.target.value as 'exact' | 'contains')}
            className="w-full px-3 py-2 border border-border-heavy rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="contains">Contains</option>
            <option value="exact">Exact Match</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Amount Min ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amountMinDollars}
            onChange={e => setAmountMinDollars(e.target.value)}
            className="w-full px-3 py-2 border border-border-heavy rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="e.g., 10.00"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Amount Max ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amountMaxDollars}
            onChange={e => setAmountMaxDollars(e.target.value)}
            className="w-full px-3 py-2 border border-border-heavy rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="e.g., 100.00"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Memo Pattern</label>
          <input
            type="text"
            value={memoPattern}
            onChange={e => setMemoPattern(e.target.value)}
            className="w-full px-3 py-2 border border-border-heavy rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="e.g., subscription"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Target Category</label>
          <CategoryPicker
            value={categoryId}
            onChange={setCategoryId}
            className="w-full"
          />
        </div>
      </div>

      {validationError && (
        <p className="text-danger text-sm mt-2">{validationError}</p>
      )}

      <div className="flex gap-2 mt-4">
        <button
          type="submit"
          disabled={createMut.isPending || updateMut.isPending}
          className="px-4 py-2 bg-accent text-text-invert text-sm rounded hover:bg-accent-hover disabled:opacity-50 min-h-[44px]"
        >
          {isEdit ? 'Update Rule' : 'Create Rule'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-surface-tertiary text-text-primary text-sm rounded hover:bg-surface-tertiary min-h-[44px]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
