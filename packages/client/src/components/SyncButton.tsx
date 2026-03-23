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
      className="px-3 py-1 text-sm rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white"
    >
      {sync.isPending ? 'Syncing...' : 'Sync Now'}
    </button>
  );
}
