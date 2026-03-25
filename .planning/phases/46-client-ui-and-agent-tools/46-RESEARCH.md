# Phase 46: Client UI and Agent Tools - Research

**Researched:** 2026-03-25
**Status:** Complete

## Phase Scope

Phase 46 delivers three areas: (1) import wizard inline account creation, (2) dashboard/accounts page visual distinction for manual accounts, (3) agent `create_account` tool and system prompt updates. All server-side CRUD is complete from Phase 45.

## Codebase Findings

### Import Wizard (ImportPage.tsx)

**Integration point:** `PreviewStep` component, account mappings section (lines 478-528).

- Account select dropdown at line 507-521 — new `CREATE_NEW_SENTINEL` option goes after `SKIP_SENTINEL` option (line 517), before existing accounts list (line 518-520)
- `SKIP_SENTINEL = '__SKIP__'` pattern at line 12 — mirror with `CREATE_NEW_SENTINEL = '__CREATE_NEW__'`
- `onAccountMappingChange(csvName, accountId)` callback already exists (line 509) — after inline creation, call it with the new account ID
- `accounts` prop on `PreviewStep` is `{ id: string; name: string }[]` (line 361) — needs local state augmentation to include newly created account
- `getValidationState` (line 24-40) treats empty string as unresolved — a CSV account in create mode will block Continue correctly without changes
- `computeSkipFilterStats` (line 42-54) only filters `SKIP_SENTINEL` — `CREATE_NEW_SENTINEL` won't interfere

**State additions needed in ImportPage:**
- `creatingAccountFor: string | null` — tracks which CSV account has the inline form open (only one at a time)
- Local `accounts` state to merge newly created accounts into the accounts list for the dropdown
- The `trpc.accounts.create` mutation from Phase 45's tRPC router

**Inline form placement:** Below the `<select>` in the existing `space-y-1` div (line 494), same pattern as the skip message at line 522-524.

### Dashboard (DashboardPage.tsx)

**Account rendering:** Lines 95-104, grouped by type. Each row is:
```tsx
<div key={a.id} className="flex justify-between py-1">
  <span className="text-sm">{a.name}</span>
  <span className="text-sm font-medium">{formatCurrency(a.balance)}</span>
</div>
```

**Changes needed:**
- Add "Manual" badge after `a.name` when `a.source === 'manual'`
- The `accounts` query already returns `source` (Phase 44 added it)
- No per-account sync button exists — the global "Sync Now" at line 179-185 stays; no conditional hiding needed (DASH-05 is satisfied by architecture)

**Sync status card:** Lines 176-260. The "Sync Now" button is card-level, not per-account. Manual accounts are naturally excluded from SimpleFIN sync. No change needed for DASH-05.

### Accounts Page (AccountsPage.tsx)

**Account cards:** Lines 37-55 (banking) and 64-80 (investments). Each card shows name, institution, and "Last synced" text.

**Changes needed:**
- Add "Manual" badge next to institution for `source === 'manual'`
- Change "Last synced" to "Last imported" for manual accounts
- The `accounts.list` query returns `source` — just need to read it in the component

### Agent Tools

**action-tools.ts:** 12 tools currently (line 54 in test). `create_account` will be tool #13. Pattern: import service function, create `tool()` with Zod schema, call service, return `jsonResult`.

**Key service function:** `createAccount(db, { name, institution, type? })` from `accounts-service.ts` — returns `Account` object with id, name, institution, type, balance, source.

**Duplicate check:** No `duplicateAccountName` helper exists yet — need to add one similar to `duplicateGroupName` (line 24-26 in action-tools.ts).

**query-tools.ts:** `get_account_balances` (lines 13-27) already selects `source` from accounts. The tool description at line 15 should be updated to mention `source` distinguishes account types.

**system-prompt.ts:** 16 rules currently. New rules 17-18 needed:
- Rule 17: Confirmation block for `create_account` (matches rule 15 pattern)
- Rule 18: Guidance that manual accounts are for non-SimpleFIN institutions, start at $0, balance populated via CSV import

### Test Files

**action-tools.test.ts:** 457 lines. Tests check tool count (line 51-54), tool names list (line 56-73), and individual tool behaviors. Need to:
- Update tool count from 12 to 13
- Add `create_account` to the names list
- Add `create_account` describe block with tests

**system-prompt.test.ts:** 40 lines. Tests check for section headings, tool mentions, confirmation blocks. Need to add tests for `create_account` confirmation and manual account guidance.

### Reporting & Net Worth (DASH-03, DASH-04)

Reports use `transactions` and `accounts` tables without source filtering. Manual accounts already appear in:
- `getNetWorth()` — queries `balance_snapshots` for all accounts
- `getSpendingByCategory()` — queries all transactions
- Daily balance snapshots — `recalculateBalance` (Phase 45) already writes to `balance_snapshots`

**No code changes needed for DASH-03 and DASH-04.** The data layer is source-agnostic.

## Risk Assessment

- **Low risk:** All changes are additive. No existing behavior is modified.
- **Import wizard complexity:** The inline form state management is the most complex piece — one form open at a time, local accounts list augmentation, and proper cleanup on cancel.
- **Test budget:** 448/800 project tests. Phase needs ~10-15 new tests across action-tools and system-prompt. Well within budget.

## Architecture Decisions

1. **No modal for account creation** — inline form within the dropdown's parent div, consistent with skip message pattern
2. **Local state for new accounts** — avoid refetch during wizard flow; background invalidation for cache freshness
3. **Agent confirmation via system prompt** — matches existing `create_category_group` pattern; no code-level confirmation gate
4. **Tool description update only for AGENT-02** — `get_account_balances` already returns `source`, just needs description update

---
*Phase: 46-client-ui-and-agent-tools*
*Research completed: 2026-03-25*
