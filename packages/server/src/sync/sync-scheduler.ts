import { Cron } from 'croner';
import type Database from 'better-sqlite3';
import { runSync } from './sync-service.js';
import { getSimpleFINClient } from './simplefin-client.js';
import { createRateLimiter } from './rate-limiter.js';

let job: Cron | null = null;

export function startSyncScheduler(db: Database.Database): Cron {
  const rateLimiter = createRateLimiter();
  const client = getSimpleFINClient();

  // 6AM and 6PM every day (second minute hour day month weekday)
  job = new Cron('0 0 6,18 * * *', async () => {
    try {
      const result = await runSync(db, client, rateLimiter);
      console.log(
        `[sync-scheduler] Sync complete: ${result.accountsSynced} accounts, ${result.transactionsAdded} transactions added`,
      );
      if (result.errors.length > 0) {
        console.warn(`[sync-scheduler] Sync warnings: ${result.errors.join('; ')}`);
      }
    } catch (err) {
      console.error('[sync-scheduler] Sync failed:', err instanceof Error ? err.message : String(err));
    }
  });

  console.log('[sync-scheduler] Started: syncing at 6:00 AM and 6:00 PM daily');
  return job;
}

export function stopSyncScheduler(): void {
  if (job) {
    job.stop();
    job = null;
    console.log('[sync-scheduler] Stopped');
  }
}
