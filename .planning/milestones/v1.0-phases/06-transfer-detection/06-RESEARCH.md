# Phase 6: Transfer Detection - Research

**Researched:** 2026-03-22
**Status:** Complete
**Confidence:** HIGH

## Phase Boundary

Internal transfers between accounts are identified, confirmed, and excluded from spending totals so reports reflect only real spending.

## Standard Stack

All technologies are already in the project — no new dependencies needed.

| Component | Technology | Already in project? |
|-----------|-----------|-------------------|
| Database | better-sqlite3 | Yes |
| Server framework | Express + tRPC | Yes |
| Client framework | React + TanStack Query | Yes |
| Styling | Tailwind CSS v4 | Yes |
| Testing | Vitest | Yes |
| Validation | Zod (tRPC inputs) | Yes |

## Architecture Patterns

### Transfer Detection Algorithm

The detection algorithm matches transactions across accounts with offsetting amounts within a configurable date window:

1. **Matching condition:** `t1.amount = -t2.amount AND t1.account_id != t2.account_id`
2. **Date window:** `ABS(julianday(t1.date) - julianday(t2.date)) <= dateWindowDays`
3. **Exclusions:** Pending transactions (`pending = 1`), already-linked transactions (existing in `transfer_links`)
4. **Canonical ordering:** `transaction_a_id` is the earlier date (or lower ID if same date) to prevent duplicate pairs via the UNIQUE constraint

**Confidence:** HIGH — straightforward SQL matching, no external dependencies.

### Data Model

The `transfer_links` table already exists in `001-initial-schema.sql`:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `transaction_a_id` TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE
- `transaction_b_id` TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE
- `confirmed` INTEGER NOT NULL DEFAULT 0
- `created_at` TEXT NOT NULL DEFAULT (datetime('now'))
- UNIQUE(transaction_a_id, transaction_b_id)

**Status values for `confirmed` column:**
- `0` = suggested candidate (auto-detected)
- `1` = user-confirmed transfer
- `-1` = user-dismissed suggestion (prevents re-detection)

No schema migration needed for the base table. However, adding indexes for query performance is recommended:
- Index on `transaction_a_id` and `transaction_b_id` for JOIN lookups in `transactions.list`

**Confidence:** HIGH — table exists, column semantics well-defined in CONTEXT.md.

### Service Layer Structure

Following established patterns from `category-service.ts` and `rules-service.ts`:

```
packages/server/src/transfers/
  transfer-service.ts      # All business logic
  transfer-service.test.ts # TDD tests
```

Core functions (all accept `db: Database.Database` as first parameter):
- `detectTransferCandidates(db, transactionIds)` — post-sync detection
- `confirmTransfer(db, linkId)` — set confirmed = 1
- `dismissTransfer(db, linkId)` — set confirmed = -1
- `unlinkTransfer(db, linkId)` — delete the row
- `manuallyLinkTransfer(db, txnAId, txnBId)` — insert confirmed = 1
- `listTransferCandidates(db)` — get all confirmed = 0 pairs with transaction details
- `listConfirmedTransfers(db)` — get all confirmed = 1 pairs with transaction details

**Confidence:** HIGH — follows established service patterns exactly.

### tRPC Router

New `transfersRouter` added to `appRouter`:
- `transfers.candidates.list` — query, returns candidate pairs
- `transfers.confirmed.list` — query, returns confirmed pairs
- `transfers.confirm` — mutation, confirms a candidate
- `transfers.dismiss` — mutation, dismisses a candidate
- `transfers.unlink` — mutation, removes a confirmed link
- `transfers.manualLink` — mutation, creates a confirmed link from two transaction IDs

The `transactions.list` query extends with a LEFT JOIN on `transfer_links` to add:
- `isTransfer` boolean (confirmed = 1 link exists)
- `linkedTransactionId` string | null (the paired transaction's ID)

**Confidence:** HIGH — follows established tRPC router composition.

### Post-Sync Hook Integration

In `sync-service.ts`, the `syncAccount` function already:
1. Inserts transactions and collects `newTransactionIds` (line 113, 127)
2. Calls `categorizeNewTransactions(db, newTransactionIds)` (line 132-134)

Transfer detection adds a third step after categorization:
```
if (newTransactionIds.length > 0) {
  categorizeNewTransactions(db, newTransactionIds);
  detectTransferCandidates(db, newTransactionIds);  // NEW
}
```

Detection only matches new transactions against existing unlinked transactions on other accounts — avoids full-table scans.

**Confidence:** HIGH — integration point is clear, follows exact same pattern.

### Spending Report Exclusion

The `transactions.list` query at `trpc-router.ts` line 169-183 needs a LEFT JOIN:

```sql
LEFT JOIN transfer_links tl ON (
  (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id)
  AND tl.confirmed = 1
)
```

Adding `tl.id IS NOT NULL AS is_transfer` to the SELECT. Future spending queries in Phase 9 will use `WHERE is_transfer = 0` or exclude via the same JOIN pattern.

**Confidence:** HIGH — standard SQL JOIN pattern.

### UI Structure

New page at `/transfers` with two sections:
1. **Suggested Transfers** — candidate pairs (confirmed = 0) with Confirm/Dismiss buttons
2. **Confirmed Transfers** — confirmed pairs (confirmed = 1) with Unlink button
3. **Manual Link** — button opening a modal to select two transactions

Transaction list gains a visual "Transfer" badge for confirmed transfer transactions.

Navigation: Add "Transfers" NavLink to Layout.tsx between "Rules" and the sync controls.

**Confidence:** HIGH — follows existing page/navigation patterns.

## Common Pitfalls

1. **Duplicate pair insertion:** Without canonical ordering, the same pair could be inserted as (A,B) and (B,A). Always enforce `transaction_a_id < transaction_b_id` by date then ID.

2. **Re-suggesting dismissed pairs:** Detection must exclude transactions that already have ANY entry in `transfer_links` (including dismissed, confirmed = -1).

3. **Self-matching:** A transaction must not match against itself or against transactions on the same account. The `account_id !=` check prevents this.

4. **Amount sign convention:** Amounts are signed integers (negative = debit, positive = credit). A transfer pair has `t1.amount = -t2.amount`, not `ABS(t1.amount) = ABS(t2.amount)` with separate sign checks.

5. **Performance on large datasets:** Detection should be limited to new transaction IDs matched against existing, not a full cross-join of all transactions.

6. **LEFT JOIN in transactions.list:** Must check BOTH `transaction_a_id` and `transaction_b_id` since a transaction could be in either column.

## Don't Hand-Roll

Nothing to avoid — all components use established project patterns (better-sqlite3, tRPC, React, Tailwind). No new libraries needed.

## Migration Consideration

The `transfer_links` table exists but lacks indexes for efficient JOIN lookups. A migration 004 should add:
```sql
CREATE INDEX idx_transfer_links_txn_a ON transfer_links(transaction_a_id);
CREATE INDEX idx_transfer_links_txn_b ON transfer_links(transaction_b_id);
CREATE INDEX idx_transfer_links_confirmed ON transfer_links(confirmed);
```

This is optional for correctness but important for query performance as the transaction count grows.

---

*Phase: 06-transfer-detection*
*Research completed: 2026-03-22*
