import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';
import { Link } from 'react-router';

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthStart(): string {
  return `${getCurrentPeriod()}-01`;
}

function getToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatMonth(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function DashboardPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const period = getCurrentPeriod();
  const startDate = getMonthStart();
  const endDate = getToday();

  const syncMut = useMutation(trpc.sync.trigger.mutationOptions({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.sync.status.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.accounts.list.queryKey() });
    },
  }));

  const { data: accounts, isLoading: accountsLoading } = useQuery(
    trpc.accounts.list.queryOptions(),
  );

  const { data: budgetData, isLoading: budgetLoading } = useQuery(
    trpc.budget.summary.queryOptions({ period }),
  );

  const { data: topSpending, isLoading: spendingLoading } = useQuery(
    trpc.reports.spendingByCategory.queryOptions({ startDate, endDate }),
  );

  const { data: syncStatus, isLoading: syncLoading } = useQuery(
    trpc.sync.status.queryOptions(),
  );

  // Group accounts by type
  const accountsByType = new Map<string, typeof accounts>();
  if (accounts) {
    for (const acct of accounts) {
      const group = accountsByType.get(acct.type) || [];
      group.push(acct);
      accountsByType.set(acct.type, group);
    }
  }

  const totalBalance = accounts?.reduce((sum, a) => sum + a.balance, 0) ?? 0;

  const totalAllocated = budgetData?.categories.reduce((sum, c) => sum + c.allocated, 0) ?? 0;
  const totalSpent = budgetData?.categories.reduce((sum, c) => sum + c.spent, 0) ?? 0;

  const top5 = topSpending?.slice(0, 5) ?? [];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Account Balances */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-gray-500 uppercase tracking-wide font-medium">Accounts</h3>
            <Link to="/accounts" className="text-sm text-blue-600 hover:text-blue-800">View all</Link>
          </div>

          {accountsLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : !accounts || accounts.length === 0 ? (
            <p className="text-gray-500 text-sm">No accounts found</p>
          ) : (
            <>
              {Array.from(accountsByType.entries()).map(([type, accts]) => (
                <div key={type} className="mb-3">
                  <div className="text-xs text-gray-400 uppercase mb-1">{type}</div>
                  {accts!.map(a => (
                    <div key={a.id} className="flex justify-between py-1">
                      <span className="text-sm">{a.name}</span>
                      <span className="text-sm font-medium">{formatCurrency(a.balance)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-sm font-bold">{formatCurrency(totalBalance)}</span>
              </div>
            </>
          )}
        </div>

        {/* Budget Progress */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-gray-500 uppercase tracking-wide font-medium">Budget - {formatMonth()}</h3>
            <Link to="/budget" className="text-sm text-blue-600 hover:text-blue-800">View all</Link>
          </div>

          {budgetLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : !budgetData ? (
            <p className="text-gray-500 text-sm">No budget data</p>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Allocated</span>
                <span className="text-sm font-medium">{formatCurrency(totalAllocated)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Spent</span>
                <span className="text-sm font-medium">{formatCurrency(totalSpent)}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="text-sm font-semibold">Available to Budget</span>
                <span className={`text-sm font-bold ${
                  budgetData.availableToBudget > 0 ? 'text-green-600' :
                  budgetData.availableToBudget < 0 ? 'text-red-600' :
                  'text-gray-500'
                }`}>
                  {formatCurrency(budgetData.availableToBudget)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Top Spending Categories */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-gray-500 uppercase tracking-wide font-medium">Top Spending - {formatMonth()}</h3>
            <Link to="/reports" className="text-sm text-blue-600 hover:text-blue-800">View reports</Link>
          </div>

          {spendingLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : top5.length === 0 ? (
            <p className="text-gray-500 text-sm">No spending this month</p>
          ) : (
            <div className="space-y-2">
              {top5.map((cat, i) => (
                <div key={cat.categoryId} className="flex justify-between py-1">
                  <span className="text-sm">
                    <span className="text-gray-400 mr-2">{i + 1}.</span>
                    {cat.categoryName}
                  </span>
                  <span className="text-sm font-medium">{formatCurrency(cat.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sync Status */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-gray-500 uppercase tracking-wide font-medium">Sync Status</h3>
            <button
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
              className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {syncMut.isPending ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          {syncLoading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : !syncStatus?.lastSync ? (
            <div>
              <p className="text-gray-500 text-sm">No syncs recorded</p>
              {syncMut.isError && (
                <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
                  {syncMut.error.message}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Last sync</span>
                <span className="text-sm">{new Date(syncStatus.lastSync.startedAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Status</span>
                <span className={`text-sm font-medium ${
                  syncStatus.lastSync.status === 'success' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {syncStatus.lastSync.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Accounts synced</span>
                <span className="text-sm">{syncStatus.lastSync.accountsSynced}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Transactions added</span>
                <span className="text-sm">{syncStatus.lastSync.transactionsAdded}</span>
              </div>
              {syncStatus.lastSync.errorMessage && (
                <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
                  {syncStatus.lastSync.errorMessage}
                </div>
              )}
              {syncMut.isError && (
                <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
                  {syncMut.error.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
