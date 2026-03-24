# Phase 29: Server Skip Support - Research

**Researched:** 2026-03-24
**Status:** Complete

## Phase Goal

Server gracefully handles partial account mappings, enabling clients to omit skipped accounts without errors.

## Requirement Coverage

**EXEC-01**: Server accepts partial account mappings and skips rows for unmapped accounts instead of throwing.

## Existing Code Analysis

### executeImport() — Current Behavior (import-service.ts:343-437)

The function currently:
1. Parses CSV and validates rows (lines 350-358)
2. Collects unique account names from valid rows (line 362)
3. **Throws on unmapped accounts** (lines 363-366): `if (unmappedAccounts.length > 0) throw new Error(...)`
4. Runs atomic transaction loop inserting rows (lines 369-434)
5. Returns `ExecuteResult` with `importedCount`, `skippedCount`, `categorizedByRules`, `categorizedFromCsv`

### previewImport() — Current Behavior (import-service.ts:236-339)

The function currently:
1. Parses CSV and validates rows (lines 237-248)
2. Builds `validTransformed` array of valid rows
3. Computes account matches, category matches, dedup stats
4. Returns `PreviewResult` with `totalRows`, `validRows`, `sampleRows`, `errors`, `accounts`, `categories`, `dedupStats`
5. **Does NOT include per-account row counts** — client has no way to show how many rows each CSV account contains

### ExecuteResult Interface (import-service.ts:227-232)

```typescript
export interface ExecuteResult {
  importedCount: number;
  skippedCount: number;
  categorizedByRules: number;
  categorizedFromCsv: number;
}
```

### PreviewResult Interface (import-service.ts:214-225)

```typescript
export interface PreviewResult {
  totalRows: number;
  validRows: number;
  sampleRows: TransformedRow[];
  errors: string[];
  accounts: AccountMatch[];
  categories: CategoryMatch[];
  dedupStats: { newCount: number; duplicateCount: number; };
}
```

### import-router.ts — No Changes Needed

The router uses `z.record(z.string(), z.string())` for `accountMappings`, which already allows partial records (omitting keys is valid). Output types are inferred from return values — no explicit output schema exists.

### Test Patterns (import-service.test.ts)

- Uses `createDatabase()` with temp directory for in-memory SQLite with migrations
- `beforeEach`/`afterEach` pattern for setup/teardown
- Helper functions `makeCsvRow()` and `makeCsv()` for CSV fixture construction
- Existing test: "rejects when account mapping is incomplete" (line 430-433) — this test MUST be updated since the behavior is changing

## Required Changes

### 1. executeImport() — Remove throw, add skip logic

- **Remove** lines 361-366 (unmapped account validation that throws)
- **Add** skip check inside the transaction loop (before `generateDedupHash`): if `accountMappings[row.accountName]` is undefined, increment `skippedByAccountFilter` counter and `continue`
- **Add** `skippedByAccountFilter` to the return object

### 2. ExecuteResult — Add field

- Add `skippedByAccountFilter: number` to the interface

### 3. previewImport() — Add rowCountByAccount

- After the validation loop (line 249), compute `rowCountByAccount` by grouping `validTransformed` rows by `accountName`
- Add to the return object

### 4. PreviewResult — Add field

- Add `rowCountByAccount: Record<string, number>` to the interface

### 5. Tests — Update and add

- **Update** existing test "rejects when account mapping is incomplete" → change to verify it succeeds and returns correct `skippedByAccountFilter`
- **Add** test: partial mappings import mapped rows and skip unmapped
- **Add** test: `skippedByAccountFilter` count is correct
- **Add** test: `previewImport` returns correct `rowCountByAccount`

## Risks and Mitigations

- **Risk:** Changing throw behavior could break client error handling. **Mitigation:** The client currently prevents the execute call if accounts are unmapped — the throw was a safety guard. Removing it is safe because Phase 30 will introduce the skip sentinel pattern on the client.
- **Risk:** `skippedCount` vs `skippedByAccountFilter` confusion. **Mitigation:** Separate counters with clear naming — `skippedCount` = dedup skips, `skippedByAccountFilter` = account filter skips.

## RESEARCH COMPLETE
