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
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col mx-4">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Retroactive Preview</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <p className="text-gray-500">Loading preview...</p>
          ) : !preview || preview.length === 0 ? (
            <p className="text-gray-500">No existing transactions match this rule.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 text-left font-semibold text-gray-700">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Payee</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Current</th>
                  <th className="px-3 py-2">Proposed</th>
                </tr>
              </thead>
              <tbody>
                {preview.map(item => (
                  <tr key={item.transactionId} className="border-b border-gray-200">
                    <td className="px-3 py-2">{new Date(item.date + 'T00:00:00').toLocaleDateString()}</td>
                    <td className="px-3 py-2">{item.payee ?? '-'}</td>
                    <td className={`px-3 py-2 text-right ${item.amount < 0 ? 'text-red-600' : ''}`}>
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{item.currentCategoryName ?? 'Uncategorized'}</td>
                    <td className="px-3 py-2 font-medium text-green-700">{item.proposedCategoryName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
          >
            Skip
          </button>
          {preview && preview.length > 0 && (
            <button
              onClick={() => applyMut.mutate({ id: ruleId })}
              disabled={applyMut.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Apply to {preview.length} transaction{preview.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
