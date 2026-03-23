# Phase 6: Transfer Detection - Verification

**Verified:** 2026-03-22
**Phase Goal:** Internal transfers between accounts are identified, confirmed, and excluded from spending totals so reports reflect only real spending
**Result:** PASS

## Requirements

### CATG-07: App auto-suggests transfer pairs by matching offsetting transactions across accounts

**Status:** PASS

**Evidence:**
- `packages/server/src/transfers/transfer-service.ts` line 41: `detectTransferCandidates()` accepts transaction IDs and a configurable date window (default 3 days)
- `packages/server/src/transfers/transfer-service.ts` line 65: Matching logic finds offsetting amounts (`t.amount = ?` with negated value), different accounts (`t.account_id != ?`), non-pending transactions (`t.pending = 0`), within date window (`ABS(julianday(t.date) - julianday(?)) <= ?`), and not already linked
- `packages/server/src/transfers/transfer-service.ts` line 56: Creates unconfirmed transfer links (`confirmed = 0`) using `INSERT OR IGNORE` to avoid duplicates
- `packages/server/src/transfers/transfer-service.ts` line 35: `canonicalOrder()` ensures consistent A/B ordering by date then ID

### CATG-08: User can manually confirm or link transfer pairs

**Status:** PASS

**Evidence:**
- `packages/server/src/transfers/transfer-service.ts` line 97: `confirmTransfer()` sets `confirmed = 1` for a transfer link by ID
- `packages/server/src/transfers/transfer-service.ts` line 102: `dismissTransfer()` sets `confirmed = -1` to dismiss a suggested pair
- `packages/server/src/transfers/transfer-service.ts` line 107: `unlinkTransfer()` deletes a transfer link entirely
- `packages/server/src/transfers/transfer-service.ts` line 112: `manuallyLinkTransfer()` creates a confirmed transfer link between any two transactions on different accounts, with validation that accounts differ
- `packages/server/src/transfers/transfer-service.ts` line 167: `listTransferCandidates()` returns unconfirmed pairs for user review
- `packages/server/src/transfers/transfer-service.ts` line 171: `listConfirmedTransfers()` returns confirmed pairs
- `packages/server/src/sync/trpc-router.ts` lines 328-367: `transfersRouter` exposes candidates list, confirmed list, confirm, dismiss, unlink, and manual link procedures via tRPC

### CATG-09: Confirmed transfers are excluded from budget and spending reports

**Status:** PASS

**Evidence:**
- `packages/server/src/reports/reports-service.ts` lines 36-39: `getSpendingByCategory` unsplit query includes `AND NOT EXISTS (SELECT 1 FROM transfer_links tl WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id) AND tl.confirmed = 1)` to exclude confirmed transfers
- `packages/server/src/reports/reports-service.ts` lines 53-56: `getSpendingByCategory` split query includes the same transfer exclusion clause
- `packages/server/src/reports/reports-service.ts` lines 101-104: `getSpendingOverTime` unsplit query includes the same transfer exclusion clause
- `packages/server/src/reports/reports-service.ts` lines 116-119: `getSpendingOverTime` split query includes the same transfer exclusion clause
- Test evidence: `reports-service.test.ts` includes "excludes confirmed transfers" tests for both `getSpendingByCategory` and `getSpendingOverTime`

## Test Evidence

- `packages/server/src/transfers/transfer-service.test.ts`: 25 tests passing -- covers auto-detection of transfer candidates (offsetting amounts, different accounts, date window), confirm/dismiss/unlink operations, manual linking with validation, canonical ordering, edge cases (same account rejection, already linked, pending transactions)
- `packages/server/src/reports/reports-service.test.ts`: 19 tests passing -- includes 2 tests specifically for confirmed transfer exclusion from spending reports

## Summary

All 3 CATG requirements (CATG-07 through CATG-09) are satisfied. The transfer detection system auto-suggests transfer pairs by matching offsetting transactions across different accounts within a configurable date window (CATG-07). Users can confirm, dismiss, unlink, or manually link transfer pairs via tRPC procedures (CATG-08). Confirmed transfers are excluded from all spending report queries through `NOT EXISTS` clauses that check `transfer_links` with `confirmed = 1` (CATG-09).
