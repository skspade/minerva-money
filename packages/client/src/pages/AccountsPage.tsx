import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';

export default function AccountsPage() {
  const trpc = useTRPC();
  const { data: accounts, isLoading, error } = useQuery(trpc.accounts.list.queryOptions());

  if (isLoading) {
    return <p className="text-gray-500">Loading accounts...</p>;
  }

  if (error) {
    return <p className="text-red-600">Error loading accounts: {error.message}</p>;
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4">Accounts</h2>
        <p className="text-gray-500">No accounts synced yet. Use Sync Now to get started.</p>
      </div>
    );
  }

  const bankingAccounts = accounts.filter(a => a.type !== 'investment');
  const investmentAccounts = accounts.filter(a => a.type === 'investment');

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Accounts</h2>

      {bankingAccounts.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Banking</h3>
          <div className="space-y-3">
            {bankingAccounts.map(account => (
              <div
                key={account.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-gray-900">{account.name}</p>
                  <p className="text-sm text-gray-500">{account.institution}</p>
                  {account.lastSynced && (
                    <p className="text-xs text-gray-400 mt-1">
                      Last synced: {new Date(account.lastSynced).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <p className={`text-lg font-semibold ${account.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatCurrency(account.balance)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {investmentAccounts.length > 0 && (
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">Investments</h3>
          <div className="space-y-3">
            {investmentAccounts.map(account => (
              <div
                key={account.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-gray-900">{account.name}</p>
                  <p className="text-sm text-gray-500">{account.institution}</p>
                  <p className="text-xs text-gray-400 mt-1">Balance only</p>
                </div>
                <p className={`text-lg font-semibold ${account.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatCurrency(account.balance)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
