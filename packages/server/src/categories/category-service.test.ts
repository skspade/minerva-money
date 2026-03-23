import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../db/connection.js';
import {
  listGroupsWithCategories,
  createGroup,
  renameGroup,
  reorderGroups,
  deleteGroup,
  createCategory,
  renameCategory,
  reorderCategories,
  deleteCategory,
  updateTransactionCategory,
  createSplits,
  deleteSplits,
  createManualTransaction,
} from './category-service.js';
import type Database from 'better-sqlite3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

describe('category-service', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-cat-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('category groups', () => {
    it('creates a group and returns it with id', () => {
      const group = createGroup(db, 'Housing');
      expect(group.id).toBeGreaterThan(0);
      expect(group.name).toBe('Housing');
    });

    it('lists groups with nested categories sorted by sort_order', () => {
      const g1 = createGroup(db, 'Housing');
      const g2 = createGroup(db, 'Food');
      createCategory(db, g1.id, 'Rent');
      createCategory(db, g1.id, 'Utilities');
      createCategory(db, g2.id, 'Groceries');

      const groups = listGroupsWithCategories(db);
      expect(groups).toHaveLength(2);
      expect(groups[0].name).toBe('Housing');
      expect(groups[0].categories).toHaveLength(2);
      expect(groups[1].name).toBe('Food');
      expect(groups[1].categories).toHaveLength(1);
    });

    it('renames a group', () => {
      const group = createGroup(db, 'Old Name');
      renameGroup(db, group.id, 'New Name');

      const groups = listGroupsWithCategories(db);
      expect(groups[0].name).toBe('New Name');
    });

    it('reorders groups', () => {
      const g1 = createGroup(db, 'A');
      const g2 = createGroup(db, 'B');
      const g3 = createGroup(db, 'C');

      reorderGroups(db, [g3.id, g1.id, g2.id]);

      const groups = listGroupsWithCategories(db);
      expect(groups.map(g => g.name)).toEqual(['C', 'A', 'B']);
    });

    it('deletes a group and cascades to categories', () => {
      const group = createGroup(db, 'Housing');
      createCategory(db, group.id, 'Rent');
      createCategory(db, group.id, 'Utilities');

      deleteGroup(db, group.id);

      const groups = listGroupsWithCategories(db);
      expect(groups).toHaveLength(0);

      const cats = db.prepare('SELECT * FROM categories WHERE group_id = ?').all(group.id);
      expect(cats).toHaveLength(0);
    });

    it('returns empty categories array for group with no categories', () => {
      createGroup(db, 'Empty');
      const groups = listGroupsWithCategories(db);
      expect(groups[0].categories).toEqual([]);
    });
  });

  describe('categories', () => {
    it('creates a category within a group', () => {
      const group = createGroup(db, 'Food');
      const cat = createCategory(db, group.id, 'Groceries');
      expect(cat.id).toBeGreaterThan(0);
      expect(cat.name).toBe('Groceries');
    });

    it('renames a category', () => {
      const group = createGroup(db, 'Food');
      const cat = createCategory(db, group.id, 'Groceries');
      renameCategory(db, cat.id, 'Supermarket');

      const groups = listGroupsWithCategories(db);
      expect(groups[0].categories[0].name).toBe('Supermarket');
    });

    it('reorders categories within a group', () => {
      const group = createGroup(db, 'Food');
      const c1 = createCategory(db, group.id, 'A');
      const c2 = createCategory(db, group.id, 'B');
      const c3 = createCategory(db, group.id, 'C');

      reorderCategories(db, group.id, [c3.id, c1.id, c2.id]);

      const groups = listGroupsWithCategories(db);
      expect(groups[0].categories.map(c => c.name)).toEqual(['C', 'A', 'B']);
    });

    it('deleting a category sets transaction category_id to NULL', () => {
      const group = createGroup(db, 'Food');
      const cat = createCategory(db, group.id, 'Groceries');

      // Insert an account and transaction
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 0)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee, category_id) VALUES ('tx1', 'acc1', '2026-01-01', -1500, 'Store', ?)").run(cat.id);

      deleteCategory(db, cat.id);

      const txn = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('tx1') as { category_id: number | null };
      expect(txn.category_id).toBeNull();
    });
  });

  describe('transaction categorization', () => {
    beforeEach(() => {
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 0)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('tx1', 'acc1', '2026-01-01', -5000, 'Store')").run();
    });

    it('assigns a category to a transaction', () => {
      const group = createGroup(db, 'Food');
      const cat = createCategory(db, group.id, 'Groceries');

      updateTransactionCategory(db, 'tx1', cat.id);

      const txn = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('tx1') as { category_id: number | null };
      expect(txn.category_id).toBe(cat.id);
    });

    it('clears category by passing null', () => {
      const group = createGroup(db, 'Food');
      const cat = createCategory(db, group.id, 'Groceries');
      updateTransactionCategory(db, 'tx1', cat.id);
      updateTransactionCategory(db, 'tx1', null);

      const txn = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('tx1') as { category_id: number | null };
      expect(txn.category_id).toBeNull();
    });

    it('clears existing splits when assigning a category', () => {
      const group = createGroup(db, 'Food');
      const c1 = createCategory(db, group.id, 'Groceries');
      const c2 = createCategory(db, group.id, 'Restaurants');

      createSplits(db, 'tx1', [
        { categoryId: c1.id, amount: 3000 },
        { categoryId: c2.id, amount: 2000 },
      ]);

      updateTransactionCategory(db, 'tx1', c1.id);

      const splits = db.prepare('SELECT * FROM transaction_splits WHERE transaction_id = ?').all('tx1');
      expect(splits).toHaveLength(0);
    });
  });

  describe('transaction splits', () => {
    beforeEach(() => {
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 0)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('tx1', 'acc1', '2026-01-01', -5000, 'Store')").run();
    });

    it('creates splits that sum to transaction total', () => {
      const group = createGroup(db, 'Food');
      const c1 = createCategory(db, group.id, 'Groceries');
      const c2 = createCategory(db, group.id, 'Restaurants');

      createSplits(db, 'tx1', [
        { categoryId: c1.id, amount: 3000 },
        { categoryId: c2.id, amount: 2000 },
      ]);

      const splits = db.prepare('SELECT * FROM transaction_splits WHERE transaction_id = ?').all('tx1');
      expect(splits).toHaveLength(2);

      // category_id should be NULL for split transactions
      const txn = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('tx1') as { category_id: number | null };
      expect(txn.category_id).toBeNull();
    });

    it('rejects splits that do not sum to transaction amount', () => {
      const group = createGroup(db, 'Food');
      const c1 = createCategory(db, group.id, 'Groceries');
      const c2 = createCategory(db, group.id, 'Restaurants');

      expect(() =>
        createSplits(db, 'tx1', [
          { categoryId: c1.id, amount: 3000 },
          { categoryId: c2.id, amount: 1000 },
        ]),
      ).toThrow('Split amounts must sum to transaction amount');
    });

    it('rejects empty splits array', () => {
      expect(() => createSplits(db, 'tx1', [])).toThrow('At least one split is required');
    });

    it('deletes all splits for a transaction', () => {
      const group = createGroup(db, 'Food');
      const c1 = createCategory(db, group.id, 'Groceries');
      const c2 = createCategory(db, group.id, 'Restaurants');

      createSplits(db, 'tx1', [
        { categoryId: c1.id, amount: 3000 },
        { categoryId: c2.id, amount: 2000 },
      ]);

      deleteSplits(db, 'tx1');

      const splits = db.prepare('SELECT * FROM transaction_splits WHERE transaction_id = ?').all('tx1');
      expect(splits).toHaveLength(0);
    });
  });

  describe('manual transaction entry', () => {
    beforeEach(() => {
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 0)").run();
    });

    it('creates a manual transaction with UUID id', () => {
      const result = createManualTransaction(db, {
        accountId: 'acc1',
        date: '2026-03-22',
        amount: -4599,
        payee: 'Coffee Shop',
      });

      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

      const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.id) as {
        id: string; account_id: string; date: string; amount: number;
        payee: string; memo: string | null; category_id: number | null;
        dedup_hash: string | null; pending: number;
      };

      expect(txn.account_id).toBe('acc1');
      expect(txn.date).toBe('2026-03-22');
      expect(txn.amount).toBe(-4599);
      expect(txn.payee).toBe('Coffee Shop');
      expect(txn.dedup_hash).toBeNull();
      expect(txn.pending).toBe(0);
    });

    it('creates a manual transaction with optional category and memo', () => {
      const group = createGroup(db, 'Food');
      const cat = createCategory(db, group.id, 'Coffee');

      const result = createManualTransaction(db, {
        accountId: 'acc1',
        date: '2026-03-22',
        amount: -599,
        payee: 'Starbucks',
        memo: 'Morning latte',
        categoryId: cat.id,
      });

      const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.id) as {
        memo: string | null; category_id: number | null;
      };

      expect(txn.memo).toBe('Morning latte');
      expect(txn.category_id).toBe(cat.id);
    });
  });
});
