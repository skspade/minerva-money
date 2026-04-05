import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';

interface RetroactivePreviewProps {
  ruleId: number;
  onClose: () => void;
}

export default function RetroactivePreview({ ruleId, onClose }: RetroactivePreviewProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: preview, isLoading } = useQuery(trpc.rules.preview.queryOptions({ id: ruleId }));

  const applyMut = useMutation(trpc.rules.applyRetroactive.mutationOptions({
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: trpc.transactions.list.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.rules.list.queryKey() });
      alert(`Applied to ${data.updatedCount} transaction(s).`);
      onClose();
    },
  }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col mx-4">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-semibold">Retroactive Preview</h3>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <p className="text-text-secondary">Loading preview...</p>
          ) : !preview || preview.length === 0 ? (
            <p className="text-text-secondary">No existing transactions match this rule.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface-secondary text-left font-semibold text-text-primary">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Payee</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Current</th>
                  <th className="px-3 py-2">Proposed</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(item => (
                  <tr key={item.transactionId} className="border-b border-border">
                    <td className="px-3 py-2">{new Date(item.date + 'T00:00:00').toLocaleDateString()}</td>
                    <td className="px-3 py-2">{item.payee ?? '-'}</td>
                    <td className={`px-3 py-2 text-right ${item.amount < 0 ? 'text-danger' : ''}`}>
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="px-3 py-2 text-text-secondary">{item.currentCategoryName ?? 'Uncategorized'}</td>
                    <td className="px-3 py-2 font-medium text-success">{item.proposedCategoryName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-surface-tertiary text-text-primary text-sm rounded"
          >
            Skip
          </button>
          {preview && preview.length > 0 && (
            <button
              onClick={() => applyMut.mutate({ id: ruleId })}
              disabled={applyMut.isPending}
              className="px-4 py-2 bg-accent text-text-invert text-sm rounded hover:bg-accent-hover disabled:opacity-50"
            >
              Apply to {preview.length} transaction{preview.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
