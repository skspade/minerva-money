# Phase 32: Phase 31 Verification — Research

**Researched:** 2026-03-24
**Phase Goal:** Formally verify Phase 31 requirements and fix REQUIREMENTS.md checkboxes
**Scope:** Documentation-only — no functional code changes

## Evidence Mapping

All Phase 31 implementations live in `packages/client/src/pages/ImportPage.tsx` (710 lines).

### STAT-01: Preview stats exclude skipped accounts
- **Line 384:** `computeSkipFilterStats()` call extracts `skippedAccountNames` and `skippedRowCount`
- **Line 385:** `filteredTotalRows = previewResult.totalRows - skippedRowCount`
- **Line 386:** `filteredValidRows = previewResult.validRows - skippedRowCount`
- **Lines 404-405:** Renders `filteredTotalRows` when `hasSkippedAccounts` is true

### STAT-02: Sample rows exclude skipped accounts
- **Line 387:** `filteredSampleRows = previewResult.sampleRows.filter(row => !skippedAccountNames.has(row.accountName))`
- **Line 432:** Renders `filteredSampleRows` in the table
- **Lines 444-447:** Exclusion note: "Showing X of Y sample rows (Z excluded from skipped accounts)"

### STAT-03: Dedup stats exclude skipped accounts
- **Lines 457-459:** Note below dedup stats: "Excludes {skippedRowCount} rows from {skippedAccountCount} skipped account(s)"

### EXEC-02: Confirm summary reflects filtered counts
- **Line 596:** `computeSkipFilterStats()` called again in `ResultsStep`
- **Lines 617-621:** Amber card showing skipped row count in confirm summary grid
- **Lines 624-627:** Exclusion note in confirm summary
- **Lines 685-689:** Post-execution results card with `skippedByAccountFilter` count

### PLSH-01: Skip All Unmatched button
- **Lines 483-489:** Button with `onClick={onSkipAllUnmatched}`, text "Skip All Unmatched"
- **Line 482:** Conditional visibility — shown when any account has empty/undecided mapping

### PLSH-02: Summary banner
- **Lines 395-398:** Amber banner: "Importing from X of Y accounts (Z skipped)"
- **Line 390:** `hasSkippedAccounts` gates banner visibility

## Helper Function
- **Lines 42-54:** `computeSkipFilterStats()` — pure function exported, computes skipped account names (Set) and total skipped row count

## Test Evidence
- `packages/client/src/pages/ImportPage.test.ts`: 17 tests total
- **Lines 99-137:** 5 dedicated `computeSkipFilterStats` test cases:
  1. Empty set/zero when no accounts skipped (line 100)
  2. Identifies skipped accounts and sums row counts (line 106)
  3. Sums for multiple skipped accounts (line 115)
  4. Handles missing rowCount gracefully (line 124)
  5. Does not treat empty string as skipped (line 133)

## REQUIREMENTS.md Current State
- All 10 checkboxes are `[x]` (lines 12-30)
- Traceability table (lines 47-58):
  - SKIP-01/02/03: Phase 30 / Complete
  - EXEC-01: Phase 29 / Complete
  - STAT-01/02/03, EXEC-02, PLSH-01/02: Phase 32 / Pending (should be Phase 31 / Complete)

## VERIFICATION.md Format Reference
- Follows pattern from `.planning/milestones/v1.0-phases/09-dashboard-and-reporting/VERIFICATION.md`
- Header: Verified date, Phase Goal, Result
- Per-requirement sections with Status (PASS/FAIL) and Evidence (file + line citations)
- Test Evidence section
- Summary paragraph

## RESEARCH COMPLETE
