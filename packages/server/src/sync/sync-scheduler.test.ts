import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { startSyncScheduler, stopSyncScheduler } from './sync-scheduler.js';
import { createDatabase } from '../db/connection.js';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// Mock SIMPLEFIN_MOCK to avoid needing real credentials
vi.stubEnv('SIMPLEFIN_MOCK', 'true');

describe('sync-scheduler', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-scheduler-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    stopSyncScheduler();
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('startSyncScheduler returns a Cron job instance', () => {
    const job = startSyncScheduler(db);
    expect(job).toBeDefined();
    expect(typeof job.stop).toBe('function');
    expect(typeof job.nextRun).toBe('function');
  });

  it('stopSyncScheduler stops the job', () => {
    const job = startSyncScheduler(db);
    stopSyncScheduler();
    expect(job.isStopped()).toBe(true);
  });

  it('scheduler has next run scheduled', () => {
    const job = startSyncScheduler(db);
    const nextRun = job.nextRun();
    expect(nextRun).toBeInstanceOf(Date);
    expect(nextRun!.getTime()).toBeGreaterThan(Date.now());
  });

  it('scheduler runs at 6AM or 6PM', () => {
    const job = startSyncScheduler(db);
    const nextRuns = job.nextRuns(4);
    for (const run of nextRuns) {
      const hour = run.getHours();
      expect([6, 18]).toContain(hour);
    }
  });
});
