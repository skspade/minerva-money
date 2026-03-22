import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/connection.js';
import { createMockSimpleFINClient } from './simplefin-client.js';
import { createRateLimiter } from './rate-limiter.js';
import { runSync } from './sync-service.js';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

describe('sync-service', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-sync-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sync inserts accounts from mock client', async () => {
    const client = createMockSimpleFINClient();
    const limiter = createRateLimiter();
    const result = await runSync(db, client, limiter, { skipBackup: true });

    expect(result.accountsSynced).toBe(3);
    expect(result.errors).toHaveLength(0);

    const accounts = db.prepare('SELECT * FROM accounts').all();
    expect(accounts).toHaveLength(3);
  });

  it('sync inserts transactions from mock client', async () => {
    const client = createMockSimpleFINClient();
    const limiter = createRateLimiter();
    const result = await runSync(db, client, limiter, { skipBackup: true });

    expect(result.transactionsAdded).toBeGreaterThan(0);

    const txns = db.prepare('SELECT * FROM transactions').all();
    expect(txns.length).toBe(result.transactionsAdded);
  });

  it('stores amounts as integer cents', async () => {
    const client = createMockSimpleFINClient();
    const limiter = createRateLimiter();
    await runSync(db, client, limiter, { skipBackup: true });

    const txns = db.prepare('SELECT amount FROM transactions').all() as { amount: number }[];
    for (const txn of txns) {
      expect(Number.isInteger(txn.amount)).toBe(true);
    }

    const accounts = db.prepare('SELECT balance FROM accounts').all() as { balance: number }[];
    for (const acct of accounts) {
      expect(Number.isInteger(acct.balance)).toBe(true);
    }
  });

  it('running sync twice produces no duplicate transactions', async () => {
    const client = createMockSimpleFINClient();
    const limiter = createRateLimiter();

    const first = await runSync(db, client, limiter, { skipBackup: true });
    const second = await runSync(db, client, limiter, { skipBackup: true });

    expect(first.transactionsAdded).toBeGreaterThan(0);
    expect(second.transactionsAdded).toBe(0);

    const txnCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get() as { count: number };
    expect(txnCount.count).toBe(first.transactionsAdded);
  });

  it('creates sync_log entry with running then success status', async () => {
    const client = createMockSimpleFINClient();
    const limiter = createRateLimiter();
    await runSync(db, client, limiter, { skipBackup: true });

    const log = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 1').get() as {
      status: string;
      completed_at: string;
      accounts_synced: number;
      transactions_added: number;
    };

    expect(log.status).toBe('success');
    expect(log.completed_at).toBeTruthy();
    expect(log.accounts_synced).toBe(3);
    expect(log.transactions_added).toBeGreaterThan(0);
  });

  it('logs sync error with account context on failure', async () => {
    const client = {
      async fetchAccounts() {
        throw new Error('Connection timeout');
      },
      async fetchTransactions() {
        throw new Error('Connection timeout');
      },
      async fetchBalances() {
        throw new Error('Connection timeout');
      },
    };
    const limiter = createRateLimiter();
    const result = await runSync(db, client, limiter, { skipBackup: true });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Connection timeout');

    const log = db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT 1').get() as {
      status: string;
      error_message: string;
    };
    expect(log.status).toBe('error');
    expect(log.error_message).toContain('Connection timeout');
  });

  it('records balance snapshots after successful sync', async () => {
    const client = createMockSimpleFINClient();
    const limiter = createRateLimiter();
    await runSync(db, client, limiter, { skipBackup: true });

    const snapshots = db.prepare('SELECT * FROM balance_snapshots').all() as {
      account_id: string;
      balance: number;
    }[];

    expect(snapshots).toHaveLength(3);
    for (const snapshot of snapshots) {
      expect(Number.isInteger(snapshot.balance)).toBe(true);
    }
  });

  it('balance snapshots updated on same-day re-sync', async () => {
    const client = createMockSimpleFINClient();
    const limiter = createRateLimiter();

    await runSync(db, client, limiter, { skipBackup: true });
    await runSync(db, client, limiter, { skipBackup: true });

    // Should still be 3 snapshots (not 6) due to INSERT OR REPLACE
    const snapshots = db.prepare('SELECT * FROM balance_snapshots').all();
    expect(snapshots).toHaveLength(3);
  });

  it('rate limiter blocks sync when limit exceeded', async () => {
    const client = createMockSimpleFINClient();
    const limiter = createRateLimiter(1, 0); // 1 request per day per account

    // First sync uses up the 1 request per account
    await runSync(db, client, limiter, { skipBackup: true });

    // Second sync: all accounts should be rate-limited
    const result = await runSync(db, client, limiter, { skipBackup: true });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes('Rate limit exceeded'))).toBe(true);
    expect(result.accountsSynced).toBe(0);
  });
});
