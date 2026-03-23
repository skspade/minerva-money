import type Database from 'better-sqlite3';

export function setDefaultAllocation(db: Database.Database, categoryId: number, amount: number): void {
  db.prepare(`
    INSERT INTO budget_allocations (category_id, period, amount, is_default)
    VALUES (?, 'default', ?, 1)
    ON CONFLICT(category_id, period) DO UPDATE SET amount = excluded.amount, updated_at = datetime('now')
  `).run(categoryId, amount);
}

export function getDefaults(db: Database.Database): { categoryId: number; amount: number }[] {
  const rows = db.prepare(`
    SELECT category_id, amount FROM budget_allocations
    WHERE is_default = 1 AND period = 'default'
  `).all() as { category_id: number; amount: number }[];
  return rows.map(r => ({ categoryId: r.category_id, amount: r.amount }));
}

export function deleteDefault(db: Database.Database, categoryId: number): void {
  db.prepare(`
    DELETE FROM budget_allocations WHERE category_id = ? AND period = 'default' AND is_default = 1
  `).run(categoryId);
}

export function setAllocation(db: Database.Database, categoryId: number, period: string, amount: number): void {
  db.prepare(`
    INSERT INTO budget_allocations (category_id, period, amount, is_default)
    VALUES (?, ?, ?, 0)
    ON CONFLICT(category_id, period) DO UPDATE SET amount = excluded.amount, updated_at = datetime('now')
  `).run(categoryId, period, amount);
}

export function getAllocation(db: Database.Database, categoryId: number, period: string): number {
  const row = db.prepare(`
    SELECT amount FROM budget_allocations WHERE category_id = ? AND period = ? AND is_default = 0
  `).get(categoryId, period) as { amount: number } | undefined;
  return row?.amount ?? 0;
}

function getNextMonthStart(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

export function getSpentForCategory(db: Database.Database, categoryId: number, period: string): number {
  const startDate = `${period}-01`;
  const endDate = getNextMonthStart(period);

  // Sum spending from unsplit transactions for this category
  const unsplit = db.prepare(`
    SELECT COALESCE(SUM(t.amount), 0) AS total
    FROM transactions t
    WHERE t.category_id = ?
      AND t.date >= ? AND t.date < ?
      AND t.amount < 0
      AND NOT EXISTS (
        SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM transfer_links tl
        WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id)
        AND tl.confirmed = 1
      )
  `).get(categoryId, startDate, endDate) as { total: number };

  // Sum spending from split transactions for this category
  const split = db.prepare(`
    SELECT COALESCE(SUM(ts.amount), 0) AS total
    FROM transaction_splits ts
    JOIN transactions t ON ts.transaction_id = t.id
    WHERE ts.category_id = ?
      AND t.date >= ? AND t.date < ?
      AND ts.amount < 0
      AND NOT EXISTS (
        SELECT 1 FROM transfer_links tl
        WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id)
        AND tl.confirmed = 1
      )
  `).get(categoryId, startDate, endDate) as { total: number };

  return Math.abs(unsplit.total + split.total);
}
