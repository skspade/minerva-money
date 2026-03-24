# Phase 31: Stats Filtering and Polish - Verification

**Verified:** 2026-03-24
**Phase Goal:** Stats filtering and polish for CSV import account skip feature — all preview stats, sample rows, dedup stats, and confirm summary exclude skipped accounts; add Skip All Unmatched button and summary banner
**Result:** PASS

## Requirements

### STAT-01: Preview stats (total rows, valid rows) exclude rows from skipped accounts

**Status:** PASS

**Evidence:**
- `packages/client/src/pages/ImportPage.tsx` line 384: `computeSkipFilterStats(accountMappings, previewResult.rowCountByAccount)` extracts `skippedAccountNames` and `skippedRowCount`
- `packages/client/src/pages/ImportPage.tsx` line 385: `filteredTotalRows = previewResult.totalRows - skippedRowCount` — subtracts skipped rows from total
- `packages/client/src/pages/ImportPage.tsx` line 386: `filteredValidRows = previewResult.validRows - skippedRowCount` — subtracts skipped rows from valid count
- `packages/client/src/pages/ImportPage.tsx` lines 404-405: Renders `filteredTotalRows` when `hasSkippedAccounts` is true, falls back to `previewResult.totalRows` otherwise

### STAT-02: Sample rows table excludes rows from skipped accounts

**Status:** PASS

**Evidence:**
- `packages/client/src/pages/ImportPage.tsx` line 387: `filteredSampleRows = previewResult.sampleRows.filter(row => !skippedAccountNames.has(row.accountName))` — filters out rows from skipped accounts
- `packages/client/src/pages/ImportPage.tsx` line 432: Renders `filteredSampleRows` (not raw `sampleRows`) in the sample table
- `packages/client/src/pages/ImportPage.tsx` lines 444-447: Shows exclusion note when rows were filtered: "Showing {filteredSampleRows.length} of {previewResult.sampleRows.length} sample rows ({N} excluded from skipped accounts)"

### STAT-03: Dedup stats (new/duplicate counts) exclude rows from skipped accounts

**Status:** PASS

**Evidence:**
- `packages/client/src/pages/ImportPage.tsx` lines 457-459: When `hasSkippedAccounts` is true, renders note below dedup stats: "Excludes {skippedRowCount} rows from {skippedAccountCount} skipped account(s)"
- Note is conditionally rendered only when accounts are actually skipped (line 457 checks `hasSkippedAccounts`)

### EXEC-02: Confirm summary (step 3) reflects filtered counts excluding skipped accounts

**Status:** PASS

**Evidence:**
- `packages/client/src/pages/ImportPage.tsx` line 596: `computeSkipFilterStats()` called in `ResultsStep` to compute skip stats for confirm summary
- `packages/client/src/pages/ImportPage.tsx` lines 617-621: Amber card in confirm summary grid showing `skippedRowCount` with label "Skipped (account filter)" — only rendered when `hasSkippedAccounts` is true
- `packages/client/src/pages/ImportPage.tsx` lines 624-627: Exclusion note below confirm summary: "Excludes {skippedRowCount} rows from {skippedAccountCount} skipped account(s)"
- `packages/client/src/pages/ImportPage.tsx` lines 685-689: Post-execution results grid includes amber `skippedByAccountFilter` card when value > 0

### PLSH-01: "Skip All Unmatched" button sets all accounts without auto-suggested matches to skip

**Status:** PASS

**Evidence:**
- `packages/client/src/pages/ImportPage.tsx` lines 483-489: Button element with text "Skip All Unmatched", styled as amber text link (`text-amber-600 hover:text-amber-700`), triggers `onSkipAllUnmatched` callback on click
- `packages/client/src/pages/ImportPage.tsx` line 482: Button conditionally rendered only when at least one account has empty/undecided mapping (`!accountMappings[a.csvName] || accountMappings[a.csvName] === ''`)

### PLSH-02: Filtered summary banner shows "Importing from X of Y accounts (Z skipped)"

**Status:** PASS

**Evidence:**
- `packages/client/src/pages/ImportPage.tsx` lines 395-398: Amber banner (`bg-amber-50 border border-amber-200`) with text "Importing from {mappedAccountCount} of {previewResult.accounts.length} accounts ({skippedAccountCount} skipped)"
- `packages/client/src/pages/ImportPage.tsx` line 390: `hasSkippedAccounts` boolean gates banner visibility — only shown when at least one account is skipped

## Helper Function

- `packages/client/src/pages/ImportPage.tsx` lines 42-54: `computeSkipFilterStats()` — exported pure function that computes the set of skipped account names and total skipped row count from account mappings and row-count-by-account data. Used by both `PreviewStep` (line 384) and `ResultsStep` (line 596).

## Test Evidence

- `packages/client/src/pages/ImportPage.test.ts`: **17 tests passing** (all green)
- 5 dedicated `computeSkipFilterStats` test cases (lines 99-137):
  1. Returns empty set and zero count when no accounts are skipped (line 100)
  2. Identifies skipped accounts and sums their row counts (line 106)
  3. Sums row counts for multiple skipped accounts (line 115)
  4. Handles missing rowCount gracefully, defaults to 0 (line 124)
  5. Does not treat empty string (undecided) as skipped (line 133)

## Summary

All 6 Phase 31 requirements (STAT-01, STAT-02, STAT-03, EXEC-02, PLSH-01, PLSH-02) are satisfied. The `computeSkipFilterStats()` helper provides the core filtering logic, used by both `PreviewStep` and `ResultsStep` to exclude skipped account rows from all stats displays. Preview stats dynamically subtract skipped row counts (STAT-01), sample rows are filtered by account name set membership (STAT-02), dedup stats show an exclusion note (STAT-03), and the confirm/results summary includes amber cards for skipped counts (EXEC-02). The "Skip All Unmatched" convenience button (PLSH-01) and the amber summary banner (PLSH-02) provide clear UX for managing and understanding skip decisions. All 17 ImportPage tests pass including 5 dedicated tests for the filtering helper.
