import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';
import { formatCurrency } from '../lib/format';
import { Link } from 'react-router';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

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

function getLastMonthStart(): string {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;
}

function getLastMonthEnd(): string {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
  return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
}

function formatMonth(): string {
  const now = new Date();
  return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatLastMonth(): string {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return lastMonth.toLocaleDateString('en-US', { month: 'long' });
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
      queryClient.invalidateQueries({ queryKey: trpc.backup.status.queryKey() });
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

  const { data: backupStatus } = useQuery(
    trpc.backup.status.queryOptions(),
  );

  const { data: thisMonthDaily, isLoading: thisMonthLoading } = useQuery(
    trpc.reports.dailySpending.queryOptions({ startDate, endDate }),
  );

  const { data: lastMonthDaily, isLoading: lastMonthLoading } = useQuery(
    trpc.reports.dailySpending.queryOptions({
      startDate: getLastMonthStart(),
      endDate: getLastMonthEnd(),
    }),
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

  // Build cumulative spending comparison data
  const cumulativeData = (() => {
    if (!thisMonthDaily && !lastMonthDaily) return [];

    const thisMonthMap = new Map<number, number>();
    for (const d of thisMonthDaily ?? []) {
      const day = parseInt(d.date.split('-')[2], 10);
      thisMonthMap.set(day, (thisMonthMap.get(day) ?? 0) + d.total);
    }

    const lastMonthMap = new Map<number, number>();
    for (const d of lastMonthDaily ?? []) {
      const day = parseInt(d.date.split('-')[2], 10);
      lastMonthMap.set(day, (lastMonthMap.get(day) ?? 0) + d.total);
    }

    const today = new Date();
    const todayDay = today.getDate();
    const lastMonthLastDay = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    const maxDay = Math.max(todayDay, lastMonthLastDay);

    const result: { day: number; thisMonth?: number; lastMonth?: number }[] = [];
    let cumThis = 0;
    let cumLast = 0;

    for (let day = 1; day <= maxDay; day++) {
      const entry: { day: number; thisMonth?: number; lastMonth?: number } = { day };

      if (day <= todayDay) {
        cumThis += thisMonthMap.get(day) ?? 0;
        entry.thisMonth = cumThis;
      }

      if (day <= lastMonthLastDay) {
        cumLast += lastMonthMap.get(day) ?? 0;
        entry.lastMonth = cumLast;
      }

      result.push(entry);
    }

    return result;
  })();

  const comparisonStat = (() => {
    if (cumulativeData.length === 0) return null;
    const todayDay = new Date().getDate();
    const todayEntry = cumulativeData.find(d => d.day === todayDay);
    if (!todayEntry || todayEntry.thisMonth == null || todayEntry.lastMonth == null) return null;
    return todayEntry.lastMonth - todayEntry.thisMonth; // positive = spending less this month
  })();

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cumulative Spending Comparison */}
        <div className="bg-surface rounded-lg border border-border p-4 md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-text-secondary uppercase tracking-wide font-medium">Spending Pace</h3>
            <Link to="/reports" className="text-sm text-accent hover:text-accent-hover">View reports</Link>
          </div>

          {thisMonthLoading || lastMonthLoading ? (
            <p className="text-text-secondary text-sm">Loading...</p>
          ) : cumulativeData.length === 0 ? (
            <p className="text-text-secondary text-sm">No spending data</p>
          ) : (
            <>
              {comparisonStat != null && (
                <p className="text-sm mb-3">
                  {comparisonStat > 0 ? (
                    <span className="text-success font-medium">
                      {formatCurrency(comparisonStat)} less than this point in {formatLastMonth()}
                    </span>
                  ) : comparisonStat < 0 ? (
                    <span className="text-danger font-medium">
                      {formatCurrency(Math.abs(comparisonStat))} more than this point in {formatLastMonth()}
                    </span>
                  ) : (
                    <span className="text-text-secondary font-medium">
                      Same as this point in {formatLastMonth()}
                    </span>
                  )}
                </p>
              )}
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumulativeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis tickFormatter={(value: number) => formatCurrency(value)} width={80} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name === 'thisMonth' ? 'This Month' : 'Last Month',
                      ]}
                      labelFormatter={(day: number) => `Day ${day}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="thisMonth"
                      stroke="var(--color-chart-primary)"
                      strokeWidth={2}
                      dot={false}
                      name="thisMonth"
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="lastMonth"
                      stroke="var(--color-chart-secondary)"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="lastMonth"
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>

        {/* Account Balances */}
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-text-secondary uppercase tracking-wide font-medium">Accounts</h3>
            <Link to="/accounts" className="text-sm text-accent hover:text-accent-hover">View all</Link>
          </div>

          {accountsLoading ? (
            <p className="text-text-secondary text-sm">Loading...</p>
          ) : !accounts || accounts.length === 0 ? (
            <p className="text-text-secondary text-sm">No accounts found</p>
          ) : (
            <>
              {Array.from(accountsByType.entries()).map(([type, accts]) => (
                <div key={type} className="mb-3">
                  <div className="text-xs text-text-tertiary uppercase mb-1">{type}</div>
                  {accts!.map(a => (
                    <div key={a.id} className="flex justify-between py-1">
                      <span className="text-sm">
                        {a.name}
                        {a.source === 'manual' && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-surface-secondary text-text-secondary">
                            Manual
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-medium">{formatCurrency(a.balance)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="border-t border-border pt-2 mt-2 flex justify-between">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-sm font-bold">{formatCurrency(totalBalance)}</span>
              </div>
            </>
          )}
        </div>

        {/* Budget Progress */}
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-text-secondary uppercase tracking-wide font-medium">Budget - {formatMonth()}</h3>
            <Link to="/budget" className="text-sm text-accent hover:text-accent-hover">View all</Link>
          </div>

          {budgetLoading ? (
            <p className="text-text-secondary text-sm">Loading...</p>
          ) : !budgetData ? (
            <p className="text-text-secondary text-sm">No budget data</p>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-text-secondary">Allocated</span>
                <span className="text-sm font-medium">{formatCurrency(totalAllocated)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-text-secondary">Spent</span>
                <span className="text-sm font-medium">{formatCurrency(totalSpent)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="text-sm font-semibold">Available to Budget</span>
                <span className={`text-sm font-bold ${
                  budgetData.availableToBudget > 0 ? 'text-success' :
                  budgetData.availableToBudget < 0 ? 'text-danger' :
                  'text-text-secondary'
                }`}>
                  {formatCurrency(budgetData.availableToBudget)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Top Spending Categories */}
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-text-secondary uppercase tracking-wide font-medium">Top Spending - {formatMonth()}</h3>
            <Link to="/reports" className="text-sm text-accent hover:text-accent-hover">View reports</Link>
          </div>

          {spendingLoading ? (
            <p className="text-text-secondary text-sm">Loading...</p>
          ) : top5.length === 0 ? (
            <p className="text-text-secondary text-sm">No spending this month</p>
          ) : (
            <div className="space-y-2">
              {top5.map((cat, i) => (
                <div key={cat.categoryId} className="flex justify-between py-1">
                  <span className="text-sm">
                    <span className="text-text-tertiary mr-2">{i + 1}.</span>
                    {cat.categoryName}
                  </span>
                  <span className="text-sm font-medium">{formatCurrency(cat.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sync Status */}
        <div className="bg-surface rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-text-secondary uppercase tracking-wide font-medium">Sync Status</h3>
            <button
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending}
              className="text-sm text-accent hover:text-accent-hover disabled:text-text-tertiary disabled:cursor-not-allowed"
            >
              {syncMut.isPending ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          {syncLoading ? (
            <p className="text-text-secondary text-sm">Loading...</p>
          ) : !syncStatus?.lastSync ? (
            <div>
              <p className="text-text-secondary text-sm">No syncs recorded</p>
              {syncMut.isError && (
                <div className="mt-2 p-2 bg-danger-light rounded text-sm text-danger">
                  {syncMut.error.message}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-text-secondary">Last successful sync</span>
                <span className="text-sm">
                  {syncStatus.lastSync.status === 'success'
                    ? new Date(syncStatus.lastSync.completedAt || syncStatus.lastSync.startedAt).toLocaleString()
                    : syncStatus.lastSuccessAt
                      ? new Date(syncStatus.lastSuccessAt).toLocaleString()
                      : 'Never'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-text-secondary">Status</span>
                <span className={`text-sm font-medium ${
                  syncStatus.lastSync.status === 'success' ? 'text-success' :
                  syncStatus.lastSync.status === 'partial' ? 'text-warning' : 'text-danger'
                }`}>
                  {syncStatus.lastSync.status.charAt(0).toUpperCase() + syncStatus.lastSync.status.slice(1)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-sm text-text-secondary">Accounts synced</span>
                <span className="text-sm">{syncStatus.lastSync.accountsSynced}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-text-secondary">Transactions added</span>
                <span className="text-sm">{syncStatus.lastSync.transactionsAdded}</span>
              </div>
              {syncStatus.warnings && syncStatus.warnings.length > 0 && (
                <div className="mt-2 p-2 bg-warning-light border border-warning rounded">
                  <div className="space-y-1">
                    {syncStatus.warnings.map(w => (
                      <div key={w.accountId} className="text-sm flex justify-between gap-2">
                        <span className="font-medium text-warning">{w.accountName}</span>
                        <span className="text-warning text-right">{w.message}</span>
                      </div>
                    ))}
                  </div>
                  {syncStatus.warnings.some(w => /auth|connection|institution/i.test(w.errorCode)) && (
                    <a
                      href="https://bridge.simplefin.org/simplefin/my-connections"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm text-warning underline hover:text-accent-hover"
                    >
                      Reconnect at SimpleFIN
                      <span aria-hidden="true">&#8599;</span>
                    </a>
                  )}
                </div>
              )}
              {syncStatus.lastSync.errorMessage && (
                <div className="mt-2 p-2 bg-danger-light rounded text-sm text-danger">
                  {syncStatus.lastSync.errorMessage}
                </div>
              )}
              {syncMut.isError && (
                <div className="mt-2 p-2 bg-danger-light rounded text-sm text-danger">
                  {syncMut.error.message}
                </div>
              )}
              {syncMut.data?.errors && syncMut.data.errors.length > 0 && (
                <div className="mt-2 p-2 bg-warning-light border border-warning rounded">
                  <div className="space-y-1">
                    {syncMut.data.errors.map((err, i) => (
                      <div key={i} className="text-sm text-warning">{err}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Backup Status */}
          <div className="border-t border-border pt-2 mt-2">
            <div className="text-xs text-text-tertiary uppercase mb-1">Backup</div>
            {backupStatus?.lastBackup ? (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Last backup</span>
                  <span className="text-sm">{new Date(backupStatus.lastBackup.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Size</span>
                  <span className="text-sm font-medium">{(backupStatus.lastBackup.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-text-secondary">Storage</span>
                  {backupStatus.lastBackup.isCloud ? (
                    <span className="text-sm font-medium text-success">iCloud</span>
                  ) : (
                    <span className="text-sm font-medium text-warning">Local only</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-text-secondary text-sm">No backups found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
