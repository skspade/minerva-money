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

  it('accounts.list returns all accounts with correct shape', async () => {
    const caller = createCaller();
    await caller.sync.trigger();

    const accounts = await caller.accounts.list();

    expect(accounts.length).toBe(3);
    for (const account of accounts) {
      expect(account.id).toBeTruthy();
      expect(account.name).toBeTruthy();
      expect(account.institution).toBeTruthy();
      expect(account.type).toBeTruthy();
      expect(typeof account.balance).toBe('number');
      expect('lastSynced' in account).toBe(true);
    }
  });

  it('accounts.list returns accounts ordered by type then name', async () => {
    const caller = createCaller();
    await caller.sync.trigger();

    const accounts = await caller.accounts.list();

    // Banking accounts should come before investment accounts (type ASC)
    const types = accounts.map(a => a.type);
    const bankingEnd = types.lastIndexOf('banking');
    const investmentStart = types.indexOf('investment');
    if (investmentStart !== -1 && bankingEnd !== -1) {
      expect(bankingEnd).toBeLessThan(investmentStart);
    }
  });

  it('accounts.list returns empty array when no accounts exist', async () => {
    const caller = createCaller();
    const accounts = await caller.accounts.list();

    expect(accounts).toEqual([]);
  });

  it('transactions.list returns transactions with account name', async () => {
    const caller = createCaller();
    await caller.sync.trigger();

    const transactions = await caller.transactions.list();

    expect(transactions.length).toBeGreaterThan(0);
    for (const txn of transactions) {
      expect(txn.id).toBeTruthy();
      expect(txn.date).toBeTruthy();
      expect(typeof txn.amount).toBe('number');
      expect(txn.accountId).toBeTruthy();
      expect(txn.accountName).toBeTruthy();
    }
  });

  it('transactions.list returns transactions ordered by date desc', async () => {
    const caller = createCaller();
    await caller.sync.trigger();

    const transactions = await caller.transactions.list();

    for (let i = 1; i < transactions.length; i++) {
      expect(transactions[i - 1].date >= transactions[i].date).toBe(true);
    }
  });

  it('transactions.list returns empty array when no transactions exist', async () => {
    const caller = createCaller();
    const transactions = await caller.transactions.list();

    expect(transactions).toEqual([]);
  });

  describe('budget procedures', () => {
    function createTestCategory(): number {
      const group = db.prepare('INSERT INTO category_groups (name) VALUES (?)').run('Test');
      return Number(db.prepare('INSERT INTO categories (group_id, name) VALUES (?, ?)').run(group.lastInsertRowid, 'Food').lastInsertRowid);
    }

    it('budget.defaults.set and budget.defaults.list round-trip', async () => {
      const caller = createCaller();
      const catId = createTestCategory();

      await caller.budget.defaults.set({ categoryId: catId, amount: 30000 });
      const defaults = await caller.budget.defaults.list();

      expect(defaults).toEqual([{ categoryId: catId, amount: 30000 }]);
    });

    it('budget.defaults.delete removes a default', async () => {
      const caller = createCaller();
      const catId = createTestCategory();

      await caller.budget.defaults.set({ categoryId: catId, amount: 30000 });
      await caller.budget.defaults.delete({ categoryId: catId });
      const defaults = await caller.budget.defaults.list();

      expect(defaults).toEqual([]);
    });

    it('budget.allocations.set and budget.summary round-trip', async () => {
      const caller = createCaller();
      const catId = createTestCategory();

      await caller.budget.allocations.set({ categoryId: catId, period: '2026-03', amount: 25000 });
      const summary = await caller.budget.summary({ period: '2026-03' });

      expect(summary.availableToBudget).toEqual(expect.any(Number));
      const food = summary.categories.find(c => c.categoryId === catId);
      expect(food).toBeDefined();
      expect(food!.allocated).toBe(25000);
    });

    it('budget.allocations.byMonth returns allocations for a period', async () => {
      const caller = createCaller();
      const catId = createTestCategory();

      await caller.budget.allocations.set({ categoryId: catId, period: '2026-03', amount: 25000 });
      const allocations = await caller.budget.allocations.byMonth({ period: '2026-03' });

      expect(allocations).toEqual([{ categoryId: catId, amount: 25000 }]);
    });

    it('budget.summary returns availableToBudget as a number', async () => {
      const caller = createCaller();
      const summary = await caller.budget.summary({ period: '2026-03' });

      expect(typeof summary.availableToBudget).toBe('number');
      expect(Array.isArray(summary.categories)).toBe(true);
    });
  });
});
