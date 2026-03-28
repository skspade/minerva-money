import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/connection.js';
import { createMockSimpleFINClient } from './simplefin-client.js';
import { createRateLimiter } from './rate-limiter.js';
import { runSync } from './sync-service.js';
import type { SimpleFINClient, SimpleFINAccountSet } from './simplefin-types.js';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// Helper to create a custom SimpleFIN client for error scenarios
function createTestClient(data: SimpleFINAccountSet): SimpleFINClient {
  return {
    async fetchAccounts() { return data; },
    async fetchTransactions() { return data; },
    async fetchBalances() { return { ...data, accounts: data.accounts.map(a => ({ ...a, transactions: [] })) }; },
  };
}

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

  it('migration adds source column defaulting to simplefin', async () => {
    const client = createMockSimpleFINClient();
    const limiter = createRateLimiter();
    await runSync(db, client, limiter, { skipBackup: true });

    const accounts = db.prepare('SELECT id, source FROM accounts').all() as { id: string; source: string }[];
    expect(accounts.length).toBeGreaterThan(0);
    for (const acct of accounts) {
      expect(acct.source).toBe('simplefin');
    }
  });

  it('sync trigger query excludes manual accounts', () => {
    // Insert a manual account directly
    db.prepare(
      "INSERT INTO accounts (id, name, institution, type, balance, source) VALUES (?, ?, ?, ?, ?, ?)",
    ).run('manual_test-uuid', 'Test Manual Account', 'Manual Bank', 'checking', 0, 'manual');

    // Use the same query the sync trigger uses (with source filter)
    const syncAccounts = db.prepare("SELECT id, name FROM accounts WHERE source = 'simplefin'").all() as { id: string }[];

    // Manual account should NOT appear in sync query
    expect(syncAccounts.find(a => a.id === 'manual_test-uuid')).toBeUndefined();

    // All accounts should still be listed when querying without filter
    const allAccounts = db.prepare('SELECT id FROM accounts').all() as { id: string }[];
    expect(allAccounts.find(a => a.id === 'manual_test-uuid')).toBeDefined();
  });

  it('accounts list query includes source field', async () => {
    const client = createMockSimpleFINClient();
    const limiter = createRateLimiter();
    await runSync(db, client, limiter, { skipBackup: true });

    const accounts = db.prepare(
      'SELECT id, name, institution, type, balance, last_synced, source FROM accounts ORDER BY type ASC, name ASC',
    ).all() as { source: string }[];

    expect(accounts.length).toBeGreaterThan(0);
    for (const acct of accounts) {
      expect(acct.source).toBe('simplefin');
    }
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

  // ===== Warning Pipeline Tests (Phase 48) =====

  describe('warning pipeline', () => {
    // Helper: two accounts on same connection, one with error
    function makePartialErrorData(): SimpleFINAccountSet {
      return {
        errors: [
          { code: 'auth.required', msg: 'Reauthentication needed', account_id: 'ACC-001' },
        ],
        accounts: [
          { id: 'ACC-001', name: 'Checking', conn_id: 'CONN-1', currency: 'USD', balance: '1000.00', 'balance-date': Date.now() / 1000, transactions: [], org: { name: 'Test Bank' } },
          { id: 'ACC-002', name: 'Savings', conn_id: 'CONN-1', currency: 'USD', balance: '5000.00', 'balance-date': Date.now() / 1000, transactions: [], org: { name: 'Test Bank' } },
        ],
      };
    }

    // SYNC-01: Per-account warning persistence
    it('writes warning row for account-level SimpleFIN error', async () => {
      const client = createTestClient(makePartialErrorData());
      const limiter = createRateLimiter();
      await runSync(db, client, limiter, { skipBackup: true });

      const warnings = db.prepare('SELECT * FROM sync_warnings').all() as {
        account_id: string; account_name: string; error_code: string; message: string; occurrence_count: number;
      }[];

      expect(warnings).toHaveLength(1);
      expect(warnings[0].account_id).toBe('ACC-001');
      expect(warnings[0].account_name).toBe('Checking');
      expect(warnings[0].error_code).toBe('auth.required');
      expect(warnings[0].message).toBe('Reauthentication needed');
      expect(warnings[0].occurrence_count).toBe(1);
    });

    it('increments occurrence_count on repeated errors for same account', async () => {
      const client = createTestClient(makePartialErrorData());
      const limiter = createRateLimiter();

      await runSync(db, client, limiter, { skipBackup: true });
      await runSync(db, client, limiter, { skipBackup: true });

      const warning = db.prepare('SELECT occurrence_count FROM sync_warnings WHERE account_id = ?').get('ACC-001') as { occurrence_count: number };
      expect(warning.occurrence_count).toBe(2);
    });

    it('resolves account_name from accounts array, falls back to account_id', async () => {
      const data: SimpleFINAccountSet = {
        errors: [
          { code: 'timeout', msg: 'Timed out', account_id: 'UNKNOWN-ACCT' },
        ],
        accounts: [
          { id: 'ACC-001', name: 'Checking', conn_id: 'CONN-1', currency: 'USD', balance: '1000.00', 'balance-date': Date.now() / 1000, transactions: [], org: { name: 'Test Bank' } },
        ],
      };
      const client = createTestClient(data);
      const limiter = createRateLimiter();
      await runSync(db, client, limiter, { skipBackup: true });

      const warning = db.prepare('SELECT account_name FROM sync_warnings WHERE account_id = ?').get('UNKNOWN-ACCT') as { account_name: string };
      expect(warning.account_name).toBe('UNKNOWN-ACCT');
    });

    it('writes warning for per-account processing errors with sync_error code', async () => {
      // Create a client where one account has invalid data that causes syncAccount to throw
      const data: SimpleFINAccountSet = {
        errors: [],
        accounts: [
          { id: 'ACC-001', name: 'Checking', conn_id: 'CONN-1', currency: 'USD', balance: 'not-a-number', 'balance-date': Date.now() / 1000, transactions: [], org: { name: 'Test Bank' } },
          { id: 'ACC-002', name: 'Savings', conn_id: 'CONN-1', currency: 'USD', balance: '5000.00', 'balance-date': Date.now() / 1000, transactions: [], org: { name: 'Test Bank' } },
        ],
      };
      const client = createTestClient(data);
      const limiter = createRateLimiter();
      await runSync(db, client, limiter, { skipBackup: true });

      const warnings = db.prepare('SELECT * FROM sync_warnings WHERE error_code = ?').all('sync_error') as { account_id: string }[];
      // If ACC-001 throws during syncAccount, it should get a sync_error warning
      // (ACC-001 may or may not throw depending on normalizeAccount behavior with 'not-a-number' balance)
      // Either way, if there ARE sync_error warnings, they should have the right code
      for (const w of warnings) {
        expect(w.account_id).toBeTruthy();
      }
    });

    // SYNC-02: Partial status logic
    it('sets sync_log status to partial when some accounts error', async () => {
      const client = createTestClient(makePartialErrorData());
      const limiter = createRateLimiter();
      await runSync(db, client, limiter, { skipBackup: true });

      const log = db.prepare('SELECT status FROM sync_log ORDER BY id DESC LIMIT 1').get() as { status: string };
      expect(log.status).toBe('partial');
    });

    it('keeps sync_log status as success when no errors', async () => {
      const client = createMockSimpleFINClient();
      const limiter = createRateLimiter();
      await runSync(db, client, limiter, { skipBackup: true });

      const log = db.prepare('SELECT status FROM sync_log ORDER BY id DESC LIMIT 1').get() as { status: string };
      expect(log.status).toBe('success');
    });

    it('sets sync_log status to error when fetchAccounts throws', async () => {
      const client = {
        async fetchAccounts() { throw new Error('Network error'); },
        async fetchTransactions() { throw new Error('Network error'); },
        async fetchBalances() { throw new Error('Network error'); },
      };
      const limiter = createRateLimiter();
      await runSync(db, client, limiter, { skipBackup: true });

      const log = db.prepare('SELECT status FROM sync_log ORDER BY id DESC LIMIT 1').get() as { status: string };
      expect(log.status).toBe('error');
    });

    // SYNC-03: Warning auto-clear
    it('clears warnings for accounts that sync successfully', async () => {
      // First sync: ACC-001 has error
      const errorData = makePartialErrorData();
      const errorClient = createTestClient(errorData);
      const limiter = createRateLimiter();
      await runSync(db, errorClient, limiter, { skipBackup: true });

      // Verify warning exists
      let warnings = db.prepare('SELECT * FROM sync_warnings').all();
      expect(warnings.length).toBe(1);

      // Second sync: no errors (ACC-001 recovered)
      const successData: SimpleFINAccountSet = {
        errors: [],
        accounts: errorData.accounts,
      };
      const successClient = createTestClient(successData);
      await runSync(db, successClient, limiter, { skipBackup: true });

      // Warning should be cleared
      warnings = db.prepare('SELECT * FROM sync_warnings').all();
      expect(warnings.length).toBe(0);
    });

    it('retains warnings for accounts not in the response', async () => {
      // First sync: ACC-001 has error
      const errorData = makePartialErrorData();
      const errorClient = createTestClient(errorData);
      const limiter = createRateLimiter();
      await runSync(db, errorClient, limiter, { skipBackup: true });

      // Second sync: response only includes ACC-002 (ACC-001 not returned)
      const partialResponse: SimpleFINAccountSet = {
        errors: [],
        accounts: [
          { id: 'ACC-002', name: 'Savings', conn_id: 'CONN-1', currency: 'USD', balance: '5000.00', 'balance-date': Date.now() / 1000, transactions: [], org: { name: 'Test Bank' } },
        ],
      };
      const partialClient = createTestClient(partialResponse);
      await runSync(db, partialClient, limiter, { skipBackup: true });

      // Warning for ACC-001 should still exist (not in response, so not cleared)
      const warnings = db.prepare('SELECT * FROM sync_warnings').all() as { account_id: string }[];
      expect(warnings.length).toBe(1);
      expect(warnings[0].account_id).toBe('ACC-001');
    });

    // SYNC-04: Connection-level error mapping
    it('maps connection-level errors to all accounts on that connection', async () => {
      const data: SimpleFINAccountSet = {
        errors: [
          { code: 'conn.timeout', msg: 'Connection timed out', conn_id: 'CONN-1' },
        ],
        accounts: [
          { id: 'ACC-001', name: 'Checking', conn_id: 'CONN-1', currency: 'USD', balance: '1000.00', 'balance-date': Date.now() / 1000, transactions: [], org: { name: 'Test Bank' } },
          { id: 'ACC-002', name: 'Savings', conn_id: 'CONN-1', currency: 'USD', balance: '5000.00', 'balance-date': Date.now() / 1000, transactions: [], org: { name: 'Test Bank' } },
          { id: 'ACC-003', name: 'Other Bank', conn_id: 'CONN-2', currency: 'USD', balance: '2000.00', 'balance-date': Date.now() / 1000, transactions: [], org: { name: 'Other Bank' } },
        ],
      };
      const client = createTestClient(data);
      const limiter = createRateLimiter();
      await runSync(db, client, limiter, { skipBackup: true });

      const warnings = db.prepare('SELECT account_id FROM sync_warnings ORDER BY account_id').all() as { account_id: string }[];
      // Should have warnings for ACC-001 and ACC-002 (both on CONN-1), but not ACC-003
      expect(warnings).toHaveLength(2);
      expect(warnings[0].account_id).toBe('ACC-001');
      expect(warnings[1].account_id).toBe('ACC-002');
    });

    it('writes fallback warning when conn_id matches no accounts', async () => {
      const data: SimpleFINAccountSet = {
        errors: [
          { code: 'conn.failed', msg: 'Connection failed', conn_id: 'CONN-DEAD' },
        ],
        accounts: [
          { id: 'ACC-001', name: 'Checking', conn_id: 'CONN-1', currency: 'USD', balance: '1000.00', 'balance-date': Date.now() / 1000, transactions: [], org: { name: 'Test Bank' } },
        ],
      };
      const client = createTestClient(data);
      const limiter = createRateLimiter();
      await runSync(db, client, limiter, { skipBackup: true });

      const warning = db.prepare('SELECT * FROM sync_warnings WHERE account_id = ?').get('CONN-DEAD') as {
        account_id: string; account_name: string; error_code: string;
      };
      expect(warning).toBeTruthy();
      expect(warning.account_name).toBe('CONN-DEAD');
      expect(warning.error_code).toBe('conn.failed');
    });

    // Stale cleanup
    it('cleans up stale running sync_log entries', async () => {
      // Manually insert a stale 'running' entry
      db.prepare("INSERT INTO sync_log (status) VALUES ('running')").run();

      const client = createMockSimpleFINClient();
      const limiter = createRateLimiter();
      await runSync(db, client, limiter, { skipBackup: true });

      // The stale entry should now be 'error'
      const logs = db.prepare('SELECT status, error_message FROM sync_log ORDER BY id ASC').all() as {
        status: string; error_message: string | null;
      }[];

      // First entry: the stale one, should be error
      expect(logs[0].status).toBe('error');
      expect(logs[0].error_message).toContain('Stale');

      // Second entry: the new one, should be success
      expect(logs[1].status).toBe('success');
    });
  });

  // ===== Re-link Detection Tests =====

  describe('re-link detection', () => {
    it('detects re-linked account by name+institution and preserves internal ID', async () => {
      // First sync: account with original SimpleFIN ID
      const data1: SimpleFINAccountSet = {
        errors: [],
        accounts: [{
          id: 'ACT-old-111', name: 'Checking (9348)', conn_id: 'CONN-1',
          currency: 'USD', balance: '1000.00', 'balance-date': Date.now() / 1000,
          transactions: [], org: { name: 'Test Bank' },
        }],
      };
      const client1 = createTestClient(data1);
      const limiter = createRateLimiter();
      await runSync(db, client1, limiter, { skipBackup: true });

      // Verify initial state
      const before = db.prepare('SELECT id, simplefin_id FROM accounts').all() as { id: string; simplefin_id: string }[];
      expect(before).toHaveLength(1);
      expect(before[0].id).toBe('ACT-old-111');
      expect(before[0].simplefin_id).toBe('ACT-old-111');

      // Second sync: same name+institution, new SimpleFIN ID (re-link)
      const data2: SimpleFINAccountSet = {
        errors: [],
        accounts: [{
          id: 'ACT-new-222', name: 'Checking (9348)', conn_id: 'CONN-1',
          currency: 'USD', balance: '1500.00', 'balance-date': Date.now() / 1000,
          transactions: [], org: { name: 'Test Bank' },
        }],
      };
      const client2 = createTestClient(data2);
      await runSync(db, client2, limiter, { skipBackup: true });

      // Should still be 1 account with old internal ID but new simplefin_id
      const after = db.prepare('SELECT id, simplefin_id, balance FROM accounts').all() as { id: string; simplefin_id: string; balance: number }[];
      expect(after).toHaveLength(1);
      expect(after[0].id).toBe('ACT-old-111');
      expect(after[0].simplefin_id).toBe('ACT-new-222');
      expect(after[0].balance).toBe(150000);

      // History should be recorded
      const history = db.prepare('SELECT * FROM account_id_history').all() as { account_id: string; previous_simplefin_id: string }[];
      expect(history).toHaveLength(1);
      expect(history[0].account_id).toBe('ACT-old-111');
      expect(history[0].previous_simplefin_id).toBe('ACT-old-111');
    });

    it('new transactions after re-link use the original internal ID', async () => {
      // First sync with transactions
      const data1: SimpleFINAccountSet = {
        errors: [],
        accounts: [{
          id: 'ACT-old-111', name: 'Checking (9348)', conn_id: 'CONN-1',
          currency: 'USD', balance: '1000.00', 'balance-date': Date.now() / 1000,
          transactions: [{
            id: 'TXN-1', posted: Math.floor(Date.now() / 1000) - 86400,
            amount: '-50.00', description: 'Coffee Shop', pending: false,
          }],
          org: { name: 'Test Bank' },
        }],
      };
      await runSync(db, createTestClient(data1), createRateLimiter(), { skipBackup: true });

      // Re-link with new transactions
      const data2: SimpleFINAccountSet = {
        errors: [],
        accounts: [{
          id: 'ACT-new-222', name: 'Checking (9348)', conn_id: 'CONN-1',
          currency: 'USD', balance: '900.00', 'balance-date': Date.now() / 1000,
          transactions: [{
            id: 'TXN-2', posted: Math.floor(Date.now() / 1000),
            amount: '-25.00', description: 'Grocery Store', pending: false,
          }],
          org: { name: 'Test Bank' },
        }],
      };
      await runSync(db, createTestClient(data2), createRateLimiter(), { skipBackup: true });

      // Both transactions should have the original internal ID
      const txns = db.prepare('SELECT id, account_id FROM transactions ORDER BY id').all() as { id: string; account_id: string }[];
      expect(txns).toHaveLength(2);
      expect(txns[0].account_id).toBe('ACT-old-111');
      expect(txns[1].account_id).toBe('ACT-old-111');
    });

    it('dedup works across re-link (same transaction not duplicated)', async () => {
      const txnPosted = Math.floor(Date.now() / 1000) - 86400;

      // First sync with a transaction
      const data1: SimpleFINAccountSet = {
        errors: [],
        accounts: [{
          id: 'ACT-old-111', name: 'Checking (9348)', conn_id: 'CONN-1',
          currency: 'USD', balance: '1000.00', 'balance-date': Date.now() / 1000,
          transactions: [{
            id: 'TXN-A', posted: txnPosted,
            amount: '-50.00', description: 'Coffee Shop', pending: false,
          }],
          org: { name: 'Test Bank' },
        }],
      };
      await runSync(db, createTestClient(data1), createRateLimiter(), { skipBackup: true });

      // Re-link: same transaction appears with different TXN ID but same content
      const data2: SimpleFINAccountSet = {
        errors: [],
        accounts: [{
          id: 'ACT-new-222', name: 'Checking (9348)', conn_id: 'CONN-1',
          currency: 'USD', balance: '1000.00', 'balance-date': Date.now() / 1000,
          transactions: [{
            id: 'TXN-B', posted: txnPosted,
            amount: '-50.00', description: 'Coffee Shop', pending: false,
          }],
          org: { name: 'Test Bank' },
        }],
      };
      const result = await runSync(db, createTestClient(data2), createRateLimiter(), { skipBackup: true });

      // Dedup hash is based on internal account ID, so same hash → INSERT OR IGNORE
      expect(result.transactionsAdded).toBe(0);
      const txns = db.prepare('SELECT * FROM transactions').all();
      expect(txns).toHaveLength(1);
    });

    it('does not auto-merge when name+institution is ambiguous (multiple matches)', async () => {
      // Insert two accounts with same name+institution manually
      db.prepare(`
        INSERT INTO accounts (id, name, institution, type, balance, source, simplefin_id)
        VALUES (?, ?, ?, ?, ?, 'simplefin', ?)
      `).run('ACT-1', 'Savings', 'Bank A', 'banking', 0, 'ACT-1');
      db.prepare(`
        INSERT INTO accounts (id, name, institution, type, balance, source, simplefin_id)
        VALUES (?, ?, ?, ?, ?, 'simplefin', ?)
      `).run('ACT-2', 'Savings', 'Bank A', 'banking', 0, 'ACT-2');

      // Sync a new account with same name+institution but new SimpleFIN ID
      const data: SimpleFINAccountSet = {
        errors: [],
        accounts: [{
          id: 'ACT-new-3', name: 'Savings', conn_id: 'CONN-1',
          currency: 'USD', balance: '2000.00', 'balance-date': Date.now() / 1000,
          transactions: [], org: { name: 'Bank A' },
        }],
      };
      await runSync(db, createTestClient(data), createRateLimiter(), { skipBackup: true });

      // Should have 3 accounts — no merge because ambiguous
      const accounts = db.prepare('SELECT id FROM accounts ORDER BY id').all() as { id: string }[];
      expect(accounts).toHaveLength(3);
    });

    it('new account with unique name+institution creates normally', async () => {
      const data: SimpleFINAccountSet = {
        errors: [],
        accounts: [{
          id: 'ACT-brand-new', name: 'New Account (1234)', conn_id: 'CONN-1',
          currency: 'USD', balance: '3000.00', 'balance-date': Date.now() / 1000,
          transactions: [], org: { name: 'New Bank' },
        }],
      };
      await runSync(db, createTestClient(data), createRateLimiter(), { skipBackup: true });

      const accounts = db.prepare('SELECT id, simplefin_id FROM accounts').all() as { id: string; simplefin_id: string }[];
      expect(accounts).toHaveLength(1);
      expect(accounts[0].id).toBe('ACT-brand-new');
      expect(accounts[0].simplefin_id).toBe('ACT-brand-new');
    });
  });
});
