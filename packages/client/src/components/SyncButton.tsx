import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';

export default function SyncButton() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const sync = useMutation(
    trpc.sync.trigger.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.sync.status.queryKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.accounts.list.queryKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.transactions.list.queryKey() }),
        ]);
      },
    }),
  );

  return (
    <button
      onClick={() => sync.mutate()}
      disabled={sync.isPending}
      className="px-3 py-1 text-sm rounded bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-text-invert"
    >
      {sync.isPending ? 'Syncing...' : 'Sync Now'}
    </button>
  );
}
