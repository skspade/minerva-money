import type Database from 'better-sqlite3';
import { generateDedupHash } from './simplefin-client.js';

interface DuplicateGroup {
  name: string;
  institution: string;
  accounts: { id: string; simplefin_id: string | null; created_at: string }[];
}

export interface MergeResult {
  mergedPairs: { keeperId: string; duplicateId: string; name: string }[];
  transactionsMoved: number;
  transactionsDeduped: number;
  snapshotsMoved: number;
}

/**
 * Find and merge duplicate SimpleFIN accounts that were created by re-linking.
 * Keeps the older account (by created_at), merges transactions and snapshots
 * from the newer one, updates simplefin_id to the current value, and deletes
 * the duplicate.
 */
export function mergeRelinkDuplicates(db: Database.Database): MergeResult {
  const result: MergeResult = {
    mergedPairs: [],
    transactionsMoved: 0,
    transactionsDeduped: 0,
    snapshotsMoved: 0,
  };

  // Find duplicate groups: same name + institution with multiple SimpleFIN accounts
  const groups = db.prepare(`
    SELECT name, institution
    FROM accounts
    WHERE source = 'simplefin'
    GROUP BY name, institution
    HAVING COUNT(*) > 1
  `).all() as { name: string; institution: string }[];

  if (groups.length === 0) return result;

  db.transaction(() => {
    for (const group of groups) {
      const accounts = db.prepare(`
        SELECT id, simplefin_id, created_at
        FROM accounts
        WHERE name = ? AND institution = ? AND source = 'simplefin'
        ORDER BY created_at ASC
      `).all(group.name, group.institution) as DuplicateGroup['accounts'];

      // Keep the oldest, merge all others into it
      const keeper = accounts[0];
      const duplicates = accounts.slice(1);

      for (const dup of duplicates) {
        // Move transactions from duplicate to keeper, recalculating dedup hashes
        const txns = db.prepare(`
          SELECT id, date, amount, payee FROM transactions WHERE account_id = ?
        `).all(dup.id) as { id: string; date: string; amount: number; payee: string }[];

        for (const txn of txns) {
          const newHash = generateDedupHash(keeper.id, txn.date, txn.amount, txn.payee);

          // Check if this transaction already exists on the keeper (hash collision)
          const existing = db.prepare(
            `SELECT id FROM transactions WHERE dedup_hash = ? AND account_id = ?`,
          ).get(newHash, keeper.id);

          if (existing) {
            // Duplicate transaction — delete from the duplicate account
            db.prepare(`DELETE FROM transactions WHERE id = ?`).run(txn.id);
            result.transactionsDeduped++;
          } else {
            // Move to keeper with updated hash and account_id
            db.prepare(
              `UPDATE transactions SET account_id = ?, dedup_hash = ? WHERE id = ?`,
            ).run(keeper.id, newHash, txn.id);
            result.transactionsMoved++;
          }
        }

        // Move balance snapshots (delete conflicting dates, keep keeper's)
        const dupSnapshots = db.prepare(
          `SELECT date FROM balance_snapshots WHERE account_id = ?`,
        ).all(dup.id) as { date: string }[];

        for (const snap of dupSnapshots) {
          const keeperHas = db.prepare(
            `SELECT 1 FROM balance_snapshots WHERE account_id = ? AND date = ?`,
          ).get(keeper.id, snap.date);

          if (keeperHas) {
            db.prepare(
              `DELETE FROM balance_snapshots WHERE account_id = ? AND date = ?`,
            ).run(dup.id, snap.date);
          } else {
            db.prepare(
              `UPDATE balance_snapshots SET account_id = ? WHERE account_id = ? AND date = ?`,
            ).run(keeper.id, dup.id, snap.date);
            result.snapshotsMoved++;
          }
        }

        // Delete sync_warnings for the duplicate
        db.prepare(`DELETE FROM sync_warnings WHERE account_id = ?`).run(dup.id);

        // Delete the duplicate account first (frees the UNIQUE simplefin_id)
        db.prepare(`DELETE FROM accounts WHERE id = ?`).run(dup.id);

        // Update keeper's simplefin_id to the duplicate's (the newer/current one)
        if (dup.simplefin_id) {
          if (keeper.simplefin_id) {
            db.prepare(
              `INSERT OR IGNORE INTO account_id_history (account_id, previous_simplefin_id) VALUES (?, ?)`,
            ).run(keeper.id, keeper.simplefin_id);
          }
          db.prepare(
            `UPDATE accounts SET simplefin_id = ? WHERE id = ?`,
          ).run(dup.simplefin_id, keeper.id);
          keeper.simplefin_id = dup.simplefin_id;
        }

        result.mergedPairs.push({
          keeperId: keeper.id,
          duplicateId: dup.id,
          name: group.name,
        });
      }
    }
  })();

  return result;
}
