import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import CategoryPicker from './CategoryPicker';

interface ManualTransactionFormProps {
  onClose: () => void;
}

export default function ManualTransactionForm({ onClose }: ManualTransactionFormProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: accounts } = useQuery(trpc.accounts.list.queryOptions());

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [payee, setPayee] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMut = useMutation(trpc.transactions.create.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.transactions.list.queryKey() });
      onClose();
    },
  }));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!payee.trim()) {
      errs.payee = 'Payee is required';
    }

    const parsedAmount = parseFloat(amountStr);
    if (isNaN(parsedAmount) || parsedAmount === 0) {
      errs.amount = 'Amount is required';
    }

    if (!accountId) {
      errs.account = 'Account is required';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const cents = Math.round(parseFloat(amountStr) * 100);

    createMut.mutate({
      accountId,
      date,
      amount: cents,
      payee: payee.trim(),
      memo: memo.trim() || undefined,
      categoryId: categoryId ?? undefined,
    });
  };

  return (
    <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Add Transaction</h3>
      <div className="flex flex-wrap gap-3 items-start max-md:flex-col">
        <div className="flex flex-col">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-col flex-1 min-w-32 max-md:w-full">
          <input
            type="text"
            value={payee}
            onChange={e => { setPayee(e.target.value); setErrors(prev => ({ ...prev, payee: '' })); }}
            placeholder="Payee name"
            className={`px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 max-md:w-full ${errors.payee ? 'border-red-400' : 'border-gray-300'}`}
          />
          {errors.payee && <span className="text-xs text-red-600 mt-0.5">{errors.payee}</span>}
        </div>

        <div className="flex flex-col w-28 max-md:w-full">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
            <input
              type="text"
              value={amountStr}
              onChange={e => { setAmountStr(e.target.value); setErrors(prev => ({ ...prev, amount: '' })); }}
              placeholder="-0.00"
              className={`w-full pl-5 pr-2 py-1.5 border rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ${errors.amount ? 'border-red-400' : 'border-gray-300'}`}
            />
          </div>
          {errors.amount && <span className="text-xs text-red-600 mt-0.5">{errors.amount}</span>}
        </div>

        <div className="flex flex-col max-md:w-full">
          <select
            value={accountId}
            onChange={e => { setAccountId(e.target.value); setErrors(prev => ({ ...prev, account: '' })); }}
            className={`px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${errors.account ? 'border-red-400' : 'border-gray-300'}`}
          >
            <option value="">Select account</option>
            {accounts?.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {errors.account && <span className="text-xs text-red-600 mt-0.5">{errors.account}</span>}
        </div>

        <div className="flex flex-col max-md:w-full">
          <CategoryPicker value={categoryId} onChange={setCategoryId} />
        </div>

        <div className="flex flex-col flex-1 min-w-32 max-md:w-full">
          <input
            type="text"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="Memo (optional)"
            className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 max-md:w-full"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={createMut.isPending}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {createMut.isPending ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
