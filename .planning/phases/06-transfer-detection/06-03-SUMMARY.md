# Plan 06-03 Summary: Spending Report Exclusion

**Status:** Complete
**Duration:** Wave 2

## What Was Built

Extended transactions.list tRPC query with isTransfer boolean field. Added Transfer badge to transaction rows in TransactionsPage.

## Key Files

### Modified
- `packages/server/src/sync/trpc-router.ts` — Added EXISTS subquery on transfer_links to transactions.list, returning isTransfer boolean
- `packages/client/src/pages/TransactionsPage.tsx` — Added purple "Transfer" badge next to payee for confirmed transfer transactions

## Decisions Made

- Used EXISTS subquery rather than LEFT JOIN for clarity (checks both transaction_a_id and transaction_b_id columns)
- Transfer badge is purple (bg-purple-100 text-purple-700) to visually distinguish from other indicators
- Badge placed inline after payee text to avoid adding a new column
- Establishes the exclusion pattern that Phase 9 reporting queries will reuse
