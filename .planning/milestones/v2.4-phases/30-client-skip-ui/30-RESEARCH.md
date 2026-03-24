# Phase 30: Client Skip UI - Research

**Researched:** 2026-03-24
**Status:** Complete

## Phase Goal

Users can mark CSV accounts as "skip" in the import wizard and see which accounts they are skipping with clear visual treatment.

## Current State Analysis

### Target File

All changes are contained within a single file: `packages/client/src/pages/ImportPage.tsx` (572 lines). The file contains:

- **Component hierarchy**: `ImportPage` (parent with state) -> `UploadStep`, `PreviewStep`, `ResultsStep`
- **State management**: `accountMappings: Record<string, string>` where key=CSV account name, value=system account ID or empty string
- **Validation**: `allAccountsMapped` boolean at line 105-107 checks every account has a non-empty mapping value
- **Import handler**: `handleImport` at line 88 passes `accountMappings` directly to `executeMutation.mutate()`

### Server API (Phase 29 Additions)

The server now returns two new fields that the client interfaces don't yet include:

1. **`PreviewResult.rowCountByAccount: Record<string, number>`** — per-account valid row counts from `import-service.ts` line 221
2. **`ExecuteResult.skippedByAccountFilter: number`** — count of rows skipped because their account wasn't in the mappings, from `import-service.ts` line 231

The server already handles partial account mappings: rows for unmapped accounts are silently skipped (line 384-387). This means the client just needs to strip `__SKIP__` sentinel values before sending.

### Account Mapping Dropdown (Lines 394-409)

Current structure per account:
```tsx
<div key={acct.csvName} className="space-y-1">
  <label className="text-sm font-medium text-gray-700">{acct.csvName}</label>
  <select value={...} onChange={...} className={`... ${border-color-logic}`}>
    <option value="" disabled>Select account...</option>
    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
  </select>
</div>
```

The skip option inserts as a new `<option>` after the disabled placeholder. The border styling logic at line 400-401 uses a ternary based on whether the mapping value is falsy.

### Validation Logic (Lines 105-107)

```tsx
const allAccountsMapped = previewResult
  ? previewResult.accounts.every((a: AccountMatch) => accountMappings[a.csvName] && accountMappings[a.csvName] !== '')
  : false;
```

This needs two changes:
1. Accept `__SKIP__` as a valid resolved state (not just non-empty real IDs)
2. Add guard: if ALL accounts are skipped, block with a different message

### Continue Button Area (Lines 441-452)

Current validation message: "All accounts must be mapped before continuing" (line 443). The button is disabled when `!allAccountsMapped`. Needs to handle three states:
- Some undecided → "All accounts must be mapped or skipped"
- All skipped → "At least one account must be mapped to import"
- Ready → no message, button enabled

## Implementation Approach

### Sentinel Constant

Define at module scope:
```tsx
const SKIP_SENTINEL = '__SKIP__';
```

### Changes Required

1. **Type updates** (2 interfaces): Add `rowCountByAccount` to `PreviewResult`, add `skippedByAccountFilter` to `ExecuteResult`
2. **Skip option in dropdown**: Add `<option value={SKIP_SENTINEL}>` after placeholder
3. **Row count badge**: Show `{count} rows` pill next to each account label using `previewResult.rowCountByAccount[acct.csvName]`
4. **Visual treatment**: Conditional Tailwind classes on the account mapping row when value is `SKIP_SENTINEL` — dimmed opacity, amber left border
5. **Validation logic**: Replace `allAccountsMapped` with more nuanced check that accepts skip as resolved but blocks all-skip
6. **Validation message**: Conditional message text based on whether issue is "undecided" or "all skipped"
7. **Payload stripping**: Filter `accountMappings` in `handleImport` before passing to mutate
8. **Border color logic**: Update the select border color to handle three states (unmapped=red, skip=amber, mapped=gray)

### Test Strategy

This phase is purely client-side UI. The changes are in a React component with no testable business logic outside the component itself. The key testable unit is the payload stripping logic and validation logic.

Tests should verify:
- Skip sentinel is filtered from account mappings before payload construction
- Validation accepts skip as "resolved"
- Validation blocks when all accounts are skipped
- Validation blocks when any account is undecided

These can be tested as pure function unit tests by extracting the validation and filtering logic into helper functions.

## Risk Assessment

**Low risk** — all changes are in a single client-side file, adding UI options to existing dropdowns. The server already handles partial mappings correctly (Phase 29). No database changes, no API changes, no shared package changes.

---

*Phase: 30-client-skip-ui*
*Research completed: 2026-03-24*
