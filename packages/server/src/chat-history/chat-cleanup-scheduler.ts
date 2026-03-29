import { Cron } from 'croner';
import type Database from 'better-sqlite3';
import { purgeOldConversations } from './chat-history-service.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';

let job: Cron | null = null;

function encodeCwd(): string {
  return process.cwd().replace(/[^a-zA-Z0-9]/g, '-');
}

export function startChatCleanupScheduler(db: Database.Database): void {
  // Daily at 3:00 AM (second minute hour day month weekday)
  job = new Cron('0 0 3 * * *', async () => {
    try {
      const envVal = process.env.CHAT_RETENTION_DAYS;
      const retentionDays = envVal ? parseInt(envVal, 10) : NaN;
      const days = Number.isNaN(retentionDays) ? 90 : retentionDays;

      console.log(`[chat-cleanup] Running cleanup (retention: ${days} days)`);

      const { deletedCount, sessionIds } = purgeOldConversations(db, days);

      // Clean up SDK session files from disk
      const encodedCwd = encodeCwd();
      let cleanedFiles = 0;

      for (const sessionId of sessionIds) {
        const filePath = join(homedir(), '.claude', 'projects', encodedCwd, sessionId + '.jsonl');
        try {
          await unlink(filePath);
          cleanedFiles++;
        } catch (err: unknown) {
          const error = err as NodeJS.ErrnoException;
          if (error.code !== 'ENOENT') {
            console.warn(
              `[chat-cleanup] Warning: failed to delete session file ${filePath}: ${error.message}`,
            );
          }
        }
      }

      console.log(
        `[chat-cleanup] Purged ${deletedCount} conversations, cleaned ${cleanedFiles} session files`,
      );
    } catch (err) {
      console.error('[chat-cleanup] Cleanup failed:', err instanceof Error ? err.message : String(err));
    }
  });

  console.log('[chat-cleanup] Started: purging old conversations daily at 3:00 AM');
}

export function stopChatCleanupScheduler(): void {
  if (job) {
    job.stop();
    job = null;
    console.log('[chat-cleanup] Stopped');
  }
}
