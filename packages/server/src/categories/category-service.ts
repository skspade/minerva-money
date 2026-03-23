import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

interface CategoryGroup {
  id: number;
  name: string;
  sort_order: number;
  categories: Category[];
}

interface Category {
  id: number;
  name: string;
  sort_order: number;
}

export function listGroupsWithCategories(db: Database.Database): CategoryGroup[] {
  const groups = db.prepare(
    'SELECT id, name, sort_order FROM category_groups ORDER BY sort_order ASC, id ASC',
  ).all() as { id: number; name: string; sort_order: number }[];

  const catStmt = db.prepare(
    'SELECT id, name, sort_order FROM categories WHERE group_id = ? ORDER BY sort_order ASC, id ASC',
  );

  return groups.map(g => ({
    id: g.id,
    name: g.name,
    sort_order: g.sort_order,
    categories: catStmt.all(g.id) as Category[],
  }));
}

export function createGroup(db: Database.Database, name: string): { id: number; name: string } {
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM category_groups',
  ).get() as { next: number };

  const result = db.prepare(
    'INSERT INTO category_groups (name, sort_order) VALUES (?, ?)',
  ).run(name, maxOrder.next);

  return { id: Number(result.lastInsertRowid), name };
}

export function renameGroup(db: Database.Database, id: number, name: string): void {
  db.prepare('UPDATE category_groups SET name = ? WHERE id = ?').run(name, id);
}

export function reorderGroups(db: Database.Database, ids: number[]): void {
  const stmt = db.prepare('UPDATE category_groups SET sort_order = ? WHERE id = ?');
  db.transaction(() => {
    ids.forEach((id, index) => stmt.run(index, id));
  })();
}

export function deleteGroup(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM category_groups WHERE id = ?').run(id);
}

export function createCategory(db: Database.Database, groupId: number, name: string): { id: number; name: string } {
  const maxOrder = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM categories WHERE group_id = ?',
  ).get(groupId) as { next: number };

  const result = db.prepare(
    'INSERT INTO categories (group_id, name, sort_order) VALUES (?, ?, ?)',
  ).run(groupId, name, maxOrder.next);

  return { id: Number(result.lastInsertRowid), name };
}

export function renameCategory(db: Database.Database, id: number, name: string): void {
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name, id);
}

export function reorderCategories(db: Database.Database, groupId: number, ids: number[]): void {
  const stmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ? AND group_id = ?');
  db.transaction(() => {
    ids.forEach((id, index) => stmt.run(index, id, groupId));
  })();
}

export function deleteCategory(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}

export function updateTransactionCategory(db: Database.Database, transactionId: string, categoryId: number | null): void {
  db.transaction(() => {
    db.prepare('DELETE FROM transaction_splits WHERE transaction_id = ?').run(transactionId);
    db.prepare('UPDATE transactions SET category_id = ? WHERE id = ?').run(categoryId, transactionId);
  })();
}

export function createSplits(
  db: Database.Database,
  transactionId: string,
  splits: Array<{ categoryId: number; amount: number }>,
): void {
  if (splits.length === 0) {
    throw new Error('At least one split is required');
  }

  const txn = db.prepare('SELECT amount FROM transactions WHERE id = ?').get(transactionId) as { amount: number } | undefined;
  if (!txn) {
    throw new Error(`Transaction ${transactionId} not found`);
  }

  const splitSum = splits.reduce((sum, s) => sum + s.amount, 0);
  if (splitSum !== Math.abs(txn.amount)) {
    throw new Error(`Split amounts must sum to transaction amount (expected ${Math.abs(txn.amount)}, got ${splitSum})`);
  }

  const insertStmt = db.prepare(
    'INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES (?, ?, ?)',
  );

  db.transaction(() => {
    db.prepare('DELETE FROM transaction_splits WHERE transaction_id = ?').run(transactionId);
    for (const split of splits) {
      insertStmt.run(transactionId, split.categoryId, split.amount);
    }
    db.prepare('UPDATE transactions SET category_id = NULL WHERE id = ?').run(transactionId);
  })();
}

export function deleteSplits(db: Database.Database, transactionId: string): void {
  db.prepare('DELETE FROM transaction_splits WHERE transaction_id = ?').run(transactionId);
}

export function createManualTransaction(
  db: Database.Database,
  input: {
    accountId: string;
    date: string;
    amount: number;
    payee: string;
    memo?: string;
    categoryId?: number;
  },
): { id: string } {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO transactions (id, account_id, date, amount, payee, memo, category_id, pending)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(id, input.accountId, input.date, input.amount, input.payee, input.memo ?? null, input.categoryId ?? null);
  return { id };
}
