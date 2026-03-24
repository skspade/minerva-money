# Technology Stack

**Project:** Minerva Money v2.4 — CSV Import Account Filtering
**Researched:** 2026-03-24
**Confidence:** HIGH
**Scope:** Changes needed for account filtering/skip capability in existing CSV import

## Recommendation: Zero New Dependencies

This milestone requires **no new libraries, no version bumps, and no stack changes**. Every feature is achievable with modifications to existing code using the current stack.

**Why:** The v2.4 scope is a behavioral refinement of existing CSV import functionality. It adds a "skip" option to a dropdown, filters arrays client-side, and relaxes a server-side validation check. These are pure logic changes to approximately 3 files.

---

## Existing Stack (Unchanged)

### Technologies Relevant to v2.4

| Technology | Current Version | Role in v2.4 | Change Needed |
|------------|----------------|---------------|---------------|
| React | ^19.0 | Render skip option in account dropdown, filter preview stats with `useMemo` | UI logic only |
| TypeScript | ^5.7 | Type updates for skip sentinel value, new `skippedAccountCount` field | Type modifications |
| Tailwind CSS | ^4.0 | Style the skip option distinctly (muted text) | CSS classes only |
| tRPC | ^11.0 | Pass skip-aware mappings to execute endpoint | No schema change |
| Zod 4 | ^3.24 | `accountMappings: z.record(z.string(), z.string())` already accepts partial records | None |
| csv-parse | ^5.6 | Parsing is entirely unaffected by account filtering | None |
| better-sqlite3 | ^11.7 | Query logic unchanged — rows are filtered before INSERT loop | None |
| TanStack Query | ^5.64 | Same mutation flow, no new queries | None |
| Vitest | ^3.0 | New test cases for skip behavior | Test additions only |
| lucide-react | existing | No new icons needed | None |

---

## Libraries Explicitly NOT Needed

| Library | Why Someone Might Consider It | Why It Is Unnecessary |
|---------|-------------------------------|----------------------|
| Any filtering library (lodash, ramda) | Client-side array filtering | Native `Array.filter()` is sufficient for filtering rows by account name |
| Form library (react-hook-form) | Managing skip/map state per account | Existing `useState` + `Record<string, string>` handles this fine |
| State management (zustand, jotai) | Tracking skip selections across components | Props flow through 3 components — adequate for this scope |
| UI component library | Styled skip option in dropdown | A single `<option>` with distinct text is all that is needed |

---

## Integration Points (Where Code Changes)

### 1. Account Mapping Dropdown (Client — ImportPage.tsx)

**Current behavior:** `<select>` with `<option value="">Select account...</option>` as disabled placeholder, then account options. All accounts must be mapped to proceed.

**Change:** Add `<option value="__skip__">Skip -- do not import</option>` after the disabled placeholder. The sentinel value `"__skip__"` is a string constant — no library needed, just a new `<option>` element.

**Validation change:** `allAccountsMapped` currently requires every account to have a non-empty string mapping. Update to accept `"__skip__"` as a valid selection. The new check: every account must be either mapped to a real account ID OR set to `"__skip__"`.

### 2. Preview Stats Filtering (Client — ImportPage.tsx)

**Current behavior:** Stats cards show `previewResult.totalRows`, `previewResult.validRows`, `previewResult.dedupStats` with no filtering.

**Change:** Use `useMemo` (already available from React — already imported) to compute filtered stats based on which accounts are marked as skip. Filter `sampleRows` to exclude skipped accounts. Recalculate row counts excluding skipped accounts. This is `Array.filter()` on existing arrays.

**No server round-trip needed.** The preview data already includes `accountName` on every sample row and dedup entry. Client-side filtering is instant and avoids re-parsing the CSV.

### 3. Server Execute Relaxation (Server — import-service.ts)

**Current behavior:** `executeImport()` at line 363-365 throws `Error('Unmapped accounts: ...')` if any CSV account name is not a key in `accountMappings`.

**Change:** Instead of throwing, filter out rows whose `accountName` is not in `accountMappings`. The client simply omits skipped accounts from the `accountMappings` record — no `"__skip__"` sentinel crosses the wire. Server sees fewer mappings and silently skips rows for accounts not in the map.

This is a 3-line change: replace the throw with a filter, or skip rows inside the existing for-loop.

### 4. Execute Result Updates (Server — import-service.ts)

**Current behavior:** `ExecuteResult` interface has `importedCount`, `skippedCount` (dedup skips), `categorizedByRules`, `categorizedFromCsv`.

**Change:** Add `skippedAccountCount: number` to distinguish "skipped because duplicate" from "skipped because account excluded." Increment this counter in the row loop when a row's account is not in the mappings.

### 5. Results Step Updates (Client — ImportPage.tsx)

**Current behavior:** Results step shows imported/skipped/categorized counts in a 2x2 grid.

**Change:** Add a card for `skippedAccountCount` showing how many rows were excluded due to account filtering. Conditionally render it (only show if > 0) to keep the UI clean for imports without skipping.

### 6. Router Schema (Server — import-router.ts)

**No change needed.** The Zod schema `accountMappings: z.record(z.string(), z.string())` already accepts any number of key-value pairs. The validation that all accounts must be present was in the service layer (the throw), not in the Zod schema.

---

## Sentinel Value Design Decision

**Use `"__skip__"` client-side only. Omit from server payload.**

- Client tracks skip selections with a `"__skip__"` sentinel in the `accountMappings` React state
- When building the `execute` mutation payload, client strips entries where value is `"__skip__"`
- Server receives only real account ID mappings — clean contract
- Server treats any CSV account not present in the mappings record as "skip this account's rows"

**Why not a separate `skippedAccounts: string[]` field?** Unnecessary complexity. The absence of an account from the mappings record is the skip signal. One less field to validate, serialize, and document. The server does not need to know the user's intent — it just processes what it receives.

**Why `"__skip__"` and not empty string `""`?** Empty string is already the "not yet selected" state for the disabled placeholder option. Using a distinct sentinel avoids ambiguity between "user hasn't chosen yet" and "user chose to skip."

---

## Testing Approach

All tests use Vitest (already installed). No new test utilities needed.

| Test Area | File | What to Test |
|-----------|------|-------------|
| Service: skip filtering | import-service.test.ts | `executeImport` with partial `accountMappings` skips rows for unmapped accounts |
| Service: no throw on unmapped | import-service.test.ts | `executeImport` does not throw when accounts are absent from mappings |
| Service: result counts | import-service.test.ts | `skippedAccountCount` accurately reflects filtered row count |
| Service: mixed scenario | import-service.test.ts | Import with some accounts mapped, some skipped, some rows deduped — all counts correct |

---

## Alternatives Considered

| Decision | Chosen | Alternative | Why Not Alternative |
|----------|--------|-------------|---------------------|
| Skip signal | Omit from mappings record | Explicit `skippedAccounts` array | Extra field adds complexity with no benefit; absence-as-signal is simpler |
| Client sentinel | `"__skip__"` string | Boolean flag per account | Would require restructuring `accountMappings` from `Record<string,string>` to a more complex type |
| Stats filtering | Client-side `useMemo` | Server re-preview with skip list | Wastes a round trip; client already has all the data needed |
| Server validation | Remove throw, filter in loop | New endpoint variant | Modifying existing behavior is simpler than adding endpoints |

---

## Installation

```bash
# Nothing to install. Zero new dependencies.
```

---

## Sources

- Existing codebase analysis: `import-service.ts` (lines 362-365 throw logic), `import-router.ts` (Zod schema), `ImportPage.tsx` (dropdown and validation logic) — PRIMARY source, HIGH confidence
- No external research needed — this milestone modifies existing, well-understood code patterns

---
*Stack research for: Minerva Money v2.4 CSV Import Account Filtering*
*Researched: 2026-03-24*
