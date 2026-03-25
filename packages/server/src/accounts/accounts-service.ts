import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import type Database from 'better-sqlite3';

export interface Account {
  id: string;
  name: string;
  institution: string;
  type: string;
  balance: number;
  source: string;
  lastSynced: string | null;
}

interface AccountRow {
  id: string;
  name: string;
  institution: string;
  type: string;
  balance: number;
  source: string;
  last_synced: string | null;
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    type: row.type,
    balance: row.balance,
    source: row.source,
    lastSynced: row.last_synced,
  };
}

function getAccountOrThrow(db: Database.Database, id: string): AccountRow {
  const row = db.prepare(
    'SELECT id, name, institution, type, balance, source, last_synced FROM accounts WHERE id = ?',
  ).get(id) as AccountRow | undefined;

  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Account ${id} not found` });
  }

  return row;
}

function assertManual(row: AccountRow): void {
  if (row.source !== 'manual') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Synced accounts cannot be modified — they are managed by SimpleFIN',
    });
  }
}

export function createAccount(
  db: Database.Database,
  input: { name: string; institution: string; type?: string },
): Account {
  const id = `manual_${randomUUID()}`;
  const type = input.type ?? 'banking';

  db.prepare(`
    INSERT INTO accounts (id, name, institution, type, balance, currency, source)
    VALUES (?, ?, ?, ?, 0, 'USD', 'manual')
  `).run(id, input.name, input.institution, type);

  const row = getAccountOrThrow(db, id);
  return toAccount(row);
}

export function updateAccount(
  db: Database.Database,
  id: string,
  input: { name?: string; institution?: string; type?: string },
): Account {
  const row = getAccountOrThrow(db, id);
  assertManual(row);

  const updates: string[] = [];
  const values: (string)[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    values.push(input.name);
  }
  if (input.institution !== undefined) {
    updates.push('institution = ?');
    values.push(input.institution);
  }
  if (input.type !== undefined) {
    updates.push('type = ?');
    values.push(input.type);
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(id);
    db.prepare(`UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const updated = getAccountOrThrow(db, id);
  return toAccount(updated);
}

export function deleteAccount(db: Database.Database, id: string): void {
  const row = getAccountOrThrow(db, id);
  assertManual(row);

  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
}

export function recalculateBalance(db: Database.Database, accountId: string): number {
  const result = db.prepare(
    'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE account_id = ?',
  ).get(accountId) as { total: number };

  const balance = result.total;

  db.prepare(
    "UPDATE accounts SET balance = ?, last_synced = datetime('now'), updated_at = datetime('now') WHERE id = ?",
  ).run(balance, accountId);

  // Record balance snapshot for today (INSERT OR REPLACE for same-day recalculations)
  const today = new Date().toISOString().split('T')[0];
  db.prepare(`
    INSERT OR REPLACE INTO balance_snapshots (account_id, date, balance)
    VALUES (?, ?, ?)
  `).run(accountId, today, balance);

  return balance;
}
