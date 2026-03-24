# Feature Research: CSV Import Account Filtering

**Domain:** Personal finance CSV import -- account skip/exclude capability
**Researched:** 2026-03-24
**Confidence:** HIGH

## Context

This research covers ONLY the v2.4 account filtering/skip features. The base CSV import (v2.3) is already built and working: 3-step wizard, auto-suggest mappings, dedup stats, sample rows, account/category dropdowns.

**Current behavior requiring change:**
- Account dropdown only lists real Minerva accounts -- no skip option
- `allAccountsMapped` (line 106 of ImportPage.tsx) requires every account be mapped to a real account
- `executeImport` throws if any account is unmapped (line 364 of import-service.ts)
- Dedup stats count unmapped accounts as "new" (line 322 of import-service.ts)
- Sample rows show all accounts indiscriminately

## Feature Landscape

### Table Stakes (Users Expect These)

Features that are essential for a functional account filtering experience. Missing any of these makes the feature feel broken.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| "Skip" option in account mapping dropdown | Without this, users cannot exclude unwanted accounts at all -- the entire feature hinges on it | LOW | Existing account mapping dropdown | Add a sentinel value (e.g., `__skip__`) as an `<option>` in the account `<select>`. Treat it as a valid mapping so `allAccountsMapped` passes. |
| Server accepts skip sentinel gracefully | Server currently throws on unmapped accounts. Must skip rows for sentinel-mapped accounts instead of crashing | LOW | Skip option in dropdown | Filter `validTransformed` to exclude rows where `accountMappings[row.accountName]` equals the skip sentinel before inserting. Track skipped-by-filter count separately from dedup skips. |
| Client-side dedup stats exclude skipped accounts | Stats currently count unmapped accounts as "new". When an account is marked skip, those rows should not inflate the "new" count | MEDIUM | Skip option in dropdown | Client recomputes from server preview data by excluding skipped accounts. Avoids extra server round-trip. The preview response already contains per-row account names for filtering. |
| Sample rows exclude skipped accounts | Sample rows table shows all rows regardless of account. Rows from skipped accounts should not appear in the preview sample | LOW | Skip option in dropdown | Filter `previewResult.sampleRows` client-side to exclude rows from skipped accounts. Show a note like "X rows from skipped accounts not shown." |
| Results/confirm step reflects filtered counts | The confirm summary (step 3) must show counts excluding skipped accounts so user knows exactly what will import | LOW | Client-side stats filtering | Reuse the same client-side filtering logic. Show skipped-account row count as a separate line item. |
| Per-account row count in mapping UI | Users need to see how many rows each account has to make informed skip decisions | LOW | Existing preview data | Cannot compute from `sampleRows` (only 10 rows). Need full count per account from server. Add `rowCount: number` to `AccountMatch` in `previewImport`. |

### Differentiators (Competitive Advantage)

Features that improve the experience beyond basic functionality. Not required, but add polish.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Visual row count badge per account | Shows "142 rows" next to each account dropdown so user sees the impact of skipping | LOW | Count rows per `accountName` in `previewImport` and include in `AccountMatch`. Trivial server change, high UX value. |
| Skipped account visual styling | Dim/grey-out skipped account mapping cards so it is visually obvious which accounts are excluded | LOW | CSS-only change: add a muted/opacity style when dropdown value equals skip sentinel. |
| "Skip All Unmatched" bulk action | One button to set all accounts without auto-suggested matches to "Skip" | LOW | Useful when CSV has many accounts but user only wants a few. Iterate `previewResult.accounts` where `suggestedId` is null and set to skip sentinel. |
| Filtered summary banner | Persistent banner showing "Importing from 3 of 5 accounts (2 skipped)" | LOW | Client-side count of skip vs non-skip in `accountMappings`. Clear communication of filter state. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Per-row skip/include checkboxes | Granular control over individual transactions | Massive UI complexity for 10,000+ row Monarch exports. Nobody will review individually. Wrong abstraction level. | Account-level skip covers the real use case (excluding entire account types). Individual transactions handled by dedup. |
| Re-fetch preview on each mapping change | Keep dedup stats perfectly accurate as mappings change | Expensive: full CSV re-parse + dedup hash generation on every dropdown change. Preview is a server mutation, not cheap. | Client-side filtering of the initial preview result. Dedup stats for already-mapped accounts are correct from initial preview. |
| Auto-skip by account type detection | Automatically identify and skip investment/loan accounts | CSV has no account type metadata. Monarch exports use plain account names only. Would require fragile name guessing. | Let users manually skip. Per-account row counts help them decide quickly. |
| Persistent skip preferences across imports | Remember which accounts to skip for next import | Single-user doing a one-time Monarch migration. This is not a recurring workflow. YAGNI. | Each import starts fresh. Auto-suggest handles the common case. |
| Server-side filtering in preview endpoint | Send skip list to server, get filtered preview back | Adds API complexity and round-trips for no benefit. Client already has all data needed to filter locally. | Client-side filtering of existing preview response. |

## Feature Dependencies

```
Skip option in account dropdown (FOUNDATION)
    |
    +---> Client-side stats filtering (sample rows, dedup stats)
    |         |
    |         +---> Results step filtered counts
    |
    +---> Server-side execute changes (skip rows for sentinel accounts)
    |
    +---> Per-account row count (server-side, enhances skip decisions)

Skipped account visual styling --enhances--> Skip option in dropdown
"Skip All Unmatched" button --enhances--> Skip option in dropdown
Filtered summary banner --enhances--> Client-side stats filtering
```

### Dependency Notes

- **All features require the skip dropdown option:** This is the atomic foundation. Nothing works without a way to mark an account as skipped.
- **Client-side stats filtering requires skip option:** Once skip is selectable, stats must update to reflect the filter -- otherwise counts are misleading.
- **Server execute changes require skip option but are independent of client stats:** Can be built in parallel with stats filtering.
- **Results step depends on stats filtering:** Uses the same filtering logic, just in a different wizard step.
- **Per-account row count is independent:** A server-side change to `previewImport` that can ship alongside or before the skip option.

## MVP Definition

### Must Have (v2.4)

- [x] Skip option in account mapping dropdown -- the core capability
- [x] Server-side execute accepts skip sentinel, excludes those rows gracefully
- [x] Client-side dedup stats exclude skipped accounts
- [x] Sample rows exclude skipped accounts
- [x] Results/confirm step reflects filtered counts
- [x] Per-account row count displayed in mapping UI

### Should Have (v2.4 stretch)

- [ ] Skipped account visual styling (dimmed mapping card)
- [ ] "Skip All Unmatched" bulk action button
- [ ] Filtered summary banner ("Importing 3 of 5 accounts")

### Not Building

- [ ] Per-row checkboxes -- wrong abstraction level
- [ ] Server-side preview filtering -- unnecessary complexity
- [ ] Auto-skip by account type -- no type metadata available
- [ ] Persistent skip preferences -- one-time migration workflow

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Skip dropdown option | HIGH | LOW | P1 |
| Server skip handling | HIGH | LOW | P1 |
| Per-account row count | HIGH | LOW | P1 |
| Client-side stats filtering | HIGH | MEDIUM | P1 |
| Results step filtered counts | MEDIUM | LOW | P1 |
| Sample rows filtering | MEDIUM | LOW | P1 |
| Skipped account styling | MEDIUM | LOW | P2 |
| "Skip All Unmatched" button | LOW | LOW | P2 |
| Filtered summary banner | LOW | LOW | P3 |

## Implementation Guidance

### Sentinel Value

Use `__skip__` as the account mapping value for skipped accounts. This avoids collision with real UUIDs and is trivial to check on both client and server.

### Specific Code Touch Points

**import-service.ts `executeImport` (lines 362-366):**
- Remove the unmapped accounts throw
- Add `const SKIP_SENTINEL = '__skip__';`
- Filter: `const rowsToImport = validTransformed.filter(r => accountMappings[r.accountName] !== SKIP_SENTINEL);`
- Track `filteredCount` for rows excluded by account skip
- Update `ExecuteResult` to include `filteredCount`

**import-service.ts `PreviewResult` / `AccountMatch`:**
- Add `rowCount: number` to `AccountMatch` interface
- Compute in `previewImport`: count rows per unique `accountName`

**ImportPage.tsx account dropdown:**
- Add `<option value="__skip__">Skip -- do not import</option>` to account `<select>`
- Update `allAccountsMapped`: skip sentinel counts as mapped (value is not empty string)
- Add client-side filter functions for stats/sample rows based on `accountMappings`
- Update results step to show filtered count as separate line item

**import-router.ts:**
- No schema changes needed. `accountMappings` is `Record<string, string>` -- `__skip__` is a valid string.

### What NOT to Change

- `previewImport` server function does not need skip awareness. Returns all data; client filters.
- `parseCsv`, `validateRow`, `transformRow` are untouched.
- Category mappings are unaffected (categories for skipped accounts are simply ignored during execute).

## Sources

- Direct code analysis: `packages/server/src/import/import-service.ts` (current server implementation)
- Direct code analysis: `packages/client/src/pages/ImportPage.tsx` (current UI with 3-step wizard)
- Direct code analysis: `packages/server/src/import/import-router.ts` (current tRPC API)
- PROJECT.md v2.4 milestone requirements

---
*Feature research for: CSV Import Account Filtering*
*Researched: 2026-03-24*
