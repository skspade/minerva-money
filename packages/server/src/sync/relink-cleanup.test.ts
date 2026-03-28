import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/connection.js';
import { mergeRelinkDuplicates } from './relink-cleanup.js';
import { generateDedupHash } from './simplefin-client.js';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

describe('relink-cleanup', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-relink-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function insertAccount(id: string, name: string, institution: string, simplefinId: string, createdAt: string) {
    db.prepare(`
      INSERT INTO accounts (id, name, institution, type, balance, source, simplefin_id, created_at)
      VALUES (?, ?, ?, 'banking', 0, 'simplefin', ?, ?)
    `).run(id, name, institution, simplefinId, createdAt);
  }

  function insertTransaction(id: string, accountId: string, date: string, amount: number, payee: string) {
    const hash = generateDedupHash(accountId, date, amount, payee);
    db.prepare(`
      INSERT INTO transactions (id, account_id, date, amount, pending, payee, memo, dedup_hash)
      VALUES (?, ?, ?, ?, 0, ?, '', ?)
    `).run(id, accountId, date, amount, payee, hash);
  }

  it('merges duplicate accounts and preserves all transactions', () => {
    // Old account (keeper) with transactions
    insertAccount('ACT-old', 'Checking (9348)', 'Test Bank', 'ACT-old', '2026-03-20T00:00:00');
    insertTransaction('TXN-1', 'ACT-old', '2026-03-20', -5000, 'Coffee Shop');
    insertTransaction('TXN-2', 'ACT-old', '2026-03-21', -2500, 'Grocery');

    // New duplicate account (will be merged) with different transactions
    insertAccount('ACT-new', 'Checking (9348)', 'Test Bank', 'ACT-new', '2026-03-25T00:00:00');
    insertTransaction('TXN-3', 'ACT-new', '2026-03-25', -1000, 'Gas Station');

    const result = mergeRelinkDuplicates(db);

    expect(result.mergedPairs).toHaveLength(1);
    expect(result.mergedPairs[0].keeperId).toBe('ACT-old');
    expect(result.mergedPairs[0].duplicateId).toBe('ACT-new');
    expect(result.transactionsMoved).toBe(1);

    // Only 1 account remains
    const accounts = db.prepare('SELECT id, simplefin_id FROM accounts').all() as { id: string; simplefin_id: string }[];
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe('ACT-old');
    expect(accounts[0].simplefin_id).toBe('ACT-new'); // Updated to newer SimpleFIN ID

    // All 3 transactions preserved under keeper
    const txns = db.prepare('SELECT id, account_id FROM transactions ORDER BY id').all() as { id: string; account_id: string }[];
    expect(txns).toHaveLength(3);
    for (const txn of txns) {
      expect(txn.account_id).toBe('ACT-old');
    }

    // History recorded
    const history = db.prepare('SELECT * FROM account_id_history').all() as { account_id: string; previous_simplefin_id: string }[];
    expect(history).toHaveLength(1);
    expect(history[0].previous_simplefin_id).toBe('ACT-old');
  });

  it('deduplicates transactions with hash collisions during merge', () => {
    const date = '2026-03-20';
    const amount = -5000;
    const payee = 'Coffee Shop';

    // Same transaction on both accounts (identical content, different TXN IDs)
    insertAccount('ACT-old', 'Checking (9348)', 'Test Bank', 'ACT-old', '2026-03-20T00:00:00');
    insertTransaction('TXN-old-1', 'ACT-old', date, amount, payee);

    insertAccount('ACT-new', 'Checking (9348)', 'Test Bank', 'ACT-new', '2026-03-25T00:00:00');
    insertTransaction('TXN-new-1', 'ACT-new', date, amount, payee);

    const result = mergeRelinkDuplicates(db);

    expect(result.transactionsDeduped).toBe(1);
    expect(result.transactionsMoved).toBe(0);

    // Only 1 transaction remains (the keeper's)
    const txns = db.prepare('SELECT id, account_id FROM transactions').all() as { id: string; account_id: string }[];
    expect(txns).toHaveLength(1);
    expect(txns[0].id).toBe('TXN-old-1');
    expect(txns[0].account_id).toBe('ACT-old');
  });

  it('handles balance snapshot conflicts during merge', () => {
    insertAccount('ACT-old', 'Checking (9348)', 'Test Bank', 'ACT-old', '2026-03-20T00:00:00');
    insertAccount('ACT-new', 'Checking (9348)', 'Test Bank', 'ACT-new', '2026-03-25T00:00:00');

    // Keeper has snapshot for 03-20, duplicate has for 03-20 (conflict) and 03-25 (unique)
    db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('ACT-old', '2026-03-20', 100000);
    db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('ACT-new', '2026-03-20', 110000);
    db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('ACT-new', '2026-03-25', 120000);

    const result = mergeRelinkDuplicates(db);

    expect(result.snapshotsMoved).toBe(1); // Only 03-25 moved

    const snapshots = db.prepare('SELECT * FROM balance_snapshots ORDER BY date').all() as { account_id: string; date: string; balance: number }[];
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ account_id: 'ACT-old', date: '2026-03-20', balance: 100000 });
    expect(snapshots[1]).toMatchObject({ account_id: 'ACT-old', date: '2026-03-25', balance: 120000 });
  });

  it('returns empty result when no duplicates exist', () => {
    insertAccount('ACT-1', 'Checking', 'Bank A', 'ACT-1', '2026-03-20T00:00:00');
    insertAccount('ACT-2', 'Savings', 'Bank B', 'ACT-2', '2026-03-20T00:00:00');

    const result = mergeRelinkDuplicates(db);

    expect(result.mergedPairs).toHaveLength(0);
    expect(result.transactionsMoved).toBe(0);

    const accounts = db.prepare('SELECT id FROM accounts').all();
    expect(accounts).toHaveLength(2);
  });

  it('does not merge manual accounts', () => {
    insertAccount('ACT-sf', 'My Account', 'Bank A', 'ACT-sf', '2026-03-20T00:00:00');
    // Insert a manual account with same name+institution
    db.prepare(`
      INSERT INTO accounts (id, name, institution, type, balance, source, created_at)
      VALUES (?, ?, ?, 'banking', 0, 'manual', ?)
    `).run('ACT-manual', 'My Account', 'Bank A', '2026-03-25T00:00:00');

    const result = mergeRelinkDuplicates(db);

    expect(result.mergedPairs).toHaveLength(0);
    const accounts = db.prepare('SELECT id FROM accounts').all();
    expect(accounts).toHaveLength(2);
  });
});
