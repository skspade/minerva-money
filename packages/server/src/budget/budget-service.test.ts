import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/connection.js';
import {
  setDefaultAllocation,
  getDefaults,
  deleteDefault,
  setAllocation,
  getAllocation,
  getSpentForCategory,
} from './budget-service.js';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

describe('budget-service', () => {
  let db: Database.Database;
  let tmpDir: string;
  let catGroceries: number;
  let catRent: number;
  let catUtilities: number;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-budget-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));

    // Create test category group and categories
    const group = db.prepare('INSERT INTO category_groups (name) VALUES (?)').run('Essentials');
    catGroceries = Number(db.prepare('INSERT INTO categories (group_id, name) VALUES (?, ?)').run(group.lastInsertRowid, 'Groceries').lastInsertRowid);
    catRent = Number(db.prepare('INSERT INTO categories (group_id, name) VALUES (?, ?)').run(group.lastInsertRowid, 'Rent').lastInsertRowid);
    catUtilities = Number(db.prepare('INSERT INTO categories (group_id, name) VALUES (?, ?)').run(group.lastInsertRowid, 'Utilities').lastInsertRowid);

    // Create a test account
    db.prepare('INSERT INTO accounts (id, name, institution, type, balance) VALUES (?, ?, ?, ?, ?)').run('acct-1', 'Checking', 'Bank', 'checking', 50000);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('default allocation CRUD', () => {
    it('sets a default allocation for a category', () => {
      setDefaultAllocation(db, catGroceries, 30000);
      const defaults = getDefaults(db);
      expect(defaults).toEqual([{ categoryId: catGroceries, amount: 30000 }]);
    });

    it('updates amount when setting default twice for same category', () => {
      setDefaultAllocation(db, catGroceries, 30000);
      setDefaultAllocation(db, catGroceries, 35000);
      const defaults = getDefaults(db);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].amount).toBe(35000);
    });

    it('returns empty array when no defaults set', () => {
      expect(getDefaults(db)).toEqual([]);
    });

    it('supports multiple category defaults', () => {
      setDefaultAllocation(db, catGroceries, 30000);
      setDefaultAllocation(db, catRent, 120000);
      const defaults = getDefaults(db);
      expect(defaults).toHaveLength(2);
    });

    it('deletes a default allocation', () => {
      setDefaultAllocation(db, catGroceries, 30000);
      deleteDefault(db, catGroceries);
      expect(getDefaults(db)).toEqual([]);
    });

    it('does not throw when deleting nonexistent default', () => {
      expect(() => deleteDefault(db, catGroceries)).not.toThrow();
    });
  });

  describe('monthly allocation CRUD', () => {
    it('sets a monthly allocation', () => {
      setAllocation(db, catGroceries, '2026-03', 25000);
      expect(getAllocation(db, catGroceries, '2026-03')).toBe(25000);
    });

    it('returns 0 for unset allocation', () => {
      expect(getAllocation(db, catGroceries, '2026-03')).toBe(0);
    });

    it('overwrites existing allocation (manual override)', () => {
      setAllocation(db, catGroceries, '2026-03', 25000);
      setAllocation(db, catGroceries, '2026-03', 40000);
      expect(getAllocation(db, catGroceries, '2026-03')).toBe(40000);
    });

    it('keeps allocations separate per period', () => {
      setAllocation(db, catGroceries, '2026-03', 25000);
      setAllocation(db, catGroceries, '2026-04', 30000);
      expect(getAllocation(db, catGroceries, '2026-03')).toBe(25000);
      expect(getAllocation(db, catGroceries, '2026-04')).toBe(30000);
    });

    it('does not confuse defaults with monthly allocations', () => {
      setDefaultAllocation(db, catGroceries, 30000);
      expect(getAllocation(db, catGroceries, '2026-03')).toBe(0);
    });
  });

  describe('spending computation', () => {
    it('returns 0 when no transactions exist', () => {
      expect(getSpentForCategory(db, catGroceries, '2026-03')).toBe(0);
    });

    it('sums negative transaction amounts for the category in the month', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -5000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-03-15', -3000, catGroceries);
      expect(getSpentForCategory(db, catGroceries, '2026-03')).toBe(8000);
    });

    it('ignores positive (income) transactions', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-01', 500000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-03-05', -5000, catGroceries);
      expect(getSpentForCategory(db, catGroceries, '2026-03')).toBe(5000);
    });

    it('only includes transactions from the requested period', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -5000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-04-05', -3000, catGroceries);
      expect(getSpentForCategory(db, catGroceries, '2026-03')).toBe(5000);
    });

    it('only includes transactions for the requested category', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -5000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-03-06', -8000, catRent);
      expect(getSpentForCategory(db, catGroceries, '2026-03')).toBe(5000);
    });

    it('excludes confirmed transfers from spending', () => {
      db.prepare('INSERT INTO accounts (id, name, institution, type, balance) VALUES (?, ?, ?, ?, ?)').run('acct-2', 'Savings', 'Bank', 'savings', 100000);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -5000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-03-10', -10000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t3', 'acct-2', '2026-03-10', 10000, catGroceries);
      // Confirm t2 and t3 as a transfer pair
      db.prepare('INSERT INTO transfer_links (transaction_a_id, transaction_b_id, confirmed) VALUES (?, ?, ?)').run('t2', 't3', 1);
      expect(getSpentForCategory(db, catGroceries, '2026-03')).toBe(5000);
    });

    it('does not exclude unconfirmed transfer suggestions', () => {
      db.prepare('INSERT INTO accounts (id, name, institution, type, balance) VALUES (?, ?, ?, ?, ?)').run('acct-2', 'Savings', 'Bank', 'savings', 100000);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -5000, catGroceries);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-2', '2026-03-05', 5000, catGroceries);
      db.prepare('INSERT INTO transfer_links (transaction_a_id, transaction_b_id, confirmed) VALUES (?, ?, ?)').run('t1', 't2', 0);
      expect(getSpentForCategory(db, catGroceries, '2026-03')).toBe(5000);
    });

    it('attributes split transaction amounts to the split category', () => {
      // Parent transaction categorized as Groceries, but split into Groceries + Utilities
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -10000, catGroceries);
      db.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run('t1', catGroceries, -7000);
      db.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run('t1', catUtilities, -3000);

      expect(getSpentForCategory(db, catGroceries, '2026-03')).toBe(7000);
      expect(getSpentForCategory(db, catUtilities, '2026-03')).toBe(3000);
    });

    it('handles mix of split and unsplit transactions', () => {
      // Unsplit transaction
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -5000, catGroceries);
      // Split transaction
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-03-10', -10000, catGroceries);
      db.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run('t2', catGroceries, -6000);
      db.prepare('INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)').run('t2', catUtilities, -4000);

      expect(getSpentForCategory(db, catGroceries, '2026-03')).toBe(11000); // 5000 + 6000
      expect(getSpentForCategory(db, catUtilities, '2026-03')).toBe(4000);
    });
  });
});
