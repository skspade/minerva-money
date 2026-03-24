# Architecture Research

**Domain:** CSV Import Account Filtering (v2.4 integration with existing v2.3 import)
**Researched:** 2026-03-24
**Confidence:** HIGH (all findings based on direct codebase inspection)

## Existing Architecture (Reference)

```
┌─────────────────────────────────────────────────────────────┐
│                     ImportPage.tsx                           │
│  ┌───────────┐  ┌──────────────┐  ┌────────────┐           │
│  │ UploadStep │  │ PreviewStep  │  │ ResultsStep│           │
│  └─────┬─────┘  └──────┬───────┘  └─────┬──────┘           │
│        │               │                │                   │
│  csvText state    accountMappings   executeResult            │
│                   categoryMappings  previewResult            │
├─────────────────────────────────────────────────────────────┤
│                     tRPC Client                             │
│  import.preview (mutation)    import.execute (mutation)      │
├─────────────────────────────────────────────────────────────┤
│                     import-router.ts                        │
│  preview: csvText -> PreviewResult                          │
│  execute: csvText + mappings -> ExecuteResult               │
├─────────────────────────────────────────────────────────────┤
│                     import-service.ts                       │
│  parseCsv -> validateRow -> transformRow                    │
│  previewImport (dedup stats, auto-match accounts/categories)│
│  executeImport (atomic insert, rules, transfers)            │
├─────────────────────────────────────────────────────────────┤
│                     SQLite (better-sqlite3)                  │
│  transactions table (INSERT OR IGNORE via dedup_hash)       │
└─────────────────────────────────────────────────────────────┘
```

## Integration Design for Account Filtering

### Key Insight: Skip is a Mapping Value, Not a Separate Concept

The current architecture uses `accountMappings: Record<string, string>` where keys are CSV account names and values are database account IDs. The cleanest integration treats "skip" as a special mapping value -- a sentinel string `"__skip__"` -- rather than introducing separate state. This avoids new types, new API parameters, or separate skip tracking.

### Changes Summary: Modified vs New

| File | Change Type | What Changes |
|------|-------------|--------------|
| `import-service.ts` | MODIFY | Add `rowCountByAccount` to PreviewResult; remove unmapped-accounts throw in executeImport; add account-filter skip logic; add `skippedByAccountFilter` to ExecuteResult |
| `import-router.ts` | NO CHANGE | Schema already accepts `Record<string, string>` -- `"__skip__"` is a valid string value |
| `ImportPage.tsx` | MODIFY | Account dropdown adds "Skip" option; validation logic changes from "all mapped" to "all resolved"; preview stats filter out skipped accounts; results show filtered counts |

No new files. No new components. No new API endpoints.

## Detailed Integration Points

### 1. Sentinel Value: `__skip__`

Use `"__skip__"` (not empty string) because:

- Empty string `""` is already the "not yet decided" initial state (line 34 of ImportPage.tsx: `acctMap[a.csvName] = a.suggestedId ?? ''`)
- Impossible to confuse with a real account UUID
- Server checks explicitly: `if (mapping === '__skip__') continue`
- No truthy/falsy ambiguity

Tri-state for each account mapping:
- `""` = undecided (blocks continue button)
- `"__skip__"` = explicitly skipped (allows continue)
- `"<uuid>"` = mapped to db account (allows continue)

### 2. Server: `previewImport` in import-service.ts

**Add `rowCountByAccount` to PreviewResult.** The server already iterates all valid rows. Adding a per-account count is one extra Map accumulation in the existing loop -- zero additional DB queries.

```typescript
// NEW field in PreviewResult
interface PreviewResult {
  totalRows: number;
  validRows: number;
  sampleRows: TransformedRow[];
  errors: string[];
  accounts: AccountMatch[];
  categories: CategoryMatch[];
  dedupStats: { newCount: number; duplicateCount: number };
  rowCountByAccount: Record<string, number>;  // NEW
}
```

**Why the client needs this:** When the user skips an account, the preview stats (row counts, dedup numbers) should update immediately without a server roundtrip. With per-account counts, the client does simple arithmetic.

### 3. Server: `executeImport` in import-service.ts

**Current behavior (lines 362-365):**
```typescript
const unmappedAccounts = uniqueAccounts.filter(name => !accountMappings[name]);
if (unmappedAccounts.length > 0) {
  throw new Error(`Unmapped accounts: ${unmappedAccounts.join(', ')}...`);
}
```

**New behavior:** Replace the throw with a filter. During the row loop, skip rows where `accountMappings[row.accountName]` is `"__skip__"` or falsy. Track skipped-by-filter count separately from dedup skips.

```typescript
// Modified ExecuteResult
interface ExecuteResult {
  importedCount: number;
  skippedCount: number;              // dedup skips only (unchanged)
  skippedByAccountFilter: number;    // NEW: rows excluded by account skip
  categorizedByRules: number;
  categorizedFromCsv: number;
}
```

**In the row loop:**
```typescript
for (const row of validTransformed) {
  const accountId = accountMappings[row.accountName];
  if (!accountId || accountId === '__skip__') {
    skippedByAccountFilter++;
    continue;  // Skip this row entirely
  }
  // ... existing insert logic unchanged ...
}
```

### 4. Client: Account Dropdown in PreviewStep

**Current dropdown (lines 396-409):**
```html
<select>
  <option value="" disabled>Select account...</option>
  {accounts.map(a => <option value={a.id}>{a.name}</option>)}
</select>
```

**New dropdown:**
```html
<select>
  <option value="" disabled>Select account...</option>
  <option value="__skip__">Skip -- do not import</option>
  {accounts.map(a => <option value={a.id}>{a.name}</option>)}
</select>
```

One line addition. The `"__skip__"` value flows through existing `onAccountMappingChange` callback into `accountMappings` state.

### 5. Client: Validation Logic

**Current (lines 105-106):**
```typescript
const allAccountsMapped = previewResult
  ? previewResult.accounts.every((a) => accountMappings[a.csvName] && accountMappings[a.csvName] !== '')
  : false;
```

**New:**
```typescript
const allAccountsResolved = previewResult
  ? previewResult.accounts.every((a) => {
      const v = accountMappings[a.csvName];
      return v === '__skip__' || (v != null && v !== '');
    })
  : false;
```

Both mapped accounts and skipped accounts count as "resolved." Only undecided (`""`) blocks the continue button.

### 6. Client: Filtered Stats in PreviewStep

When accounts are skipped, preview stats should reflect only the accounts being imported:

**Sample rows table:** Filter `previewResult.sampleRows` to exclude rows where `accountMappings[row.accountName] === '__skip__'`.

**Row counts:** Use `rowCountByAccount` from server to compute:
```typescript
const skippedRowCount = previewResult.accounts
  .filter(a => accountMappings[a.csvName] === '__skip__')
  .reduce((sum, a) => sum + (previewResult.rowCountByAccount[a.csvName] ?? 0), 0);
const activeValidRows = previewResult.validRows - skippedRowCount;
```

**Dedup stats:** The server computes dedup stats for all accounts including ones that might be skipped. Rather than trying to recompute exact per-account dedup numbers (which would require per-row dedup info the client does not have), display a note: "Excluding N rows from M skipped accounts" alongside the server-provided dedup numbers. This is honest and avoids false precision.

### 7. Client: ResultsStep Updates

**Pre-execution summary:** Show `activeValidRows` (excluding skipped accounts) instead of `previewResult.validRows`. Show count of skipped accounts if any.

**Post-execution results:** Display the new `skippedByAccountFilter` count in a separate stat card (amber/yellow theme) alongside existing imported/skipped/categorized cards.

## Data Flow: Current vs Modified

```
CURRENT:
  validTransformed rows
      -> throw if ANY account unmapped
      -> insert ALL rows
      -> return { importedCount, skippedCount (dedup only) }

MODIFIED:
  validTransformed rows
      -> filter out rows where mapping is "__skip__" or empty
      -> insert remaining rows
      -> return { importedCount, skippedCount (dedup), skippedByAccountFilter }
```

## Build Order

Dependencies flow top-down. Each step is independently testable.

```
1. Server: Add rowCountByAccount to PreviewResult
   (additive, non-breaking -- existing code unaffected)
       |
2. Server: Modify executeImport skip logic + ExecuteResult type
   (remove throw, add filter, add skippedByAccountFilter)
       |
3. Client: Account dropdown "__skip__" option + validation logic
   (UI can now select skip, continue button works)
       |
4. Client: Filtered stats display in PreviewStep
   (uses rowCountByAccount for filtered numbers)
       |
5. Client: ResultsStep updates for skippedByAccountFilter
       |
6. Tests: Update existing tests + add skip-specific tests
```

Steps 1-2 are server-only. Steps 3-5 are client-only. Step 6 validates everything.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate Skip State

**What people do:** Add `skippedAccounts: Set<string>` alongside `accountMappings`.
**Why it's wrong:** Two sources of truth for the same concept. An account could be both "mapped" and "skipped" creating impossible states.
**Do this instead:** Use the mapping value itself (`__skip__` sentinel) -- one state, one source of truth.

### Anti-Pattern 2: Server-Side Preview Recomputation

**What people do:** Send skipped accounts back to the server to recompute filtered preview stats.
**Why it's wrong:** Unnecessary network roundtrip and CSV re-parse for a UI-only concern. The server already provides enough data with `rowCountByAccount`.
**Do this instead:** Return `rowCountByAccount` once, let the client do subtraction.

### Anti-Pattern 3: New tRPC Parameter for Skipped Accounts

**What people do:** Add `skippedAccounts: string[]` as a separate execute input parameter.
**Why it's wrong:** Redundant. The existing `accountMappings` record already represents skip status via the sentinel value. Adding a separate parameter creates two representations of the same thing.
**Do this instead:** Convention: `accountMappings[name] === "__skip__"` means skip. The existing `z.record(z.string(), z.string())` schema accepts this without modification.

### Anti-Pattern 4: Hiding Skipped Accounts from Account Mapping UI

**What people do:** Remove skipped accounts from the mapping list entirely after selecting skip.
**Why it's wrong:** User cannot undo the skip without resetting the entire import. Breaks undo expectations.
**Do this instead:** Keep the dropdown visible with "Skip" selected. User can change back to a real account at any time.

## Sources

- Direct code analysis: `import-service.ts` (438 lines), `import-router.ts` (21 lines), `ImportPage.tsx` (572 lines)
- `import-service.test.ts` test patterns
- PROJECT.md v2.4 milestone requirements

---
*Architecture research for: v2.4 CSV Import Account Filtering*
*Researched: 2026-03-24*
