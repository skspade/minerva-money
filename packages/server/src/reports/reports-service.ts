import type Database from 'better-sqlite3';

interface SpendingByCategory {
  categoryId: number;
  categoryName: string;
  groupName: string;
  total: number;
}

interface SpendingOverTime {
  period: string;
  total: number;
}

interface NetWorthPoint {
  date: string;
  total: number;
}

export function getSpendingByCategory(
  db: Database.Database,
  startDate: string,
  endDate: string,
): SpendingByCategory[] {
  // Unsplit transactions (no splits exist for this transaction)
  const unsplit = db.prepare(`
    SELECT t.category_id AS category_id, c.name AS category_name, cg.name AS group_name,
      COALESCE(SUM(ABS(t.amount)), 0) AS total
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN category_groups cg ON c.group_id = cg.id
    WHERE t.date >= ? AND t.date < ?
      AND t.amount < 0
      AND t.category_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id)
      AND NOT EXISTS (
        SELECT 1 FROM transfer_links tl
        WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id) AND tl.confirmed = 1
      )
    GROUP BY t.category_id
  `).all(startDate, endDate) as { category_id: number; category_name: string; group_name: string; total: number }[];

  // Split transactions
  const splits = db.prepare(`
    SELECT ts.category_id AS category_id, c.name AS category_name, cg.name AS group_name,
      COALESCE(SUM(ABS(ts.amount)), 0) AS total
    FROM transaction_splits ts
    JOIN transactions t ON ts.transaction_id = t.id
    LEFT JOIN categories c ON ts.category_id = c.id
    LEFT JOIN category_groups cg ON c.group_id = cg.id
    WHERE t.date >= ? AND t.date < ?
      AND ts.amount < 0
      AND NOT EXISTS (
        SELECT 1 FROM transfer_links tl
        WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id) AND tl.confirmed = 1
      )
    GROUP BY ts.category_id
  `).all(startDate, endDate) as { category_id: number; category_name: string; group_name: string; total: number }[];

  // Merge by categoryId
  const merged = new Map<number, SpendingByCategory>();

  for (const row of unsplit) {
    merged.set(row.category_id, {
      categoryId: row.category_id,
      categoryName: row.category_name,
      groupName: row.group_name,
      total: row.total,
    });
  }

  for (const row of splits) {
    const existing = merged.get(row.category_id);
    if (existing) {
      existing.total += row.total;
    } else {
      merged.set(row.category_id, {
        categoryId: row.category_id,
        categoryName: row.category_name,
        groupName: row.group_name,
        total: row.total,
      });
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.total - a.total);
}

export function getSpendingOverTime(
  db: Database.Database,
  startDate: string,
  endDate: string,
): SpendingOverTime[] {
  // Unsplit transactions
  const unsplit = db.prepare(`
    SELECT strftime('%Y-%m', t.date) AS period, COALESCE(SUM(ABS(t.amount)), 0) AS total
    FROM transactions t
    WHERE t.date >= ? AND t.date < ?
      AND t.amount < 0
      AND NOT EXISTS (SELECT 1 FROM transaction_splits ts WHERE ts.transaction_id = t.id)
      AND NOT EXISTS (
        SELECT 1 FROM transfer_links tl
        WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id) AND tl.confirmed = 1
      )
    GROUP BY strftime('%Y-%m', t.date)
    ORDER BY period ASC
  `).all(startDate, endDate) as { period: string; total: number }[];

  // Split transactions
  const splits = db.prepare(`
    SELECT strftime('%Y-%m', t.date) AS period, COALESCE(SUM(ABS(ts.amount)), 0) AS total
    FROM transaction_splits ts
    JOIN transactions t ON ts.transaction_id = t.id
    WHERE t.date >= ? AND t.date < ?
      AND ts.amount < 0
      AND NOT EXISTS (
        SELECT 1 FROM transfer_links tl
        WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id) AND tl.confirmed = 1
      )
    GROUP BY strftime('%Y-%m', t.date)
    ORDER BY period ASC
  `).all(startDate, endDate) as { period: string; total: number }[];

  // Merge by period
  const merged = new Map<string, number>();

  for (const row of unsplit) {
    merged.set(row.period, (merged.get(row.period) ?? 0) + row.total);
  }

  for (const row of splits) {
    merged.set(row.period, (merged.get(row.period) ?? 0) + row.total);
  }

  return Array.from(merged.entries())
    .map(([period, total]) => ({ period, total }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

export function getNetWorth(
  db: Database.Database,
  startDate?: string,
  endDate?: string,
): NetWorthPoint[] {
  let query = 'SELECT date, SUM(balance) AS total FROM balance_snapshots';
  const params: string[] = [];

  if (startDate && endDate) {
    query += ' WHERE date >= ? AND date <= ?';
    params.push(startDate, endDate);
  } else if (startDate) {
    query += ' WHERE date >= ?';
    params.push(startDate);
  } else if (endDate) {
    query += ' WHERE date <= ?';
    params.push(endDate);
  }

  query += ' GROUP BY date ORDER BY date ASC';

  const rows = db.prepare(query).all(...params) as { date: string; total: number }[];
  return rows.map(r => ({ date: r.date, total: r.total }));
}
