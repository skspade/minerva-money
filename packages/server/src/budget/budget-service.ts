import type Database from 'better-sqlite3';
import { listGroupsWithCategories } from '../categories/category-service.js';

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

function getPriorPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

export function getRollover(db: Database.Database, categoryId: number, period: string): number {
  // Get all allocation periods prior to the given period for this category
  const priorAllocations = db.prepare(`
    SELECT period, amount FROM budget_allocations
    WHERE category_id = ? AND period < ? AND is_default = 0
    ORDER BY period ASC
  `).all(categoryId, period) as { period: string; amount: number }[];

  let rollover = 0;
  for (const alloc of priorAllocations) {
    const spent = getSpentForCategory(db, categoryId, alloc.period);
    rollover += alloc.amount - spent;
  }
  return rollover;
}

export interface BudgetCategorySummary {
  categoryId: number;
  categoryName: string;
  groupName: string;
  allocated: number;
  spent: number;
  available: number;
  rollover: number;
}

export function getBudgetSummary(db: Database.Database, period: string): BudgetCategorySummary[] {
  const groups = listGroupsWithCategories(db);
  const results: BudgetCategorySummary[] = [];

  for (const group of groups) {
    for (const cat of group.categories) {
      const allocated = getAllocation(db, cat.id, period);
      const spent = getSpentForCategory(db, cat.id, period);
      const rollover = getRollover(db, cat.id, period);
      const available = allocated + rollover - spent;

      results.push({
        categoryId: cat.id,
        categoryName: cat.name,
        groupName: group.name,
        allocated,
        spent,
        available,
        rollover,
      });
    }
  }

  return results;
}

export function getAvailableToBudget(db: Database.Database, period: string): number {
  const startDate = `${period}-01`;
  const endDate = getNextMonthStart(period);

  // Total income: positive transactions excluding confirmed transfers
  const income = db.prepare(`
    SELECT COALESCE(SUM(t.amount), 0) AS total
    FROM transactions t
    WHERE t.date >= ? AND t.date < ?
      AND t.amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM transfer_links tl
        WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id)
        AND tl.confirmed = 1
      )
  `).get(startDate, endDate) as { total: number };

  // Total allocated for this period
  const allocated = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM budget_allocations
    WHERE period = ? AND is_default = 0
  `).get(period) as { total: number };

  // Prior month overspending deduction
  const priorPeriod = getPriorPeriod(period);
  const priorSummary = getBudgetSummary(db, priorPeriod);
  let overspendingDeduction = 0;
  for (const cat of priorSummary) {
    if (cat.available < 0) {
      overspendingDeduction += Math.abs(cat.available);
    }
  }

  return income.total - allocated.total - overspendingDeduction;
}

export function autoFundPeriod(db: Database.Database, period: string, step: 1 | 2): number {
  const defaults = getDefaults(db);
  let funded = 0;

  const run = db.transaction(() => {
    for (const def of defaults) {
      if (step === 1) {
        const halfAmount = Math.floor(def.amount / 2);
        const result = db.prepare(`
          INSERT OR IGNORE INTO budget_allocations (category_id, period, amount, is_default, funding_step)
          VALUES (?, ?, ?, 0, 1)
        `).run(def.categoryId, period, halfAmount);
        if (result.changes > 0) funded++;
      } else {
        const result = db.prepare(`
          UPDATE budget_allocations
          SET amount = ?, funding_step = 2, updated_at = datetime('now')
          WHERE category_id = ? AND period = ? AND funding_step = 1
        `).run(def.amount, def.categoryId, period);
        if (result.changes > 0) funded++;
      }
    }
  });

  run();
  return funded;
}
