import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';
import ManualLinkModal from '../components/ManualLinkModal';

export default function TransfersPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showManualLink, setShowManualLink] = useState(false);

  const { data: candidates, isLoading: loadingCandidates } = useQuery(
    trpc.transfers.candidates.list.queryOptions(),
  );
  const { data: confirmed, isLoading: loadingConfirmed } = useQuery(
    trpc.transfers.confirmed.list.queryOptions(),
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: trpc.transfers.candidates.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.transfers.confirmed.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.transactions.list.queryKey() });
  };

  const confirmMut = useMutation(trpc.transfers.confirm.mutationOptions({
    onSuccess: invalidateAll,
  }));

  const dismissMut = useMutation(trpc.transfers.dismiss.mutationOptions({
    onSuccess: invalidateAll,
  }));

  const unlinkMut = useMutation(trpc.transfers.unlink.mutationOptions({
    onSuccess: invalidateAll,
  }));

  const isLoading = loadingCandidates || loadingConfirmed;

  if (isLoading) {
    return <p className="text-text-secondary">Loading transfers...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Transfers</h2>
        <button
          onClick={() => setShowManualLink(true)}
          className="px-3 py-1.5 bg-accent text-text-invert text-sm rounded hover:bg-accent-hover"
        >
          Link Transfers
        </button>
      </div>

      {/* Suggested Transfers */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-3">Suggested Transfers</h3>
        {!candidates || candidates.length === 0 ? (
          <p className="text-text-secondary">No suggested transfers.</p>
        ) : (
          <div className="space-y-3">
            {candidates.map(pair => (
              <div key={pair.id} className="bg-surface rounded-lg shadow p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{pair.transactionA.payee}</div>
                    <div className="text-xs text-text-secondary">
                      {new Date(pair.transactionA.date + 'T00:00:00').toLocaleDateString()} &middot; {pair.transactionA.accountName}
                    </div>
                    <div className={`text-sm font-medium ${pair.transactionA.amount < 0 ? 'text-danger' : 'text-text-primary'}`}>
                      {formatCurrency(pair.transactionA.amount)}
                    </div>
                  </div>
                  <div className="text-text-tertiary text-lg">&#8644;</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{pair.transactionB.payee}</div>
                    <div className="text-xs text-text-secondary">
                      {new Date(pair.transactionB.date + 'T00:00:00').toLocaleDateString()} &middot; {pair.transactionB.accountName}
                    </div>
                    <div className={`text-sm font-medium ${pair.transactionB.amount < 0 ? 'text-danger' : 'text-text-primary'}`}>
                      {formatCurrency(pair.transactionB.amount)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmMut.mutate({ id: pair.id })}
                      disabled={confirmMut.isPending}
                      className="px-3 py-1.5 bg-success text-text-invert text-sm rounded hover:bg-success disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => dismissMut.mutate({ id: pair.id })}
                      disabled={dismissMut.isPending}
                      className="px-3 py-1.5 bg-surface-tertiary text-text-primary text-sm rounded hover:bg-surface-tertiary disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Confirmed Transfers */}
      <section>
        <h3 className="text-lg font-semibold mb-3">Confirmed Transfers</h3>
        {!confirmed || confirmed.length === 0 ? (
          <p className="text-text-secondary">No confirmed transfers.</p>
        ) : (
          <div className="space-y-3">
            {confirmed.map(pair => (
              <div key={pair.id} className="bg-surface rounded-lg shadow p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{pair.transactionA.payee}</div>
                    <div className="text-xs text-text-secondary">
                      {new Date(pair.transactionA.date + 'T00:00:00').toLocaleDateString()} &middot; {pair.transactionA.accountName}
                    </div>
                    <div className={`text-sm font-medium ${pair.transactionA.amount < 0 ? 'text-danger' : 'text-text-primary'}`}>
                      {formatCurrency(pair.transactionA.amount)}
                    </div>
                  </div>
                  <div className="text-text-tertiary text-lg">&#8644;</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{pair.transactionB.payee}</div>
                    <div className="text-xs text-text-secondary">
                      {new Date(pair.transactionB.date + 'T00:00:00').toLocaleDateString()} &middot; {pair.transactionB.accountName}
                    </div>
                    <div className={`text-sm font-medium ${pair.transactionB.amount < 0 ? 'text-danger' : 'text-text-primary'}`}>
                      {formatCurrency(pair.transactionB.amount)}
                    </div>
                  </div>
                  <button
                    onClick={() => unlinkMut.mutate({ id: pair.id })}
                    disabled={unlinkMut.isPending}
                    className="px-3 py-1.5 border border-danger text-danger text-sm rounded hover:bg-danger-light disabled:opacity-50"
                  >
                    Unlink
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showManualLink && (
        <ManualLinkModal
          onClose={() => setShowManualLink(false)}
          onLinked={invalidateAll}
        />
      )}
    </div>
  );
}
