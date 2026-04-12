import { createHash } from 'node:crypto';
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

    // Track which SimpleFIN account IDs have errors (for status + auto-clear logic)
    const errorSimplefinIds = new Set<string>();

    // Map SimpleFIN IDs to internal IDs (built during account processing)
    const simplefinToInternal = new Map<string, string>();

    // Process each account sequentially (before errors, so we have the ID mapping)
    for (const rawAccount of data.accounts) {
      if (!rateLimiter.canRequest(rawAccount.id)) {
        result.errors.push(`Rate limit exceeded for account ${rawAccount.name} (${rawAccount.id})`);
        continue;
      }

      try {
        const institution = rawAccount.org?.name ?? rawAccount.conn_id;
        const { internalId, transactionsAdded } = syncAccount(db, rawAccount, institution);
        simplefinToInternal.set(rawAccount.id, internalId);
        result.accountsSynced++;
        result.transactionsAdded += transactionsAdded;
        rateLimiter.increment(rawAccount.id);
      } catch (err) {
        const msg = `Sync failed for account ${rawAccount.name} (${rawAccount.id}): ${err instanceof Error ? err.message : String(err)}`;
        result.errors.push(msg);
        const warnId = simplefinToInternal.get(rawAccount.id) ?? rawAccount.id;
        writeWarning(db, syncLogId, warnId, rawAccount.name, 'sync_error', err instanceof Error ? err.message : String(err));
        errorSimplefinIds.add(rawAccount.id);
      }
    }

    // Process SimpleFIN error list and write warnings (using internal IDs where available)
    // SimpleFIN may return errors as plain strings or structured objects
    const rawErrList: (string | SimpleFINError)[] = data.errors ?? data.errlist ?? [];
    for (const rawErr of rawErrList) {
      // Normalize: SimpleFIN returns plain strings or { code, msg, account_id?, conn_id? }
      const err: SimpleFINError = typeof rawErr === 'string'
        ? { code: 'connection_error', msg: rawErr }
        : rawErr;

      const msg = `SimpleFIN error [${err.code}]: ${err.msg}${err.account_id ? ` (account: ${err.account_id})` : ''}`;
      result.errors.push(msg);

      if (err.account_id) {
        // Account-level error — resolve to internal ID
        const acct = accountById.get(err.account_id);
        const accountName = acct?.name ?? err.account_id;
        const warnId = simplefinToInternal.get(err.account_id) ?? err.account_id;
        writeWarning(db, syncLogId, warnId, accountName, err.code, err.msg);
        errorSimplefinIds.add(err.account_id);
      } else if (err.conn_id) {
        // Connection-level error: map to all accounts on this connection
        const connAccounts = accountsByConnId.get(err.conn_id) ?? [];
        if (connAccounts.length === 0) {
          // Edge case: connection failed before returning any accounts
          writeWarning(db, syncLogId, err.conn_id, err.conn_id, err.code, err.msg);
          errorSimplefinIds.add(err.conn_id);
        } else {
          for (const acct of connAccounts) {
            const warnId = simplefinToInternal.get(acct.id) ?? acct.id;
            writeWarning(db, syncLogId, warnId, acct.name, err.code, err.msg);
            errorSimplefinIds.add(acct.id);
          }
        }
      } else {
        // Unmapped error (no account_id or conn_id) — extract institution name
        // and write a connection-level warning with a stable synthetic ID
        const nameMatch = err.msg.match(/Connection to (.+?)(?:\s+may\s+need|\s+is\s+having|\s+has\s+)/i);
        const displayName = nameMatch ? nameMatch[1] : 'Unknown connection';
        const syntheticId = `conn_err_${createHash('sha256').update(displayName).digest('hex').slice(0, 12)}`;
        writeWarning(db, syncLogId, syntheticId, displayName, err.code, err.msg);
        errorSimplefinIds.add(syntheticId);
      }
    }

    // Auto-clear warnings for accounts that synced without errors
    const internalIdsToClear: string[] = [];
    const successfulOrgNames = new Set<string>();
    for (const rawAccount of data.accounts) {
      if (!errorSimplefinIds.has(rawAccount.id)) {
        const internalId = simplefinToInternal.get(rawAccount.id) ?? rawAccount.id;
        internalIdsToClear.push(internalId);
        if (rawAccount.org?.name) successfulOrgNames.add(rawAccount.org.name);
      }
    }
    if (internalIdsToClear.length > 0) {
      const placeholders = internalIdsToClear.map(() => '?').join(',');
      db.prepare(`DELETE FROM sync_warnings WHERE account_id IN (${placeholders})`).run(...internalIdsToClear);
    }
    // Clear synthetic connection-error warnings when the institution's accounts sync fine
    for (const orgName of successfulOrgNames) {
      const syntheticId = `conn_err_${createHash('sha256').update(orgName).digest('hex').slice(0, 12)}`;
      if (!errorSimplefinIds.has(syntheticId)) {
        db.prepare('DELETE FROM sync_warnings WHERE account_id = ?').run(syntheticId);
      }
    }

    // Determine sync_log status
    const hasErrors = errorSimplefinIds.size > 0;
    const hasLingering = (db.prepare('SELECT COUNT(*) as count FROM sync_warnings').get() as { count: number }).count > 0;
    let status: string;
    if (hasErrors && result.accountsSynced === 0) {
      status = 'error';
    } else if (hasErrors || hasLingering) {
      status = 'partial';
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

interface SyncAccountResult {
  internalId: string;
  transactionsAdded: number;
}

interface ResolveResult {
  internalId: string;
  isExisting: boolean;
}

/**
 * Resolve the internal account ID for an incoming SimpleFIN account.
 * 1. Exact match on simplefin_id → use that account's id
 * 2. Name+institution fingerprint match → re-link detected, update simplefin_id
 * 3. No match → new account, use the SimpleFIN ID as the internal ID
 */
function resolveAccountId(
  db: Database.Database,
  simplefinId: string,
  name: string,
  institution: string,
): ResolveResult {
  // Step 1: exact match on simplefin_id
  const exact = db.prepare(
    `SELECT id FROM accounts WHERE simplefin_id = ?`,
  ).get(simplefinId) as { id: string } | undefined;
  if (exact) return { internalId: exact.id, isExisting: true };

  // Step 2: re-link detection — match by name + institution among SimpleFIN accounts
  const candidates = db.prepare(
    `SELECT id, simplefin_id FROM accounts WHERE name = ? AND institution = ? AND source = 'simplefin'`,
  ).all(name, institution) as { id: string; simplefin_id: string | null }[];

  if (candidates.length === 1) {
    const keeper = candidates[0];
    // Record the old simplefin_id in history
    if (keeper.simplefin_id) {
      db.prepare(
        `INSERT OR IGNORE INTO account_id_history (account_id, previous_simplefin_id) VALUES (?, ?)`,
      ).run(keeper.id, keeper.simplefin_id);
    }
    // Update to new simplefin_id
    db.prepare(
      `UPDATE accounts SET simplefin_id = ? WHERE id = ?`,
    ).run(simplefinId, keeper.id);
    return { internalId: keeper.id, isExisting: true };
  }

  // Step 3: ambiguous or no match — treat as new account
  return { internalId: simplefinId, isExisting: false };
}

function syncAccount(db: Database.Database, rawAccount: import('./simplefin-types.js').SimpleFINAccount, institution: string): SyncAccountResult {
  const normalized = normalizeAccount(rawAccount, institution);

  return db.transaction(() => {
    // Resolve internal ID (handles re-link detection)
    const { internalId, isExisting } = resolveAccountId(db, normalized.id, normalized.name, institution);

    // Insert or update account — separate paths to avoid SQLite UNIQUE constraint
    // conflict when ON CONFLICT(id) can't handle a simultaneous simplefin_id conflict
    // on the same row (e.g. after re-link cleanup where id ≠ simplefin_id).
    if (isExisting) {
      db.prepare(`
        UPDATE accounts SET
          name = ?, balance = ?, simplefin_id = ?,
          last_synced = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(normalized.name, normalized.balance, normalized.id, internalId);
    } else {
      db.prepare(`
        INSERT INTO accounts (id, name, institution, type, balance, currency, last_synced, simplefin_id)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
      `).run(
        internalId, normalized.name, normalized.institution,
        normalized.type, normalized.balance, normalized.currency, normalized.id,
      );
    }

    // Insert transactions with dedup — use internal ID so hashes stay stable
    let added = 0;
    const newTransactionIds: string[] = [];
    const txnStmt = db.prepare(`
      INSERT OR IGNORE INTO transactions (id, account_id, date, amount, pending, payee, memo, dedup_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rawTxn of rawAccount.transactions) {
      const txn = normalizeTransaction(rawTxn, internalId);
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
    `).run(internalId, today, normalized.balance);

    return { internalId, transactionsAdded: added };
  })();
}
