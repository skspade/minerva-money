import type Database from 'better-sqlite3';
import type { SimpleFINClient, SimpleFINAccountSet, SimpleFINAccount, SimpleFINError } from './simplefin-types.js';
import type { RateLimiter } from './rate-limiter.js';
import { normalizeAccount, normalizeTransaction } from './simplefin-client.js';
import { createBackup } from '../backup/backup.js';
import { categorizeNewTransactions } from '../rules/rules-service.js';
import { detectTransferCandidates } from '../transfers/transfer-service.js';

export interface SyncResult {
  accountsSynced: number;
  transactionsAdded: number;
  errors: string[];
}

export interface SyncOptions {
  skipBackup?: boolean;
}

/** UPSERT a warning row for a specific account */
function writeWarning(
  db: Database.Database,
  syncLogId: number | bigint,
  accountId: string,
  accountName: string,
  errorCode: string,
  message: string,
): void {
  db.prepare(`
    INSERT INTO sync_warnings (sync_log_id, account_id, account_name, error_code, message)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      sync_log_id = excluded.sync_log_id,
      error_code = excluded.error_code,
      message = excluded.message,
      last_seen = datetime('now'),
      occurrence_count = occurrence_count + 1
  `).run(syncLogId, accountId, accountName, errorCode, message);
}

export async function runSync(
  db: Database.Database,
  client: SimpleFINClient,
  rateLimiter: RateLimiter,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const result: SyncResult = { accountsSynced: 0, transactionsAdded: 0, errors: [] };

  // Clean up stale 'running' sync_log entries before creating a new one
  db.prepare(
    `UPDATE sync_log SET status = 'error', completed_at = datetime('now'), error_message = 'Stale: superseded by new sync run' WHERE status = 'running'`,
  ).run();

  // Create sync_log entry
  const logStmt = db.prepare(
    `INSERT INTO sync_log (status) VALUES ('running')`,
  );
  const logInfo = logStmt.run();
  const syncLogId = logInfo.lastInsertRowid;

  try {
    const data: SimpleFINAccountSet = await client.fetchAccounts();

    // Build lookup maps for error processing
    const accountById = new Map<string, SimpleFINAccount>();
    const accountsByConnId = new Map<string, SimpleFINAccount[]>();
    for (const acct of data.accounts) {
      accountById.set(acct.id, acct);
      const list = accountsByConnId.get(acct.conn_id) ?? [];
      list.push(acct);
      accountsByConnId.set(acct.conn_id, list);
    }

    // Track which accounts have errors (for status + auto-clear logic)
    const errorAccountIds = new Set<string>();

    // Process SimpleFIN error list and write warnings
    const errList = data.errors ?? data.errlist ?? [];
    for (const err of errList) {
      const msg = `SimpleFIN error [${err.code}]: ${err.msg}${err.account_id ? ` (account: ${err.account_id})` : ''}`;
      result.errors.push(msg);

      if (err.account_id) {
        // Account-level error
        const acct = accountById.get(err.account_id);
        const accountName = acct?.name ?? err.account_id;
        writeWarning(db, syncLogId, err.account_id, accountName, err.code, err.msg);
        errorAccountIds.add(err.account_id);
      } else if (err.conn_id) {
        // Connection-level error: map to all accounts on this connection
        const connAccounts = accountsByConnId.get(err.conn_id) ?? [];
        if (connAccounts.length === 0) {
          // Edge case: connection failed before returning any accounts
          writeWarning(db, syncLogId, err.conn_id, err.conn_id, err.code, err.msg);
          errorAccountIds.add(err.conn_id);
        } else {
          for (const acct of connAccounts) {
            writeWarning(db, syncLogId, acct.id, acct.name, err.code, err.msg);
            errorAccountIds.add(acct.id);
          }
        }
      }
    }

    // Process each account sequentially
    for (const rawAccount of data.accounts) {
      if (!rateLimiter.canRequest(rawAccount.id)) {
        result.errors.push(`Rate limit exceeded for account ${rawAccount.name} (${rawAccount.id})`);
        continue;
      }

      try {
        const institution = rawAccount.org?.name ?? rawAccount.conn_id;
        const txnsAdded = syncAccount(db, rawAccount, institution);
        result.accountsSynced++;
        result.transactionsAdded += txnsAdded;
        rateLimiter.increment(rawAccount.id);
      } catch (err) {
        const msg = `Sync failed for account ${rawAccount.name} (${rawAccount.id}): ${err instanceof Error ? err.message : String(err)}`;
        result.errors.push(msg);
        // Write warning for per-account processing errors
        writeWarning(db, syncLogId, rawAccount.id, rawAccount.name, 'sync_error', err instanceof Error ? err.message : String(err));
        errorAccountIds.add(rawAccount.id);
      }
    }

    // Auto-clear warnings for accounts that appeared in this response AND had no errors
    const responseAccountIds = new Set(data.accounts.map(a => a.id));
    const accountsToClear = [...responseAccountIds].filter(id => !errorAccountIds.has(id));
    if (accountsToClear.length > 0) {
      const placeholders = accountsToClear.map(() => '?').join(',');
      db.prepare(`DELETE FROM sync_warnings WHERE account_id IN (${placeholders})`).run(...accountsToClear);
    }

    // Determine sync_log status
    const hasErrors = errorAccountIds.size > 0;
    let status: string;
    if (hasErrors && result.accountsSynced > 0) {
      status = 'partial';
    } else if (hasErrors && result.accountsSynced === 0) {
      status = 'error';
    } else {
      status = 'success';
    }

    // Update sync_log with final status
    db.prepare(
      `UPDATE sync_log SET status = ?, completed_at = datetime('now'), accounts_synced = ?, transactions_added = ? WHERE id = ?`,
    ).run(status, result.accountsSynced, result.transactionsAdded, syncLogId);

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
    const newTransactionIds: string[] = [];
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
      if (info.changes > 0) {
        added++;
        newTransactionIds.push(txn.id);
      }
    }

    // Auto-categorize new transactions using rules engine
    if (newTransactionIds.length > 0) {
      categorizeNewTransactions(db, newTransactionIds);
      detectTransferCandidates(db, newTransactionIds);
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
