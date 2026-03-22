import type Database from 'better-sqlite3';
import type { SimpleFINClient, SimpleFINAccountSet } from './simplefin-types.js';
import type { RateLimiter } from './rate-limiter.js';
import { normalizeAccount, normalizeTransaction } from './simplefin-client.js';
import { createBackup } from '../backup/backup.js';

export interface SyncResult {
  accountsSynced: number;
  transactionsAdded: number;
  errors: string[];
}

export interface SyncOptions {
  skipBackup?: boolean;
}

export async function runSync(
  db: Database.Database,
  client: SimpleFINClient,
  rateLimiter: RateLimiter,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const result: SyncResult = { accountsSynced: 0, transactionsAdded: 0, errors: [] };

  // Create sync_log entry
  const logStmt = db.prepare(
    `INSERT INTO sync_log (status) VALUES ('running')`,
  );
  const logInfo = logStmt.run();
  const syncLogId = logInfo.lastInsertRowid;

  try {
    const data: SimpleFINAccountSet = await client.fetchAccounts();

    // Log any per-account errors from SimpleFIN
    for (const err of data.errlist) {
      const msg = `SimpleFIN error [${err.code}]: ${err.msg}${err.account_id ? ` (account: ${err.account_id})` : ''}`;
      result.errors.push(msg);
    }

    // Build connection name lookup
    const connectionNames = new Map<string, string>();
    for (const conn of data.connections) {
      connectionNames.set(conn.conn_id, conn.name);
    }

    // Process each account sequentially
    for (const rawAccount of data.accounts) {
      if (!rateLimiter.canRequest(rawAccount.id)) {
        result.errors.push(`Rate limit exceeded for account ${rawAccount.name} (${rawAccount.id})`);
        continue;
      }

      try {
        const institution = connectionNames.get(rawAccount.conn_id) ?? rawAccount.conn_id;
        const txnsAdded = syncAccount(db, rawAccount, institution);
        result.accountsSynced++;
        result.transactionsAdded += txnsAdded;
        rateLimiter.increment(rawAccount.id);
      } catch (err) {
        const msg = `Sync failed for account ${rawAccount.name} (${rawAccount.id}): ${err instanceof Error ? err.message : String(err)}`;
        result.errors.push(msg);
      }
    }

    // Update sync_log to success
    db.prepare(
      `UPDATE sync_log SET status = 'success', completed_at = datetime('now'), accounts_synced = ?, transactions_added = ? WHERE id = ?`,
    ).run(result.accountsSynced, result.transactionsAdded, syncLogId);

    // Trigger backup after successful sync
    if (!options.skipBackup) {
      try {
        await createBackup(db);
      } catch {
        // Backup failure should not fail the sync
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);

    // Update sync_log to error
    db.prepare(
      `UPDATE sync_log SET status = 'error', completed_at = datetime('now'), error_message = ? WHERE id = ?`,
    ).run(msg, syncLogId);
  }

  return result;
}

function syncAccount(db: Database.Database, rawAccount: import('./simplefin-types.js').SimpleFINAccount, institution: string): number {
  const normalized = normalizeAccount(rawAccount, institution);

  return db.transaction(() => {
    // Upsert account
    db.prepare(`
      INSERT INTO accounts (id, name, institution, type, balance, currency, last_synced, simplefin_id)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        balance = excluded.balance,
        last_synced = datetime('now'),
        updated_at = datetime('now')
    `).run(
      normalized.id, normalized.name, normalized.institution,
      normalized.type, normalized.balance, normalized.currency, normalized.id,
    );

    // Insert transactions with dedup
    let added = 0;
    const txnStmt = db.prepare(`
      INSERT OR IGNORE INTO transactions (id, account_id, date, amount, pending, payee, memo, dedup_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rawTxn of rawAccount.transactions) {
      const txn = normalizeTransaction(rawTxn, rawAccount.id);
      const info = txnStmt.run(
        txn.id, txn.accountId, txn.date, txn.amount,
        txn.pending ? 1 : 0, txn.payee, txn.memo, txn.dedupHash,
      );
      if (info.changes > 0) added++;
    }

    // Record balance snapshot (INSERT OR REPLACE for same-day re-syncs)
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
      INSERT OR REPLACE INTO balance_snapshots (account_id, date, balance)
      VALUES (?, ?, ?)
    `).run(normalized.id, today, normalized.balance);

    return added;
  })();
}
