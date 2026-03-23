import type Database from 'better-sqlite3';

const DEFAULT_DATE_WINDOW_DAYS = 3;

export interface TransferLink {
  id: number;
  transactionAId: string;
  transactionBId: string;
  confirmed: number;
  createdAt: string;
}

export interface TransactionSide {
  id: string;
  date: string;
  payee: string | null;
  amount: number;
  accountName: string;
}

export interface TransferPair {
  id: number;
  transactionA: TransactionSide;
  transactionB: TransactionSide;
  createdAt: string;
}

interface TransactionRow {
  id: string;
  account_id: string;
  date: string;
  amount: number;
}

function canonicalOrder(txnA: TransactionRow, txnB: TransactionRow): [string, string] {
  if (txnA.date < txnB.date) return [txnA.id, txnB.id];
  if (txnA.date > txnB.date) return [txnB.id, txnA.id];
  return txnA.id < txnB.id ? [txnA.id, txnB.id] : [txnB.id, txnA.id];
}

export function detectTransferCandidates(
  db: Database.Database,
  transactionIds: string[],
  dateWindowDays: number = DEFAULT_DATE_WINDOW_DAYS,
): number {
  if (transactionIds.length === 0) return 0;

  const placeholders = transactionIds.map(() => '?').join(', ');
  const newTxns = db.prepare(`
    SELECT id, account_id, date, amount
    FROM transactions
    WHERE id IN (${placeholders}) AND pending = 0
  `).all(...transactionIds) as TransactionRow[];

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO transfer_links (transaction_a_id, transaction_b_id, confirmed)
    VALUES (?, ?, 0)
  `);

  let count = 0;

  for (const txn of newTxns) {
    // Find offsetting transactions on different accounts within the date window
    // that are not pending and not already linked
    const matches = db.prepare(`
      SELECT t.id, t.account_id, t.date, t.amount
      FROM transactions t
      WHERE t.amount = ?
        AND t.account_id != ?
        AND t.pending = 0
        AND ABS(julianday(t.date) - julianday(?)) <= ?
        AND t.id != ?
        AND NOT EXISTS (
          SELECT 1 FROM transfer_links tl
          WHERE tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id
        )
    `).all(-txn.amount, txn.account_id, txn.date, dateWindowDays, txn.id) as TransactionRow[];

    // Also check that the new transaction itself is not already linked
    const alreadyLinked = db.prepare(`
      SELECT 1 FROM transfer_links tl
      WHERE tl.transaction_a_id = ? OR tl.transaction_b_id = ?
    `).get(txn.id, txn.id);

    if (alreadyLinked) continue;

    for (const match of matches) {
      const [aId, bId] = canonicalOrder(txn, match);
      const result = insertStmt.run(aId, bId);
      if (result.changes > 0) count++;
    }
  }

  return count;
}

export function confirmTransfer(db: Database.Database, linkId: number): void {
  const result = db.prepare('UPDATE transfer_links SET confirmed = 1 WHERE id = ?').run(linkId);
  if (result.changes === 0) throw new Error(`Transfer link ${linkId} not found`);
}

export function dismissTransfer(db: Database.Database, linkId: number): void {
  const result = db.prepare('UPDATE transfer_links SET confirmed = -1 WHERE id = ?').run(linkId);
  if (result.changes === 0) throw new Error(`Transfer link ${linkId} not found`);
}

export function unlinkTransfer(db: Database.Database, linkId: number): void {
  const result = db.prepare('DELETE FROM transfer_links WHERE id = ?').run(linkId);
  if (result.changes === 0) throw new Error(`Transfer link ${linkId} not found`);
}

export function manuallyLinkTransfer(
  db: Database.Database,
  txnAId: string,
  txnBId: string,
): TransferLink {
  // Validate different accounts
  const txnA = db.prepare('SELECT id, account_id, date FROM transactions WHERE id = ?').get(txnAId) as TransactionRow | undefined;
  const txnB = db.prepare('SELECT id, account_id, date FROM transactions WHERE id = ?').get(txnBId) as TransactionRow | undefined;

  if (!txnA) throw new Error(`Transaction ${txnAId} not found`);
  if (!txnB) throw new Error(`Transaction ${txnBId} not found`);
  if (txnA.account_id === txnB.account_id) throw new Error('Transfer links must be between different accounts');

  const [aId, bId] = canonicalOrder(txnA, txnB);

  const result = db.prepare(`
    INSERT INTO transfer_links (transaction_a_id, transaction_b_id, confirmed)
    VALUES (?, ?, 1)
  `).run(aId, bId);

  return {
    id: Number(result.lastInsertRowid),
    transactionAId: aId,
    transactionBId: bId,
    confirmed: 1,
    createdAt: new Date().toISOString(),
  };
}

function queryTransferPairs(db: Database.Database, confirmedValue: number): TransferPair[] {
  const rows = db.prepare(`
    SELECT tl.id, tl.confirmed, tl.created_at,
      ta.id AS a_id, ta.date AS a_date, ta.payee AS a_payee, ta.amount AS a_amount, aa.name AS a_account_name,
      tb.id AS b_id, tb.date AS b_date, tb.payee AS b_payee, tb.amount AS b_amount, ab.name AS b_account_name
    FROM transfer_links tl
    JOIN transactions ta ON tl.transaction_a_id = ta.id
    JOIN accounts aa ON ta.account_id = aa.id
    JOIN transactions tb ON tl.transaction_b_id = tb.id
    JOIN accounts ab ON tb.account_id = ab.id
    WHERE tl.confirmed = ?
    ORDER BY tl.created_at DESC
  `).all(confirmedValue) as {
    id: number; confirmed: number; created_at: string;
    a_id: string; a_date: string; a_payee: string | null; a_amount: number; a_account_name: string;
    b_id: string; b_date: string; b_payee: string | null; b_amount: number; b_account_name: string;
  }[];

  return rows.map(r => ({
    id: r.id,
    transactionA: { id: r.a_id, date: r.a_date, payee: r.a_payee, amount: r.a_amount, accountName: r.a_account_name },
    transactionB: { id: r.b_id, date: r.b_date, payee: r.b_payee, amount: r.b_amount, accountName: r.b_account_name },
    createdAt: r.created_at,
  }));
}

export function listTransferCandidates(db: Database.Database): TransferPair[] {
  return queryTransferPairs(db, 0);
}

export function listConfirmedTransfers(db: Database.Database): TransferPair[] {
  return queryTransferPairs(db, 1);
}
