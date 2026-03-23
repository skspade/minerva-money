import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/connection.js';
import { getSpendingByCategory, getSpendingOverTime, getNetWorth } from './reports-service.js';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

describe('reports-service', () => {
  let db: Database.Database;
  let tmpDir: string;
  let catGroceries: number;
  let catRent: number;
  let catDining: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-reports-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));

    // Create category groups and categories
    const essentials = db.prepare('INSERT INTO category_groups (name) VALUES (?)').run('Essentials');
    const lifestyle = db.prepare('INSERT INTO category_groups (name) VALUES (?)').run('Lifestyle');
    catGroceries = Number(db.prepare('INSERT INTO categories (group_id, name) VALUES (?, ?)').run(essentials.lastInsertRowid, 'Groceries').lastInsertRowid);
    catRent = Number(db.prepare('INSERT INTO categories (group_id, name) VALUES (?, ?)').run(essentials.lastInsertRowid, 'Rent').lastInsertRowid);
    catDining = Number(db.prepare('INSERT INTO categories (group_id, name) VALUES (?, ?)').run(lifestyle.lastInsertRowid, 'Dining').lastInsertRowid);

    // Create test accounts
    db.prepare('INSERT INTO accounts (id, name, institution, type, balance) VALUES (?, ?, ?, ?, ?)').run('acct-1', 'Checking', 'Bank', 'checking', 500000);
    db.prepare('INSERT INTO accounts (id, name, institution, type, balance) VALUES (?, ?, ?, ?, ?)').run('acct-2', 'Savings', 'Bank', 'savings', 1000000);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getSpendingByCategory', () => {
    it('returns spending grouped by category', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -5000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-03-10', -3000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t3', 'acct-1', '2026-03-15', -120000, catRent);

      const result = getSpendingByCategory(db, '2026-03-01', '2026-04-01');
      expect(result).toHaveLength(2);
      // Sorted by total descending
      expect(result[0]).toEqual({ categoryId: catRent, categoryName: 'Rent', groupName: 'Essentials', total: 120000 });
      expect(result[1]).toEqual({ categoryId: catGroceries, categoryName: 'Groceries', groupName: 'Essentials', total: 8000 });
    });

    it('excludes confirmed transfers', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -5000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-03-06', -50000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t3', 'acct-2', '2026-03-06', 50000, catGroceries);
      // Confirm t2 <-> t3 as transfer
      db.prepare('INSERT INTO transfer_links (transaction_a_id, transaction_b_id, confirmed) VALUES (?, ?, ?)').run('t2', 't3', 1);

      const result = getSpendingByCategory(db, '2026-03-01', '2026-04-01');
      expect(result).toHaveLength(1);
      expect(result[0].total).toBe(5000); // Only t1, not the transfer
    });

    it('includes split transaction amounts', () => {
      // Parent transaction with splits
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -10000, null);
      db.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run('t1', catGroceries, -6000);
      db.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run('t1', catDining, -4000);

      const result = getSpendingByCategory(db, '2026-03-01', '2026-04-01');
      expect(result).toHaveLength(2);
      expect(result[0].total).toBe(6000); // Groceries
      expect(result[1].total).toBe(4000); // Dining
    });

    it('only counts negative amounts (spending)', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -5000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-03-10', 200000, catGroceries); // Income/refund

      const result = getSpendingByCategory(db, '2026-03-01', '2026-04-01');
      expect(result).toHaveLength(1);
      expect(result[0].total).toBe(5000);
    });

    it('returns empty array when no spending in range', () => {
      const result = getSpendingByCategory(db, '2026-03-01', '2026-04-01');
      expect(result).toEqual([]);
    });

    it('filters by date range', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-02-15', -5000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-03-15', -3000, catGroceries);

      const result = getSpendingByCategory(db, '2026-03-01', '2026-04-01');
      expect(result).toHaveLength(1);
      expect(result[0].total).toBe(3000);
    });

    it('combines unsplit and split spending for same category', () => {
      // Unsplit transaction
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -5000, catGroceries);
      // Split transaction with some going to Groceries
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-03-10', -8000, null);
      db.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run('t2', catGroceries, -3000);
      db.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run('t2', catDining, -5000);

      const result = getSpendingByCategory(db, '2026-03-01', '2026-04-01');
      const groceries = result.find(r => r.categoryId === catGroceries);
      expect(groceries!.total).toBe(8000); // 5000 + 3000
    });
  });

  describe('getSpendingOverTime', () => {
    it('returns monthly aggregated spending', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-01-15', -5000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-01-20', -3000, catRent);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t3', 'acct-1', '2026-02-10', -10000, catGroceries);

      const result = getSpendingOverTime(db, '2026-01-01', '2026-03-01');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ period: '2026-01', total: 8000 });
      expect(result[1]).toEqual({ period: '2026-02', total: 10000 });
    });

    it('excludes confirmed transfers', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-01-15', -5000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-01-16', -50000, null);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t3', 'acct-2', '2026-01-16', 50000, null);
      db.prepare('INSERT INTO transfer_links (transaction_a_id, transaction_b_id, confirmed) VALUES (?, ?, ?)').run('t2', 't3', 1);

      const result = getSpendingOverTime(db, '2026-01-01', '2026-02-01');
      expect(result).toHaveLength(1);
      expect(result[0].total).toBe(5000);
    });

    it('includes split transaction amounts', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-01-10', -10000, null);
      db.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run('t1', catGroceries, -6000);
      db.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run('t1', catDining, -4000);

      const result = getSpendingOverTime(db, '2026-01-01', '2026-02-01');
      expect(result).toHaveLength(1);
      expect(result[0].total).toBe(10000);
    });

    it('returns empty array when no transactions in range', () => {
      const result = getSpendingOverTime(db, '2026-03-01', '2026-04-01');
      expect(result).toEqual([]);
    });

    it('returns absolute values', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-01-15', -5000, catGroceries);

      const result = getSpendingOverTime(db, '2026-01-01', '2026-02-01');
      expect(result[0].total).toBe(5000); // Positive, not -5000
    });
  });

  describe('getNetWorth', () => {
    it('returns daily net worth totals', () => {
      db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('acct-1', '2026-03-01', 500000);
      db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('acct-2', '2026-03-01', 1000000);
      db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('acct-1', '2026-03-02', 490000);
      db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('acct-2', '2026-03-02', 1000000);

      const result = getNetWorth(db);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ date: '2026-03-01', total: 1500000 });
      expect(result[1]).toEqual({ date: '2026-03-02', total: 1490000 });
    });

    it('filters by date range when provided', () => {
      db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('acct-1', '2026-02-28', 450000);
      db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('acct-1', '2026-03-01', 500000);
      db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('acct-1', '2026-03-15', 480000);

      const result = getNetWorth(db, '2026-03-01', '2026-03-31');
      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2026-03-01');
      expect(result[1].date).toBe('2026-03-15');
    });

    it('returns all snapshots when no date range provided', () => {
      db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('acct-1', '2026-01-01', 400000);
      db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('acct-1', '2026-02-01', 450000);
      db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('acct-1', '2026-03-01', 500000);

      const result = getNetWorth(db);
      expect(result).toHaveLength(3);
    });

    it('returns empty array when no snapshots exist', () => {
      const result = getNetWorth(db);
      expect(result).toEqual([]);
    });

    it('sums balances across multiple accounts per date', () => {
      db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('acct-1', '2026-03-01', 500000);
      db.prepare('INSERT INTO balance_snapshots (account_id, date, balance) VALUES (?, ?, ?)').run('acct-2', '2026-03-01', 1000000);

      const result = getNetWorth(db);
      expect(result).toHaveLength(1);
      expect(result[0].total).toBe(1500000);
    });
  });
});
