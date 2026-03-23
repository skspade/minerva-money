import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/connection.js';
import {
  setDefaultAllocation,
  getDefaults,
  deleteDefault,
  setAllocation,
  getAllocation,
  getSpentForCategory,
  getRollover,
  getBudgetSummary,
  getAvailableToBudget,
  autoFundPeriod,
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

  describe('rollover computation', () => {
    it('returns 0 when no prior months exist', () => {
      expect(getRollover(db, catGroceries, '2026-03')).toBe(0);
    });

    it('computes positive rollover from prior month surplus', () => {
      // Jan: allocated 10000, spent 8000 -> surplus 2000
      setAllocation(db, catGroceries, '2026-01', 10000);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-01-15', -8000, catGroceries);

      expect(getRollover(db, catGroceries, '2026-02')).toBe(2000);
    });

    it('computes negative rollover from prior month overspending', () => {
      // Jan: allocated 10000, spent 12000 -> deficit -2000
      setAllocation(db, catGroceries, '2026-01', 10000);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-01-15', -12000, catGroceries);

      expect(getRollover(db, catGroceries, '2026-02')).toBe(-2000);
    });

    it('accumulates rollover across multiple months', () => {
      // Jan: allocated 10000, spent 8000 -> +2000
      setAllocation(db, catGroceries, '2026-01', 10000);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-01-15', -8000, catGroceries);
      // Feb: allocated 10000, spent 9000 -> +1000
      setAllocation(db, catGroceries, '2026-02', 10000);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-02-15', -9000, catGroceries);

      // Mar rollover = Jan surplus (2000) + Feb surplus (1000) = 3000
      expect(getRollover(db, catGroceries, '2026-03')).toBe(3000);
    });

    it('only considers non-default allocation rows', () => {
      setDefaultAllocation(db, catGroceries, 10000);
      // No monthly allocation for Jan -> rollover should be 0 (spent 0, allocated 0)
      expect(getRollover(db, catGroceries, '2026-02')).toBe(0);
    });
  });

  describe('budget summary', () => {
    it('returns all categories with budget data', () => {
      setAllocation(db, catGroceries, '2026-03', 30000);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-03-05', -15000, catGroceries);

      const summary = getBudgetSummary(db, '2026-03');
      expect(summary.length).toBeGreaterThanOrEqual(3); // At least our 3 test categories

      const groceries = summary.find(s => s.categoryId === catGroceries);
      expect(groceries).toBeDefined();
      expect(groceries!.allocated).toBe(30000);
      expect(groceries!.spent).toBe(15000);
      expect(groceries!.available).toBe(15000); // 30000 - 15000 + 0 rollover
      expect(groceries!.rollover).toBe(0);
    });

    it('includes rollover in available calculation', () => {
      // Jan: allocated 10000, spent 5000 -> surplus 5000
      setAllocation(db, catGroceries, '2026-01', 10000);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-01-15', -5000, catGroceries);
      // Feb: allocated 10000, spent 8000
      setAllocation(db, catGroceries, '2026-02', 10000);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t2', 'acct-1', '2026-02-15', -8000, catGroceries);

      const summary = getBudgetSummary(db, '2026-02');
      const groceries = summary.find(s => s.categoryId === catGroceries)!;
      expect(groceries.rollover).toBe(5000);
      expect(groceries.available).toBe(7000); // 10000 + 5000 - 8000
    });

    it('shows zero for categories with no allocation', () => {
      const summary = getBudgetSummary(db, '2026-03');
      const rent = summary.find(s => s.categoryId === catRent)!;
      expect(rent.allocated).toBe(0);
      expect(rent.spent).toBe(0);
      expect(rent.available).toBe(0);
    });

    it('includes category and group names', () => {
      const summary = getBudgetSummary(db, '2026-03');
      const groceries = summary.find(s => s.categoryId === catGroceries)!;
      expect(groceries.categoryName).toBe('Groceries');
      expect(groceries.groupName).toBe('Essentials');
    });
  });

  describe('available-to-budget', () => {
    it('returns income minus total allocated', () => {
      // Income: 500000 cents
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('income-1', 'acct-1', '2026-03-01', 500000, null);
      // Allocations: 30000 + 12000 = 42000
      setAllocation(db, catGroceries, '2026-03', 30000);
      setAllocation(db, catRent, '2026-03', 12000);

      expect(getAvailableToBudget(db, '2026-03')).toBe(458000); // 500000 - 42000
    });

    it('excludes confirmed transfers from income', () => {
      db.prepare('INSERT INTO accounts (id, name, institution, type, balance) VALUES (?, ?, ?, ?, ?)').run('acct-2', 'Savings', 'Bank', 'savings', 100000);
      // Real income
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('income-1', 'acct-1', '2026-03-01', 500000, null);
      // Transfer received (should not count as income)
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('xfer-in', 'acct-2', '2026-03-05', 10000, null);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('xfer-out', 'acct-1', '2026-03-05', -10000, null);
      db.prepare('INSERT INTO transfer_links (transaction_a_id, transaction_b_id, confirmed) VALUES (?, ?, ?)').run('xfer-out', 'xfer-in', 1);

      expect(getAvailableToBudget(db, '2026-03')).toBe(500000);
    });

    it('deducts prior month overspending', () => {
      // Jan: Groceries allocated 10000, spent 15000 -> overspent by 5000
      setAllocation(db, catGroceries, '2026-01', 10000);
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('t1', 'acct-1', '2026-01-15', -15000, catGroceries);

      // Feb: income 500000, allocated 30000
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('income-1', 'acct-1', '2026-02-01', 500000, null);
      setAllocation(db, catGroceries, '2026-02', 30000);

      // Available = 500000 - 30000 - 5000 (overspending deduction) = 465000
      expect(getAvailableToBudget(db, '2026-02')).toBe(465000);
    });

    it('returns 0 when no income and no allocations', () => {
      expect(getAvailableToBudget(db, '2026-03')).toBe(0);
    });

    it('handles first month with no prior overspending', () => {
      db.prepare('INSERT INTO transactions (id, account_id, date, amount, category_id) VALUES (?, ?, ?, ?, ?)').run('income-1', 'acct-1', '2026-01-01', 500000, null);
      setAllocation(db, catGroceries, '2026-01', 30000);

      expect(getAvailableToBudget(db, '2026-01')).toBe(470000); // 500000 - 30000, no prior month
    });
  });

  describe('auto-funding', () => {
    it('step 1 allocates floor(default/2) for categories with defaults', () => {
      setDefaultAllocation(db, catGroceries, 30000);
      setDefaultAllocation(db, catRent, 120000);

      autoFundPeriod(db, '2026-03', 1);

      expect(getAllocation(db, catGroceries, '2026-03')).toBe(15000); // 30000/2
      expect(getAllocation(db, catRent, '2026-03')).toBe(60000); // 120000/2
    });

    it('step 1 handles odd-cent defaults correctly', () => {
      setDefaultAllocation(db, catGroceries, 1501); // Odd cents

      autoFundPeriod(db, '2026-03', 1);

      expect(getAllocation(db, catGroceries, '2026-03')).toBe(750); // floor(1501/2)
    });

    it('step 2 sets allocation to full default amount', () => {
      setDefaultAllocation(db, catGroceries, 30000);

      autoFundPeriod(db, '2026-03', 1);
      autoFundPeriod(db, '2026-03', 2);

      expect(getAllocation(db, catGroceries, '2026-03')).toBe(30000);
    });

    it('step 2 handles odd-cent defaults (rounding cent goes to second half)', () => {
      setDefaultAllocation(db, catGroceries, 1501);

      autoFundPeriod(db, '2026-03', 1);
      expect(getAllocation(db, catGroceries, '2026-03')).toBe(750);

      autoFundPeriod(db, '2026-03', 2);
      expect(getAllocation(db, catGroceries, '2026-03')).toBe(1501); // 750 + 751
    });

    it('step 1 does not overwrite manually set allocations', () => {
      setDefaultAllocation(db, catGroceries, 30000);
      setAllocation(db, catGroceries, '2026-03', 50000); // Manual override

      autoFundPeriod(db, '2026-03', 1);

      expect(getAllocation(db, catGroceries, '2026-03')).toBe(50000); // Preserved
    });

    it('step 2 does not overwrite manually set allocations', () => {
      setDefaultAllocation(db, catGroceries, 30000);
      setAllocation(db, catGroceries, '2026-03', 50000); // Manual override

      autoFundPeriod(db, '2026-03', 2);

      expect(getAllocation(db, catGroceries, '2026-03')).toBe(50000); // Preserved
    });

    it('step 1 is idempotent', () => {
      setDefaultAllocation(db, catGroceries, 30000);

      const first = autoFundPeriod(db, '2026-03', 1);
      const second = autoFundPeriod(db, '2026-03', 1);

      expect(first).toBe(1);
      expect(second).toBe(0); // No new rows inserted
      expect(getAllocation(db, catGroceries, '2026-03')).toBe(15000);
    });

    it('step 2 is idempotent', () => {
      setDefaultAllocation(db, catGroceries, 30000);

      autoFundPeriod(db, '2026-03', 1);
      autoFundPeriod(db, '2026-03', 2);
      const result = autoFundPeriod(db, '2026-03', 2);

      expect(result).toBe(0); // No rows with funding_step=1 remain
      expect(getAllocation(db, catGroceries, '2026-03')).toBe(30000);
    });

    it('does not create allocations for categories without defaults', () => {
      setDefaultAllocation(db, catGroceries, 30000);
      // catRent has no default

      autoFundPeriod(db, '2026-03', 1);

      expect(getAllocation(db, catRent, '2026-03')).toBe(0);
    });

    it('returns count of categories funded', () => {
      setDefaultAllocation(db, catGroceries, 30000);
      setDefaultAllocation(db, catRent, 120000);

      const count = autoFundPeriod(db, '2026-03', 1);
      expect(count).toBe(2);
    });
  });
});
