# Phase 31: Stats Filtering and Polish - Research

**Researched:** 2026-03-24
**Status:** Complete

## Phase Boundary

All preview stats, sample rows, and import results accurately reflect skip decisions, with convenience features for bulk operations. This is purely a client-side phase — all changes are in `ImportPage.tsx` and its test file.

## Existing Code Analysis

### ImportPage.tsx (624 lines)

**Key components:**
- `PreviewStep` (lines 345-506): Shows stats, sample rows, dedup stats, account/category mappings, continue button
- `ResultsStep` (lines 520-623): Pre-execution confirm summary + post-execution results

**Already available from Phase 29/30:**
- `SKIP_SENTINEL = '__SKIP__'` (line 12)
- `filterSkippedAccounts()` helper (lines 18-22) — strips skip entries from mappings before server call
- `getValidationState()` helper (lines 24-40) — validates all accounts resolved
- `isAccountResolved()` helper (lines 14-16)
- `previewResult.rowCountByAccount: Record<string, number>` (line 239)
- `executeResult.skippedByAccountFilter: number` (line 246)

**Stats cards (PreviewStep lines 359-372):**
- 3-column grid: Total rows, Valid rows (green), Errors (red)
- Currently display raw `previewResult.totalRows`, `previewResult.validRows`, `previewResult.errors.length`

**Sample rows table (PreviewStep lines 374-401):**
- Renders `previewResult.sampleRows.map()` directly
- Each row has `row.accountName` available for filtering

**Dedup stats (PreviewStep lines 403-409):**
- Shows `dedupStats.newCount` and `dedupStats.duplicateCount` inline
- Server computes these against full dataset — client cannot recompute per-account

**Account mappings section (PreviewStep lines 425-464):**
- Header "Map Accounts" at line 427
- Grid of account dropdowns with skip styling
- `onAccountMappingChange` callback updates parent state

**Confirm summary (ResultsStep lines 529-579):**
- 3-column grid: New transactions (green), Duplicates to skip (gray), Error rows (red)
- Uses same `previewResult.dedupStats` values

**Results grid (ResultsStep lines 583-622):**
- 4 cards in 2-column grid: Imported (green), Duplicates skipped (gray), Categorized by rules (blue), Categorized from CSV (purple)
- `executeResult.skippedByAccountFilter` exists but is NOT currently displayed

### ImportPage.test.ts (96 lines)

- Tests `isAccountResolved`, `filterSkippedAccounts`, `getValidationState`
- All pure function tests, no component rendering tests
- New helper functions for stat filtering should follow same pattern

### Props Flow

- `ImportPage` (parent) holds `accountMappings` state
- `PreviewStep` receives `accountMappings` and `previewResult` as props — has all data for filtering
- `ResultsStep` receives `previewResult` and `executeResult` — needs `accountMappings` too for confirm summary filtering
- `ResultsStep` currently does NOT receive `accountMappings` — this needs to be added

### Key Integration Point: "Skip All Unmatched"

- Needs to batch-update `accountMappings` for all undecided accounts
- Parent `ImportPage` has `setAccountMappings` — can pass a new `onSkipAllUnmatched` callback
- Alternative: pass `setAccountMappings` directly, but callback is cleaner per CONTEXT.md

## Implementation Strategy

### Derived Values (compute at top of PreviewStep)
```typescript
const skippedAccountNames = new Set(
  Object.entries(accountMappings)
    .filter(([, v]) => v === SKIP_SENTINEL)
    .map(([k]) => k)
);
const skippedRowCount = [...skippedAccountNames]
  .reduce((sum, name) => sum + (previewResult.rowCountByAccount[name] ?? 0), 0);
const filteredTotalRows = previewResult.totalRows - skippedRowCount;
const filteredValidRows = previewResult.validRows - skippedRowCount;
const filteredSampleRows = previewResult.sampleRows.filter(
  row => !skippedAccountNames.has(row.accountName)
);
const mappedAccountCount = Object.values(accountMappings)
  .filter(v => v !== '' && v !== SKIP_SENTINEL).length;
const skippedAccountCount = skippedAccountNames.size;
const totalAccountCount = previewResult.accounts.length;
```

### New Props Needed
- `PreviewStep`: Add `onSkipAllUnmatched: () => void` prop
- `ResultsStep`: Add `accountMappings: Record<string, string>` prop for confirm summary filtering

### Exportable Helper for Testing
```typescript
export function computeSkipFilterStats(
  accountMappings: Record<string, string>,
  rowCountByAccount: Record<string, number>
): { skippedAccountNames: Set<string>; skippedRowCount: number }
```

## Discovery Level

**Level 0 — Skip.** All work follows established patterns in ImportPage.tsx. No new dependencies, no new libraries, no external integrations. Pure client-side filtering using existing data.

## Risk Assessment

**Low risk.** Single file (ImportPage.tsx) + test file. All data already available from Phase 29/30. No server changes. No new dependencies.

## RESEARCH COMPLETE
