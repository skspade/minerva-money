# Phase 46: Client UI and Agent Tools - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Manual accounts are fully visible in the UI with appropriate visual distinction, creatable inline during CSV import, and accessible via the Claude agent. This phase delivers three distinct sub-domains: (1) the import wizard's inline account creation flow triggered from the account mapping dropdown, (2) dashboard and accounts page visual changes that distinguish manual from synced accounts, and (3) two agent tool changes — a new `create_account` action tool and a `source` field addition to `get_account_balances`. All server-side CRUD and import recalculation logic is already done (Phase 45); this phase is pure UI wiring and agent surface exposure.

</domain>

<decisions>
## Implementation Decisions

### Import Wizard — Inline Account Creation (IMPORT-01, IMPORT-02, IMPORT-03)

- Add a `+ Create New Account` sentinel option to each account mapping `<select>` in `PreviewStep`, positioned after "Skip — do not import" and before the existing account list
- Selecting `+ Create New Account` opens an inline form within the same grid cell — not a modal — with three fields: name (pre-filled from the CSV account name), institution (text, required), and type (select: banking | credit)
- On successful creation the new account is auto-selected in the dropdown and the inline form collapses; the newly created account is added to the accounts list in local state to avoid a refetch round-trip (Claude's Decision: avoids query invalidation latency during the import wizard flow; state update is sufficient since the account is immediately needed)
- Use `trpc.accounts.create` mutation (added in Phase 45) to create the account; on error show an inline error message below the form
- The inline form renders below the `<select>` element within the existing `space-y-1` column div — no layout restructuring needed (Claude's Decision: matches the established skip message pattern which also renders below the select in the same div)
- A "Cancel" link collapses the inline form without creating an account and resets the select to its prior value (Claude's Decision: always provide an escape hatch for multi-step inline forms)
- Investment type is excluded from the type dropdown — only `banking` and `credit` are offered, consistent with Phase 45's CRUD-04 restriction (from REQUIREMENTS.md out of scope)
- Import wizard state: add `creatingAccountFor: string | null` to `ImportPage` state to track which CSV account name is in create mode; only one inline form open at a time (Claude's Decision: prevents multiple simultaneous create forms which would create UX confusion)
- After creation, invalidate `trpc.accounts.list` query so the main accounts list stays fresh for future page visits (Claude's Decision: background invalidation has no UX cost and keeps caches consistent)
- The `getValidationState` helper already handles the empty-string case — a CSV account in create mode (no account selected yet) will block Continue correctly without changes

### Dashboard Visual Distinction (DASH-01, DASH-02, DASH-03, DASH-04, DASH-05)

- Manual accounts appear in the dashboard accounts card and AccountsPage alongside synced accounts — no separate section; they are grouped by `type` alongside SimpleFIN accounts (from DASH-01; existing grouping by type already handles mixed sources)
- Each manual account row in DashboardPage shows a `Manual` badge inline after the account name — small gray pill (`bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full`) (Claude's Decision: matches existing row count badge style in ImportPage; visually subtle to avoid distraction)
- Manual accounts show "Last imported: [date]" instead of "Last synced: [date]" using the `last_synced` column value (which Phase 45 stores as the import timestamp for manual accounts) (from DASH-02, from Phase 44 design: "last_synced column is reused")
- The `Sync Now` button at the top of the Sync Status card remains; the per-account Sync Now behavior is not affected since syncing is account-source-agnostic at the dashboard level (from DASH-05 — Sync Now button is not shown "for manual accounts"; the dashboard has one global Sync Now, not per-account buttons; no UI change needed here — SimpleFIN sync naturally ignores manual accounts already)
- AccountsPage account cards: add "Manual" badge next to institution text for `source === 'manual'` accounts, and show "Last imported" instead of "Last synced" (Claude's Decision: mirrors DashboardPage treatment for consistency)
- Net worth, balance snapshots, and spending reports: manual accounts are already included because Phase 44/45 ensured they exist in the DB with proper data — no reporting code changes needed (from DASH-03, DASH-04; the reports queries use `accounts` and `transactions` tables without source filtering)
- The `accounts.list` tRPC response already returns `source` field (from Phase 44) — client only needs to read it for conditional rendering

### Agent Tools (AGENT-01, AGENT-02, AGENT-03)

- Add `create_account` tool to `action-tools.ts` following the existing `tool()` pattern with `name`, `institution`, and `type` (enum: `'banking' | 'credit'`) parameters; delegates to `createAccount()` from `accounts-service.ts` (from AGENT-01)
- `create_account` requires confirmation before calling — add a confirmation block pattern to system prompt matching the existing `create_category_group` pattern (from AGENT-01; from established system prompt rule 15)
- `get_account_balances` in `query-tools.ts` already includes `source` in its SELECT: `SELECT id, name, institution, type, balance, available_balance, source FROM accounts` — no code change needed, the field is already returned (from AGENT-02; confirmed by reading query-tools.ts line 21)
- Add system prompt rule for `create_account`: instruct agent to check `get_account_balances` for existing accounts with same name before creating, and explain manual accounts are for institutions not available through SimpleFIN (from AGENT-03)
- System prompt guidance should note that `create_account` creates a zero-balance manual account and balance is populated via CSV import (Claude's Decision: prevents user confusion when agent creates an account that appears with $0 balance)
- Add `create_account` import of `createAccount` from `accounts-service.ts` in `action-tools.ts` (Claude's Decision: follows the established import pattern for service functions in action-tools.ts)

### Test Coverage

- Unit tests for the new `create_account` agent tool in `action-tools.test.ts` — verify it calls `createAccount`, returns success, and requires no confirmation gate at the tool level (confirmation is enforced by system prompt, not code) (Claude's Decision: consistent with existing action tool test patterns)
- System prompt tests in `system-prompt.test.ts` — verify the new rule text is present (Claude's Decision: existing system prompt tests check for rule content; add a test for manual account guidance)
- Import wizard tests: `ImportPage` already has exported pure helper functions — no new helper functions are needed for the inline create flow since it is stateful UI behavior; test via existing patterns if applicable
- No tests for DashboardPage visual changes — the conditional rendering is too thin to warrant unit tests (Claude's Decision: dashboard tests don't exist in codebase; visual badge rendering doesn't justify adding a test file)

### Claude's Discretion

- Exact CSS classes for the "Manual" badge beyond the general pill style described above
- Whether the inline account creation form uses a fieldset or plain divs
- Exact system prompt wording for the `create_account` rule
- Error message text for inline account creation failure in the import wizard
- Whether to show the institution field as required or optional in the inline form (Phase 45 requires it — enforce in the form)

</decisions>

<specifics>
## Specific Ideas

- IMPORT-01: The sentinel value for "create new" should be a distinct constant like `CREATE_NEW_SENTINEL = '__CREATE_NEW__'` to avoid collision with `SKIP_SENTINEL = '__SKIP__'` and account IDs
- IMPORT-02: Pre-fill the name field from `acct.csvName` — the CSV account name is already available in `PreviewStep` as `acct.csvName`
- IMPORT-03: After creation, call `onAccountMappingChange(acct.csvName, newAccount.id)` to auto-select — this is the existing callback already threading through `PreviewStep`
- DASH-02: The `lastSynced` field from `accounts.list` is already available (Phase 44 added `source` to the query; `last_synced` was always returned as `lastSynced`)
- DASH-05: The Sync Status card has a global "Sync Now" button, not per-account buttons — no conditional hiding needed; Phase 44's sync trigger already filters to `source = 'simplefin'` so manually-triggered syncs are safe
- AGENT-02: Confirmed — `query-tools.ts` line 21 already has `source` in the SELECT. No code change needed for AGENT-02. The tool description should be updated to mention `source` distinguishes manual vs SimpleFIN accounts
- The `accounts.create` tRPC mutation returns the full created account object — the inline form can use it directly to update local state and auto-select without any reshaping

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets

- `packages/client/src/pages/ImportPage.tsx` `PreviewStep` component: The account mapping section (lines 478-528) is the integration point for inline account creation. The select element, sentinel pattern, and `onAccountMappingChange` callback are all in place.
- `packages/client/src/pages/ImportPage.tsx` `SKIP_SENTINEL` pattern: Establishes the sentinel value convention for special select options — mirrors this with `CREATE_NEW_SENTINEL`
- `packages/client/src/pages/DashboardPage.tsx` account rendering loop (lines 95-111): Each account row renders `{a.name}` and `{formatCurrency(a.balance)}` — add `source` badge inline after the name
- `packages/client/src/pages/AccountsPage.tsx` account card (lines 43-49): Shows name, institution, and `lastSynced` — add `source` conditional for badge and label swap
- `packages/server/src/agent/tools/action-tools.ts` `createActionTools()`: Returns an array of `tool()` calls — `create_account` is appended here following the `create_category`/`create_category_group` pattern at lines 244-280
- `packages/server/src/agent/tools/query-tools.ts` `get_account_balances` (lines 13-27): Already returns `source`; only the tool description string needs updating to mention it
- `packages/server/src/agent/system-prompt.ts`: Rules 14-16 govern category management — add rules 17+ for account creation following the same confirmation block format

### Established Patterns

- Sentinel values in select dropdowns: `SKIP_SENTINEL = '__SKIP__'` — a module-level string constant, used in `value` comparison and `filterSkippedAccounts`
- Inline mutation with local state update: `useMutation` hook with `onSuccess` callback that calls a setter function — used throughout `ImportPage` and `DashboardPage`
- Tool confirmation via system prompt (not code): `create_category_group` and `create_category` tools have no confirmation gate in TypeScript — the system prompt rule enforces asking the user before calling; `create_account` follows the same pattern
- tRPC query invalidation after mutation: `queryClient.invalidateQueries({ queryKey: trpc.accounts.list.queryKey() })` — established in `DashboardPage` sync mutation `onSuccess`
- Visual badges for metadata: `bg-gray-100 text-gray-600 text-xs` pill spans for row counts in `ImportPage` lines 502-505 — the "Manual" badge mirrors this style

### Integration Points

- `packages/client/src/pages/ImportPage.tsx` `PreviewStep` props: `accounts` prop is `{ id: string; name: string }[]` — needs to accept the new account from creation without a full refetch; `onAccountMappingChange` callback is already in place
- `packages/server/src/agent/mcp-server.ts`: Tool registration is `[...createQueryTools(db), ...createActionTools(db, ctx)]` — no change needed; `create_account` is added inside `createActionTools`
- `packages/server/src/agent/tools/action-tools.ts`: Import `createAccount` from `../../accounts/accounts-service.js` alongside existing service imports
- `packages/server/src/agent/system-prompt.ts`: New rules appended before the closing backtick of `SYSTEM_PROMPT`

</code_context>

<deferred>
## Deferred Ideas

- AccountsPage edit/delete UI for manual accounts (ACCTUI-01) — future milestone; tRPC mutations exist but UI is explicitly out of scope for v2.7
- Opening balance help text in UI (ACCTUI-02) — future milestone
- Additional CSV format support (FMT-01) — future milestone
- HELOC/loan account type expansion (FMT-02) — future milestone
- Manual investment accounts — explicitly out of scope (REQUIREMENTS.md)
- Bulk CSV re-import in replace mode — out of scope (REQUIREMENTS.md)

</deferred>

---

*Phase: 46-client-ui-and-agent-tools*
*Context gathered: 2026-03-25 via auto-context*
