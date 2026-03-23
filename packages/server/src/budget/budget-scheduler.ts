import { Cron } from 'croner';
import type Database from 'better-sqlite3';
import { autoFundPeriod } from './budget-service.js';

let midMonthJob: Cron | null = null;
let endMonthJob: Cron | null = null;

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isLastDayOfMonth(date: Date): boolean {
  return date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function startBudgetScheduler(db: Database.Database): void {
  // Mid-month funding: 1AM on the 15th
  midMonthJob = new Cron('0 0 1 15 * *', () => {
    try {
      const period = getCurrentPeriod();
      const count = autoFundPeriod(db, period, 1);
      console.log(`[budget-scheduler] Mid-month funding: ${count} categories funded for ${period}`);
    } catch (err) {
      console.error('[budget-scheduler] Mid-month funding failed:', err instanceof Error ? err.message : String(err));
    }
  });

  // End-of-month funding: 1AM every day, checks if last day
  endMonthJob = new Cron('0 0 1 * * *', () => {
    const now = new Date();
    if (!isLastDayOfMonth(now)) return;

    try {
      const period = getCurrentPeriod();
      const count = autoFundPeriod(db, period, 2);
      console.log(`[budget-scheduler] End-of-month funding: ${count} categories funded for ${period}`);
    } catch (err) {
      console.error('[budget-scheduler] End-of-month funding failed:', err instanceof Error ? err.message : String(err));
    }
  });

  console.log('[budget-scheduler] Started: funding on 15th and last day of month');
}

export function stopBudgetScheduler(): void {
  if (midMonthJob) {
    midMonthJob.stop();
    midMonthJob = null;
  }
  if (endMonthJob) {
    endMonthJob.stop();
    endMonthJob = null;
  }
  console.log('[budget-scheduler] Stopped');
}
