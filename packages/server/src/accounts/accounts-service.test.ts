import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/connection.js';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { createAccount, updateAccount, deleteAccount, recalculateBalance } from './accounts-service.js';

describe('accounts-service', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-accounts-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createAccount', () => {
    it('creates a manual account with correct fields', () => {
      const account = createAccount(db, { name: 'My Checking', institution: 'Local Bank', type: 'banking' });

      expect(account.id).toMatch(/^manual_/);
      expect(account.name).toBe('My Checking');
      expect(account.institution).toBe('Local Bank');
      expect(account.type).toBe('banking');
      expect(account.balance).toBe(0);
      expect(account.source).toBe('manual');
    });

    it('defaults type to banking when not provided', () => {
      const account = createAccount(db, { name: 'Savings', institution: 'Online Bank' });

      expect(account.type).toBe('banking');
    });

    it('account appears in database after creation', () => {
      const account = createAccount(db, { name: 'Test Account', institution: 'Test Bank' });

      const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id) as any;
      expect(row).toBeDefined();
      expect(row.name).toBe('Test Account');
      expect(row.source).toBe('manual');
    });

    it('creates account with credit type', () => {
      const account = createAccount(db, { name: 'My Card', institution: 'Card Co', type: 'credit' });

      expect(account.type).toBe('credit');
    });
  });

  describe('updateAccount', () => {
    it('updates name of a manual account', () => {
      const account = createAccount(db, { name: 'Old Name', institution: 'Bank' });
      const updated = updateAccount(db, account.id, { name: 'New Name' });

      expect(updated.name).toBe('New Name');
      expect(updated.institution).toBe('Bank'); // unchanged
    });

    it('updates multiple fields at once', () => {
      const account = createAccount(db, { name: 'Name', institution: 'Old Bank', type: 'banking' });
      const updated = updateAccount(db, account.id, { name: 'New', institution: 'New Bank', type: 'credit' });

      expect(updated.name).toBe('New');
      expect(updated.institution).toBe('New Bank');
      expect(updated.type).toBe('credit');
    });

    it('throws NOT_FOUND for non-existent account', () => {
      expect(() => updateAccount(db, 'nonexistent', { name: 'Foo' }))
        .toThrow(/not found/i);
    });

    it('throws FORBIDDEN for SimpleFIN account', () => {
      // Insert a SimpleFIN account directly
      db.prepare(
        `INSERT INTO accounts (id, name, institution, type, balance, source) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('sfin_123', 'Synced Checking', 'Big Bank', 'banking', 100000, 'simplefin');

      expect(() => updateAccount(db, 'sfin_123', { name: 'Renamed' }))
        .toThrow(/cannot be modified/i);
    });
  });

  describe('deleteAccount', () => {
    it('deletes a manual account', () => {
      const account = createAccount(db, { name: 'To Delete', institution: 'Bank' });
      deleteAccount(db, account.id);

      const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id);
      expect(row).toBeUndefined();
    });

    it('cascade-deletes transactions when account is removed', () => {
      const account = createAccount(db, { name: 'With Txns', institution: 'Bank' });

      // Insert some transactions
      db.prepare(
        `INSERT INTO transactions (id, account_id, date, amount, pending) VALUES (?, ?, ?, ?, ?)`,
      ).run('txn_1', account.id, '2024-01-15', -500, 0);
      db.prepare(
        `INSERT INTO transactions (id, account_id, date, amount, pending) VALUES (?, ?, ?, ?, ?)`,
      ).run('txn_2', account.id, '2024-01-16', 1000, 0);

      const txnsBefore = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE account_id = ?').get(account.id) as { count: number };
      expect(txnsBefore.count).toBe(2);

      deleteAccount(db, account.id);

      const txnsAfter = db.prepare('SELECT COUNT(*) as count FROM transactions WHERE account_id = ?').get(account.id) as { count: number };
      expect(txnsAfter.count).toBe(0);
    });

    it('cascade-deletes balance snapshots when account is removed', () => {
      const account = createAccount(db, { name: 'With Snapshots', institution: 'Bank' });

      db.prepare(
        `INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)`,
      ).run(account.id, '2024-01-15', 5000);

      deleteAccount(db, account.id);

      const snapshots = db.prepare('SELECT COUNT(*) as count FROM balance_snapshots WHERE account_id = ?').get(account.id) as { count: number };
      expect(snapshots.count).toBe(0);
    });

    it('throws NOT_FOUND for non-existent account', () => {
      expect(() => deleteAccount(db, 'nonexistent'))
        .toThrow(/not found/i);
    });

    it('throws FORBIDDEN for SimpleFIN account', () => {
      db.prepare(
        `INSERT INTO accounts (id, name, institution, type, balance, source) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('sfin_456', 'Synced Savings', 'Big Bank', 'banking', 200000, 'simplefin');

      expect(() => deleteAccount(db, 'sfin_456'))
        .toThrow(/cannot be modified/i);
    });
  });

  describe('recalculateBalance', () => {
    it('sets balance to sum of transaction amounts', () => {
      const account = createAccount(db, { name: 'Checking', institution: 'Bank' });

      db.prepare(
        `INSERT INTO transactions (id, account_id, date, amount, pending) VALUES (?, ?, ?, ?, ?)`,
      ).run('txn_a', account.id, '2024-01-15', 50000, 0); // $500.00
      db.prepare(
        `INSERT INTO transactions (id, account_id, date, amount, pending) VALUES (?, ?, ?, ?, ?)`,
      ).run('txn_b', account.id, '2024-01-16', -1500, 0); // -$15.00

      const balance = recalculateBalance(db, account.id);

      expect(balance).toBe(48500); // $485.00 in cents

      const row = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(account.id) as { balance: number };
      expect(row.balance).toBe(48500);
    });

    it('returns 0 for account with no transactions', () => {
      const account = createAccount(db, { name: 'Empty', institution: 'Bank' });

      const balance = recalculateBalance(db, account.id);

      expect(balance).toBe(0);

      const row = db.prepare('SELECT balance FROM accounts WHERE id = ?').get(account.id) as { balance: number };
      expect(row.balance).toBe(0);
    });

    it('records a balance snapshot for today', () => {
      const account = createAccount(db, { name: 'Snapshot Test', institution: 'Bank' });

      db.prepare(
        `INSERT INTO transactions (id, account_id, date, amount, pending) VALUES (?, ?, ?, ?, ?)`,
      ).run('txn_snap', account.id, '2024-01-15', 10000, 0);

      recalculateBalance(db, account.id);

      const today = new Date().toISOString().split('T')[0];
      const snapshot = db.prepare(
        'SELECT * FROM balance_snapshots WHERE account_id = ? AND date = ?',
      ).get(account.id, today) as { balance: number } | undefined;

      expect(snapshot).toBeDefined();
      expect(snapshot!.balance).toBe(10000);
    });

    it('updates last_synced timestamp', () => {
      const account = createAccount(db, { name: 'Timestamp Test', institution: 'Bank' });

      recalculateBalance(db, account.id);

      const row = db.prepare('SELECT last_synced FROM accounts WHERE id = ?').get(account.id) as { last_synced: string | null };
      expect(row.last_synced).not.toBeNull();
    });

    it('overwrites same-day balance snapshot', () => {
      const account = createAccount(db, { name: 'Overwrite Test', institution: 'Bank' });

      db.prepare(
        `INSERT INTO transactions (id, account_id, date, amount, pending) VALUES (?, ?, ?, ?, ?)`,
      ).run('txn_ow1', account.id, '2024-01-15', 5000, 0);

      recalculateBalance(db, account.id);

      // Add another transaction and recalculate
      db.prepare(
        `INSERT INTO transactions (id, account_id, date, amount, pending) VALUES (?, ?, ?, ?, ?)`,
      ).run('txn_ow2', account.id, '2024-01-16', 3000, 0);

      recalculateBalance(db, account.id);

      const today = new Date().toISOString().split('T')[0];
      const snapshots = db.prepare(
        'SELECT * FROM balance_snapshots WHERE account_id = ? AND date = ?',
      ).all(account.id, today);

      expect(snapshots).toHaveLength(1);
      expect((snapshots[0] as { balance: number }).balance).toBe(8000);
    });
  });
});
