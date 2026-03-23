# Phase 11: Reporting Date Fix & Verification Sweep - Research

**Researched:** 2026-03-22
**Domain:** Bug fix + requirement verification documentation
**Confidence:** HIGH

## Summary

Phase 11 has two deliverables: (1) fix an off-by-one date boundary bug in four SQL queries across two functions in `reports-service.ts`, and (2) create three VERIFICATION.md documents proving that requirements CATG-02 through CATG-05 (Phase 5), CATG-07 through CATG-09 (Phase 6), and REPT-01 through REPT-03 (Phase 9) are satisfied.

The bug is confirmed: `getSpendingByCategory` and `getSpendingOverTime` both use `t.date < ?` for the upper bound (lines 32, 51, 98, 114 of `reports-service.ts`), which excludes transactions on the `endDate` itself. The fix is to change `<` to `<=` in all four SQL statements. Note that `getNetWorth` already uses `<=` correctly (line 149).

All 10 requirements are already implemented in the codebase. The verification documents simply need to reference the existing code with file paths, line numbers, and test evidence.

**Primary recommendation:** Fix the four SQL comparisons first (with a test proving the boundary case), then write the three VERIFICATION.md documents referencing existing code.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `getSpendingByCategory` lines 32 and 51: change `t.date < ?` to `t.date <= ?`
- `getSpendingOverTime` lines 98 and 114: change `t.date < ?` to `t.date <= ?`
- Both unsplit and split query branches must be updated (4 SQL statements total)
- Add boundary test case to `reports-service.test.ts` proving transactions on `endDate` are included
- Follow Phase 1 VERIFICATION.md format exactly
- VERIFICATION.md files go in the phase directory they verify (e.g., Phase 5 verification in `05-categorization-rules-engine/`)

### Claude's Discretion
- Exact wording of verification evidence paragraphs
- Order of requirements within each VERIFICATION.md
- Whether to reference test line numbers or just test names
- Formatting of code references in evidence sections

### Deferred Ideas (OUT OF SCOPE)
- Verification of phases 2, 3, 4, 7, 8
- Performance optimization of spending queries (date indexes)
- Additional reporting features (ADVR-01)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REPT-01 | Spending by category charts, filterable by date range | `getSpendingByCategory` in reports-service.ts + tRPC `reports.spendingByCategory` procedure |
| REPT-02 | Spending over time charts showing month-over-month patterns | `getSpendingOverTime` in reports-service.ts + tRPC `reports.spendingOverTime` procedure |
| REPT-03 | Net worth trend as line chart over time | `getNetWorth` in reports-service.ts + tRPC `reports.netWorth` procedure |
| CATG-02 | Categorization rules matching on merchant/amount/memo | `createRule`, `matchesRule`, `computeSpecificity` in rules-service.ts |
| CATG-03 | Rules apply retroactively to existing transactions | `previewRule` and `applyRule` in rules-service.ts |
| CATG-04 | Rules apply automatically to future transactions | `categorizeNewTransactions` in rules-service.ts, called from sync-service.ts |
| CATG-05 | Most-specific-rule-wins, newer wins ties | `computeSpecificity` scoring + `ORDER BY specificity_score DESC, id DESC` in rules-service.ts |
| CATG-07 | Auto-suggest transfer pairs by matching offsetting transactions | `detectTransferCandidates` in transfer-service.ts |
| CATG-08 | Manual confirm or link transfer pairs | `confirmTransfer` and `manuallyLinkTransfer` in transfer-service.ts |
| CATG-09 | Confirmed transfers excluded from reports | `NOT EXISTS (SELECT 1 FROM transfer_links ...)` clauses in reports-service.ts |
</phase_requirements>

## Architecture Patterns

### Bug Fix Location
The bug is in `packages/server/src/reports/reports-service.ts`:
- Line 32: `WHERE t.date >= ? AND t.date < ?` (getSpendingByCategory unsplit)
- Line 51: `WHERE t.date >= ? AND t.date < ?` (getSpendingByCategory splits)
- Line 98: `WHERE t.date >= ? AND t.date < ?` (getSpendingOverTime unsplit)
- Line 114: `WHERE t.date >= ? AND t.date < ?` (getSpendingOverTime splits)

All four need `<` changed to `<=`.

`getNetWorth` (line 149) already uses `<=` and is correct.

### Verification Document Structure
Phase 1 VERIFICATION.md establishes the template:
```
# Phase N: Name - Verification
**Verified:** [date]
**Phase Goal:** [from roadmap]
**Result:** PASS

## Requirements
### REQ-ID: Description
**Status:** PASS
**Evidence:**
- [file path + line number references]

## Test Evidence
- [test file]: N tests passing — covers [areas]

## Summary
[Paragraph confirming all requirements satisfied]
```

### Test Evidence Sources
- `packages/server/src/rules/rules-service.test.ts` — rules engine tests
- `packages/server/src/transfers/transfer-service.test.ts` — transfer detection tests
- `packages/server/src/reports/reports-service.test.ts` — reporting tests (will also contain the new boundary test)

### Code Evidence Map

**CATG-02 (rules matching):**
- `createRule` (rules-service.ts:109) — creates rules with merchant/amount/memo conditions
- `matchesRule` (rules-service.ts:77) — evaluates all three condition types
- `computeSpecificity` (rules-service.ts:61) — scores rules based on condition count

**CATG-03 (retroactive application):**
- `previewRule` (rules-service.ts:206) — shows which transactions would be affected
- `applyRule` (rules-service.ts:252) — applies rule to all matching uncategorized/rule-categorized transactions

**CATG-04 (auto-apply to future):**
- `categorizeNewTransactions` (rules-service.ts:285) — called with new transaction IDs
- Integration in sync-service.ts — calls `categorizeNewTransactions` after sync

**CATG-05 (most-specific-wins):**
- `computeSpecificity` (rules-service.ts:61) — exact merchant=3, contains=2, amount range=2/1, memo=1
- `evaluateRules` (rules-service.ts:183) — `ORDER BY specificity_score DESC, id DESC`
- `listRules` (rules-service.ts:169) — same ordering

**CATG-07 (auto-suggest transfers):**
- `detectTransferCandidates` (transfer-service.ts:41) — matches offsetting amounts across accounts within date window

**CATG-08 (manual confirm/link):**
- `confirmTransfer` (transfer-service.ts:97) — sets confirmed=1
- `manuallyLinkTransfer` (transfer-service.ts:112) — creates confirmed link between two transactions

**CATG-09 (excluded from reports):**
- reports-service.ts lines 36-39: `NOT EXISTS (SELECT 1 FROM transfer_links tl WHERE ... AND tl.confirmed = 1)` in getSpendingByCategory unsplit
- reports-service.ts lines 53-56: same exclusion in getSpendingByCategory splits
- reports-service.ts lines 101-104: same exclusion in getSpendingOverTime unsplit
- reports-service.ts lines 116-119: same exclusion in getSpendingOverTime splits

**REPT-01 (spending by category):**
- `getSpendingByCategory` (reports-service.ts:20) — groups by category with date filtering
- tRPC `reports.spendingByCategory` (trpc-router.ts:423) — exposes via API

**REPT-02 (spending over time):**
- `getSpendingOverTime` (reports-service.ts:89) — monthly aggregation with date filtering
- tRPC `reports.spendingOverTime` (trpc-router.ts:429) — exposes via API

**REPT-03 (net worth):**
- `getNetWorth` (reports-service.ts:140) — daily net worth from balance snapshots
- tRPC `reports.netWorth` (trpc-router.ts:435) — exposes via API

## Common Pitfalls

### Pitfall 1: Existing Tests Mask the Bug
**What goes wrong:** Existing tests use `endDate = '2026-04-01'` for March transactions, which works with `<` since April 1 > any March date. The bug only manifests when `endDate` equals a transaction date.
**How to avoid:** Add a test where `endDate` exactly equals a transaction's date and assert it is included.

### Pitfall 2: Inconsistent Date Semantics
**What goes wrong:** `getNetWorth` uses `<=` but spending queries use `<`, creating inconsistent behavior for the same date range.
**How to avoid:** After the fix, all three report functions will use `<=` for the upper bound, creating consistent inclusive-range semantics.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of `reports-service.ts`, `rules-service.ts`, `transfer-service.ts`, `trpc-router.ts`
- Phase 1 `VERIFICATION.md` for document format template
- Existing test files for test evidence

## Metadata

**Confidence breakdown:**
- Bug location: HIGH — directly inspected all four SQL statements
- Code evidence for verification: HIGH — read all source files and confirmed function locations
- VERIFICATION.md format: HIGH — Phase 1 template exists and was reviewed

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable — internal codebase references)
