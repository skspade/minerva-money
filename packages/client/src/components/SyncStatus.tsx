import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../trpc';

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

export default function SyncStatus() {
  const trpc = useTRPC();
  const { data: status } = useQuery({
    ...trpc.sync.status.queryOptions(undefined),
    refetchInterval: 30000,
  });

  if (!status) return null;

  if (!status.lastSync) {
    return <span className="text-sm text-gray-400">Never synced</span>;
  }

  if (status.lastSync.status === 'running') {
    return <span className="text-sm text-blue-300">Syncing...</span>;
  }

  if (status.lastSync.status === 'error') {
    return (
      <span className="text-sm text-red-400" title={status.lastSync.errorMessage ?? undefined}>
        Sync error: {status.lastSync.errorMessage || 'Unknown error'}
      </span>
    );
  }

  if (status.lastSync.status === 'partial') {
    const syncTime = status.lastSync.completedAt || status.lastSync.startedAt;
    const tooltip = status.warnings.length > 0
      ? `${status.warnings.length} account(s) with sync issues: ${status.warnings.map(w => w.accountName).join(', ')}`
      : 'Some accounts had sync issues';

    return (
      <span className="text-sm text-amber-400" title={tooltip}>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 align-middle" />
        Last synced: {formatRelativeTime(syncTime)}
      </span>
    );
  }

  const syncTime = status.lastSync.completedAt || status.lastSync.startedAt;
  return (
    <span className="text-sm text-gray-400">
      Last synced: {formatRelativeTime(syncTime)}
    </span>
  );
}
