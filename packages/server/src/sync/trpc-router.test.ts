import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/connection.js';
import { createMockSimpleFINClient } from './simplefin-client.js';
import { createRateLimiter } from './rate-limiter.js';
import { appRouter } from './trpc-router.js';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

describe('trpc-router', () => {
  let db: Database.Database;
  let tmpDir: string;

  function createCaller() {
    return appRouter.createCaller({
      db,
      rateLimiter: createRateLimiter(),
      client: createMockSimpleFINClient(),
    });
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-trpc-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sync.trigger calls runSync and returns result', async () => {
    const caller = createCaller();
    const result = await caller.sync.trigger();

    expect(result.accountsSynced).toBe(3);
    expect(result.transactionsAdded).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it('sync.trigger returns error when rate limit exceeded', async () => {
    // First: populate accounts so rate check has data
    const caller = createCaller();
    await caller.sync.trigger();

    // Now create a caller with exhausted rate limiter
    const exhaustedLimiter = createRateLimiter(1, 1);
    // Use up the 1 request per account
    const accounts = db.prepare('SELECT id FROM accounts').all() as { id: string }[];
    for (const acct of accounts) {
      exhaustedLimiter.increment(acct.id);
    }

    const limitedCaller = appRouter.createCaller({
      db,
      rateLimiter: exhaustedLimiter,
      client: createMockSimpleFINClient(),
    });

    await expect(limitedCaller.sync.trigger()).rejects.toThrow('Rate limit');
  });

  it('sync.status returns last sync info after a sync', async () => {
    const caller = createCaller();
    await caller.sync.trigger();

    const status = await caller.sync.status();

    expect(status.lastSync).toBeTruthy();
    expect(status.lastSync!.status).toBe('success');
    expect(status.lastSync!.accountsSynced).toBe(3);
    expect(status.errorCount).toBe(0);
    expect(status.accounts).toHaveLength(3);
  });

  it('sync.status returns null lastSync when no syncs have run', async () => {
    const caller = createCaller();
    const status = await caller.sync.status();

    expect(status.lastSync).toBeNull();
    expect(status.errorCount).toBe(0);
    expect(status.accounts).toHaveLength(0);
  });

  it('sync.status returns per-account status', async () => {
    const caller = createCaller();
    await caller.sync.trigger();
    const status = await caller.sync.status();

    for (const account of status.accounts) {
      expect(account.id).toBeTruthy();
      expect(account.name).toBeTruthy();
      expect(typeof account.balance).toBe('number');
      expect(account.last_synced).toBeTruthy();
    }
  });
});
