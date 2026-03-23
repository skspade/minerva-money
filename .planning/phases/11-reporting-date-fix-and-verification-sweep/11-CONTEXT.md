# Phase 11: Reporting Date Fix & Verification Sweep - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Fix the off-by-one date bug in spending queries and formally verify all requirements for Phases 5, 6, and 9. This phase delivers: a fix to `getSpendingByCategory` and `getSpendingOverTime` so the upper date bound is inclusive (`<=` instead of `<`), plus three VERIFICATION.md documents confirming that CATG-02 through CATG-05 (Phase 5), CATG-07 through CATG-09 (Phase 6), and REPT-01 through REPT-03 (Phase 9) are satisfied.

</domain>

<decisions>
## Implementation Decisions

### Date Bug Fix
- `getSpendingByCategory` in `packages/server/src/reports/reports-service.ts` uses `t.date < ?` for the upper bound on lines 32 and 52 -- change to `t.date <= ?` (from success criteria 1)
- `getSpendingOverTime` in `packages/server/src/reports/reports-service.ts` uses `t.date < ?` for the upper bound on lines 98 and 114 -- change to `t.date <= ?` (from success criteria 1)
- Both the unsplit and split query branches in each function must be updated -- there are 4 SQL statements total that need the fix (Claude's Decision: all four queries share the same date filtering pattern and must be consistent)
- Update existing unit tests in `reports-service.test.ts` to verify that transactions on the `endDate` boundary are included (Claude's Decision: the existing tests use `endDate = '2026-04-01'` which naturally includes March transactions even with `<`, so a new test with `endDate` equal to a transaction's date is needed to prove the fix)

### Verification Document Format
- Follow the exact format established by Phase 1's `VERIFICATION.md` (from established pattern in `.planning/phases/01-foundation/VERIFICATION.md`)
- Each VERIFICATION.md includes: verified date, phase goal, overall result, per-requirement status with evidence (file paths, line numbers, code references), test evidence, and summary
- Evidence must reference specific file paths and line numbers in the current codebase (from Phase 1 VERIFICATION.md pattern)

### Phase 5 Verification (CATG-02 through CATG-05)
- CATG-02 (rules matching on merchant/amount/memo): verify `createRule` and `matchesRule` in `packages/server/src/rules/rules-service.ts`
- CATG-03 (retroactive application): verify `previewRule` and `applyRule` in `rules-service.ts`
- CATG-04 (auto-apply to future transactions): verify `categorizeNewTransactions` in `rules-service.ts` and its integration in `sync-service.ts`
- CATG-05 (most-specific-rule-wins, newer wins ties): verify `computeSpecificity` and rule ordering by `specificity_score DESC, id DESC` in `rules-service.ts`
- Write to `.planning/phases/05-categorization-rules-engine/VERIFICATION.md` (Claude's Decision: verification lives in the phase directory it verifies, consistent with Phase 1 pattern)

### Phase 6 Verification (CATG-07 through CATG-09)
- CATG-07 (auto-suggest transfer pairs): verify `detectTransferCandidates` in `packages/server/src/transfers/transfer-service.ts`
- CATG-08 (manual confirm/link): verify `confirmTransfer` and `manuallyLinkTransfer` in `transfer-service.ts`
- CATG-09 (confirmed transfers excluded from reports): verify the `NOT EXISTS (SELECT 1 FROM transfer_links ...)` clauses in `reports-service.ts`
- Write to `.planning/phases/06-transfer-detection/VERIFICATION.md` (Claude's Decision: same directory convention as Phase 5 verification)

### Phase 9 Verification (REPT-01 through REPT-03)
- REPT-01 (spending by category charts): verify `getSpendingByCategory` in `reports-service.ts` and the tRPC `reports.spendingByCategory` procedure
- REPT-02 (spending over time charts): verify `getSpendingOverTime` in `reports-service.ts` and the tRPC `reports.spendingOverTime` procedure
- REPT-03 (net worth trend): verify `getNetWorth` in `reports-service.ts` and the tRPC `reports.netWorth` procedure
- Write to `.planning/phases/09-dashboard-and-reporting/VERIFICATION.md` (Claude's Decision: same directory convention)

### Testing Strategy
- Add a targeted test case to `reports-service.test.ts` that creates a transaction on the `endDate` and confirms it is included in results (Claude's Decision: directly validates the bug fix with a failing-then-passing test)
- Existing test suites for rules-service, transfer-service, and reports-service provide test evidence for verification documents -- reference their pass counts and coverage areas

### Claude's Discretion
- Exact wording of verification evidence paragraphs
- Order of requirements within each VERIFICATION.md
- Whether to reference test line numbers or just test names
- Formatting of code references in evidence sections

</decisions>

<specifics>
## Specific Ideas

- The date bug is in 4 SQL queries across 2 functions in `packages/server/src/reports/reports-service.ts`: lines 32, 52 (getSpendingByCategory unsplit/split) and lines 98, 114 (getSpendingOverTime unsplit/split)
- Note that `getNetWorth` already uses `<=` correctly (line 149) -- only spending queries have the bug
- The `reports-service.test.ts` existing tests use `'2026-04-01'` as endDate for March transactions, which works with `<` since April 1 is after all March dates -- the bug only manifests when endDate equals a transaction date (e.g., querying "today" when today has transactions)
- Phase 1 VERIFICATION.md is the template to follow -- it uses "PASS" status per requirement, cites file paths with line numbers, and concludes with a summary paragraph

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/reports/reports-service.ts`: contains all three reporting functions (getSpendingByCategory, getSpendingOverTime, getNetWorth) -- the date fix targets this file
- `packages/server/src/rules/rules-service.ts`: complete rules engine with CRUD, matching, specificity scoring, retroactive preview/apply, and auto-categorization -- all Phase 5 verification evidence is here
- `packages/server/src/transfers/transfer-service.ts`: complete transfer detection with candidate detection, confirm/dismiss/unlink, manual link, and list queries -- all Phase 6 verification evidence is here
- `packages/server/src/sync/trpc-router.ts`: tRPC router wiring for reports, transfers, and rules sub-routers -- confirms API layer is complete

### Established Patterns
- VERIFICATION.md format: Phase 1 established the structure with per-requirement PASS/FAIL, file path + line number evidence, test evidence section, and summary
- Service functions accept `db: Database.Database` as first parameter consistently across all service modules
- Feature-based directory structure: `rules/`, `transfers/`, `reports/` each contain service and test files
- TDD test files co-located with source: `rules-service.test.ts`, `transfer-service.test.ts`, `reports-service.test.ts`

### Integration Points
- `packages/server/src/reports/reports-service.ts` lines 32, 52, 98, 114: the four `t.date < ?` clauses to change to `t.date <= ?`
- `packages/server/src/reports/reports-service.test.ts`: add boundary test case for endDate inclusion
- `.planning/phases/05-categorization-rules-engine/VERIFICATION.md`: new file
- `.planning/phases/06-transfer-detection/VERIFICATION.md`: new file
- `.planning/phases/09-dashboard-and-reporting/VERIFICATION.md`: new file

</code_context>

<deferred>
## Deferred Ideas

- Verification of remaining phases (2, 3, 4, 7, 8) -- those phases either have no gap closure need or are covered by other gap closure phases
- Performance optimization of spending queries (e.g., adding date indexes) -- not required; current queries are correct once the date bound is fixed
- Additional reporting features like income vs expense (v2 -- ADVR-01)

</deferred>

---

*Phase: 11-reporting-date-fix-and-verification-sweep*
*Context gathered: 2026-03-22 via auto-context*
