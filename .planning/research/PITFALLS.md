# Pitfalls Research

**Domain:** Manual account management + CSV import integration in an existing budgeting app with auto-sync
**Researched:** 2026-03-25
**Confidence:** HIGH (based on direct codebase analysis of existing service layer, schema, and sync pipeline)

---

## Critical Pitfalls

### Pitfall 1: Sync Trigger Iterates All Accounts Including Manual Ones

**What goes wrong:**
The `sync.trigger` mutation (trpc-router.ts line 60-64) fetches ALL accounts from the DB and checks the rate limiter for every one. When manual accounts exist, their IDs will appear in this list. The rate limiter has no record of them (they've never been incremented), but they may fail `canManualSync()` depending on how the limiter handles unknown IDs. The real problem: SimpleFIN's `fetchAccounts()` returns only SimpleFIN accounts, so iterating manual accounts in the rate-limit check is incorrect and creates confusing error messages ("Rate limit: insufficient quota for accounts: My Mortgage").

**Why it happens:**
The sync infrastructure was built when all accounts were SimpleFIN accounts. The accounts list query has no filter. Adding manual accounts to the DB makes them visible to every code path that queries `FROM accounts` without a `WHERE source = 'simplefin'` filter.

**How to avoid:**
In the `sync.trigger` mutation, filter the accounts list to SimpleFIN accounts before rate-limit checking: `WHERE source = 'simplefin'` (or `WHERE simplefin_id IS NOT NULL` as a safe fallback during the migration period). Apply the same filter anywhere the sync pipeline queries accounts.

**Warning signs:**
- Manual sync returning rate-limit errors for accounts that were never synced
- Sync log showing `accounts_synced` count that includes manual accounts
- Rate limiter `increment()` being called with `manual_*` IDs

**Phase to address:**
Schema migration phase (the phase that adds the `source` column). The filter must be added to the sync trigger in the same phase that introduces manual accounts to the DB, not in a later cleanup phase.

---

### Pitfall 2: Balance Column Goes Stale for Manual Accounts

**What goes wrong:**
Manual account balance is computed from transaction sums (`recalculateBalance()`), but the `balance` column on the `accounts` table is the authoritative value read by the dashboard, net worth chart, and the `accounts.list` query. If `recalculateBalance()` is not called after every operation that adds transactions, the displayed balance diverges from reality. The net worth chart reads `balance_snapshots` which are populated from the `balance` column — so a stale balance column produces a permanently incorrect net worth history for that day.

**Why it happens:**
The existing pattern for SimpleFIN accounts is that the sync upsert writes `balance` directly from the bank API — an external source of truth. For manual accounts there is no external source; the balance must be derived. Developers often implement `recalculateBalance()` after CSV import but forget that: (1) the scheduled snapshot job reads the current `balance` column — if import and the snapshot run in the wrong order on the same day, the snapshot captures the pre-import balance; (2) there is currently no "delete transaction" flow for manual accounts — if one is added later, balance recalculation must be wired there too.

**How to avoid:**
Call `recalculateBalance()` inside the same SQLite transaction as the operation that changes transactions. For CSV import, `recalculateBalance()` must be the last step inside `db.transaction()` in `executeImport()`, after all inserts. Consider also inserting a balance snapshot for the import date at the end of `executeImport()` rather than waiting for the scheduled snapshot job.

**Warning signs:**
- Dashboard shows balance 0 for a manual account that has imported transactions
- Net worth chart shows no change on the day of a CSV import
- `SELECT balance FROM accounts WHERE id = 'manual_...'` returns 0 after a successful import

**Phase to address:**
The account CRUD service phase. The `recalculateBalance()` function must be defined there, and the import service must be updated in the same or immediately subsequent phase to call it.

---

### Pitfall 3: Inline Account Creation Leaves Preview Stats Stale

**What goes wrong:**
The import wizard uses a stateless preview/execute pattern: the client sends the CSV text to `previewImport()` at step 2, which auto-suggests account matches against the current DB. If the user then creates a new account inline (still on step 2), the client has the new account ID from the `accounts.create` response — but the preview stats (dedup counts, sample rows, row counts by account) were computed before the account existed. The user sees "0 duplicates" for a second import of the same data to a newly-created account, even when duplicates exist.

**Why it happens:**
The preview is a one-shot server call. The client patches `accountMappings` locally when a new account is created, which is correct for the execute step. But the dedup stats shown in the UI are the server's original preview response, which used `suggestedId: null` for that account (treating its rows as "new" by the conservative default in `previewImport()`). This is a safe failure mode in that no wrong data is written, but it creates a UX trust gap and can mask real duplicate problems.

**How to avoid:**
After inline account creation, re-run `previewImport()` with the updated mappings, or accept that the dedup stats shown may be conservative and add an explicit disclaimer in the UI ("Duplicate check not available for newly created accounts — will be enforced at import."). The execute step is always authoritative; the preview is advisory.

**Warning signs:**
- Dedup stats show "0 duplicates" for a second import of the same data to a newly-created account
- The confirm page row count differs from what actually gets imported

**Phase to address:**
The import wizard UI phase. Either add a "refresh preview" call after inline account creation, or add a disclaimer note to the preview stats for accounts created mid-wizard.

---

### Pitfall 4: Cascade Delete Removes Budget-Relevant Transaction History

**What goes wrong:**
The schema uses `ON DELETE CASCADE` on `transactions.account_id`. Deleting a manual account deletes all its transactions. For a personal budgeting app, this destroys historical spending data — past budget periods can no longer show what was spent, and the net worth chart loses historical balance data points for that account.

**Why it happens:**
Cascade delete is the correct choice for referential integrity. The pitfall is not the cascade itself — it's that `deleteAccount()` as described in the design does not require explicit confirmation at the service layer about what will be lost. If a `delete_account` agent tool is ever added, it could silently destroy months of transaction history without the user understanding the scope.

**How to avoid:**
The `deleteAccount()` service function should: (1) count the transactions that will be deleted and include that count in the return value, (2) expose this count via the tRPC mutation so the UI can show a warning ("This will permanently delete 847 transactions"), (3) never be exposed as an agent tool without a confirmation flow identical to the budget-change confirmation pattern already in the system. Add a `dryRun: true` option to `deleteAccount()` that returns the count without deleting.

**Warning signs:**
- A "Delete Account" UI button with no transaction count in the confirmation dialog
- `deleteAccount()` function that does not return the count of affected transactions before deleting

**Phase to address:**
Account CRUD service phase. Build the safeguard into the service function itself, not as a UI-only concern.

---

### Pitfall 5: Sync Upsert Can Overwrite Manual Account Data on ID Collision

**What goes wrong:**
The sync upsert (sync-service.ts line 94-105) uses `INSERT INTO accounts ... ON CONFLICT(id) DO UPDATE SET name = ..., balance = ...`. The DO UPDATE clause has no guard on the `source` column. The design uses `manual_<uuid>` IDs which are collision-resistant, but the upsert would update any row whose `id` matches an incoming SimpleFIN account ID — including a manual account if an ID ever collided. More practically: the upsert also sets `simplefin_id = excluded.id` for every row it touches. A manual account correctly has `simplefin_id = NULL`. If a SimpleFIN account ID ever matched a manual account ID (essentially impossible with UUID, but not architecturally prevented), the manual account's `source` value and `simplefin_id` would be silently overwritten.

**Why it happens:**
The sync upsert was written when all accounts came from SimpleFIN. The DO UPDATE clause does not check the current row's `source` value before updating.

**How to avoid:**
Add `WHERE source = 'simplefin'` (or equivalently check that `simplefin_id IS NOT NULL`) to the upsert's DO UPDATE clause. This is cheap to add in the migration phase and makes the invariant architecturally enforced rather than relying on UUID collision-resistance.

**Warning signs:**
- Manual account `source` value becomes `'simplefin'` after a sync
- Manual account `simplefin_id` is no longer NULL after a sync

**Phase to address:**
Schema migration phase. Update the sync upsert's DO UPDATE clause at the same time the `source` column is added.

---

### Pitfall 6: `accounts.list` Query Missing `source` Column Breaks Downstream Features

**What goes wrong:**
The existing `accounts.list` tRPC procedure (trpc-router.ts line 119-134) selects `id, name, institution, type, balance, last_synced` — no `source` column. After adding `source` to the schema, any code that needs to distinguish manual vs. synced accounts (dashboard visual badge, agent `list_accounts` tool, import wizard auto-suggest, sync trigger filter in the UI) must consume `source`. If the `accounts.list` query is not updated in the same phase as the migration, every downstream consumer silently receives objects without the field it needs, TypeScript types will not reflect the new column, and developers will add one-off queries in multiple places instead of using the canonical list procedure.

**Why it happens:**
Column added by migration, query not updated in the same phase. This is the classic "migration without query update" failure pattern — the DB has the data but the API does not expose it.

**How to avoid:**
Update `accounts.list` to include `source` in the same commit as the migration. Update the TypeScript return type. All downstream consumers (dashboard, agent tools, import wizard auto-suggest) will then have access without additional queries.

**Warning signs:**
- Dashboard cannot show "Manual" badge because the list response has no `source` field
- Agent `list_accounts` tool returns objects without a `source` field despite the DB having it
- TypeScript type for the accounts list does not include `source`

**Phase to address:**
Schema migration phase. Treat the query update as part of the same atomic change as the migration SQL.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skipping `recalculateBalance()` in tests | Faster test setup | Tests don't verify balance accuracy; balance bugs ship silently | Never — balance is core output |
| Using `simplefin_id IS NOT NULL` as the source filter instead of `source` column | No migration needed | Fragile — assumes all SimpleFIN accounts have a non-null simplefin_id (currently true but not schema-enforced) | Only as a temporary fallback during the migration period |
| Not re-running preview after inline account creation | Simpler UI code | Dedup stats are incorrect for newly-created accounts; misleads user on second import | Acceptable only if a disclaimer is shown in the preview |
| Hard-coding `type = 'banking'` as the only option for manual accounts | Reduces form complexity | Investment account type is needed for net-worth-only balance display; adding it later requires UI change | Only if investment manual accounts are explicitly out of scope for this milestone |
| Exposing account delete in the agent without a confirmation flow | Faster agent implementation | Can silently destroy months of transaction history | Never |

---

## Integration Gotchas

Common mistakes when connecting the new feature to existing services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SimpleFIN sync trigger | Querying all accounts for rate-limit check, including manual accounts | Filter to `WHERE source = 'simplefin'` before passing to rate limiter |
| CSV import execute | Calling `recalculateBalance()` after the transaction instead of inside it | Call inside the same `db.transaction()` as the inserts |
| Balance snapshots | Waiting for the scheduled snapshot job to capture post-import balance | Insert a `balance_snapshots` row for the import date at the end of `executeImport()` |
| tRPC accounts router | Not adding `source` to `accounts.list` query after migration | Update the query and TypeScript types in the same phase as the migration |
| Transfer detection on import | Adding a duplicate `detectTransferCandidates()` call to account creation flow | Transfer detection already runs inside `executeImport()` — no change needed at account creation time |
| Dedup hash for manual accounts | Assuming `manual_` prefix in account ID breaks hash generation | `generateDedupHash()` takes `accountId` as an opaque string — the `manual_` prefix is irrelevant |
| Agent `list_accounts` tool | Not including `source` field in tool response after schema migration | Update the query inside the tool helper to include `source` alongside the existing fields |

---

## Performance Traps

Patterns that work at small scale but have hidden costs.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full table scan in `recalculateBalance()` | Slow balance update for accounts with large transaction history | `SELECT SUM(amount) FROM transactions WHERE account_id = ?` is a single indexed scan — already has `idx_transactions_account_id` index | Not a real issue at personal finance scale (< 50k total transactions) |
| Re-parsing the entire CSV on preview refresh after inline account creation | Slow step-2 interaction for large CSV files | Cache parsed rows client-side in component state; only re-run the dedup check portion | Only relevant for CSV files > 5MB — unlikely in practice |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Allowing `updateAccount()` or `deleteAccount()` on SimpleFIN accounts via the tRPC API | User could delete a synced account; next sync would re-create it, but transaction history between deletion and re-sync is gone | Service functions must check `source = 'manual'` before any modification and throw a typed TRPCError |
| Not sanitizing manual account name/institution in agent responses | Stored values appear in agent chat — if they contain prompt-injection sequences, they could influence agent behavior | The existing XML-wrapping pattern already handles transaction payee/memo fields; apply the same wrapping to account name and institution in the `create_account` and `list_accounts` tool responses |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing "Last synced: never" for manual accounts | Confusing — manual accounts are never "synced" | Show "Last imported: {date}" using `last_synced` column (repurposed for import timestamp), or hide the field if no imports yet |
| "Sync Now" button or sync status applies to manual accounts | User tries to sync a manual account and gets an error or silent no-op | Grey out or hide sync affordances for rows where `source = 'manual'` in the dashboard accounts list |
| Import wizard showing "Create New Account" for every unmapped account without pre-filling the name | User must type the name manually even though it came from the CSV | Pre-fill the Name field from the CSV account name; leave Institution blank but auto-focused |
| No transaction count in the delete confirmation dialog | User accidentally deletes an account with 2 years of imported history with no indication of scope | Show count in dialog: "This will permanently delete 847 transactions and cannot be undone." |
| Preview stats unchanged after inline account creation | User does not realize the dedup check was not run for the newly-created account | Add a note: "Duplicate check not available for newly created accounts — will be enforced at import time." |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Balance recalculation:** `recalculateBalance()` is called inside the import transaction — verify with a test that queries `accounts.balance` after `executeImport()` and confirms it matches `SUM(transactions.amount)` for that account
- [ ] **Sync isolation:** Rate-limit check in `sync.trigger` filters to `source = 'simplefin'` — verify by inserting a manual account and running sync, confirming no rate-limit error and `accounts_synced` excludes the manual account
- [ ] **Source column in list query:** `accounts.list` tRPC response includes `source` field — verify by calling the endpoint and checking the TypeScript response shape
- [ ] **Cascade delete protection:** `deleteAccount()` returns transaction count — verify the UI shows this count before confirming deletion
- [ ] **Balance snapshot on import:** A `balance_snapshots` row is inserted for the import date at the end of `executeImport()` — verify the net worth chart reflects updated data on the day of import without waiting for the scheduled snapshot
- [ ] **Manual accounts in dashboard:** Manual accounts appear in the accounts list with a "Manual" badge — verify the `source` field drives the badge and SimpleFIN accounts do not show it
- [ ] **Agent list_accounts includes source:** Verify in a test that the tool output includes `"source": "manual"` for a manual account
- [ ] **Sync button hidden for manual accounts:** Verify the UI hides or disables sync affordance for rows where `source = 'manual'`
- [ ] **Type guard on CRUD mutations:** `update` and `delete` mutations reject attempts to modify SimpleFIN accounts — verify with a test that sends a SimpleFIN account ID to `accounts.update` and expects a TRPCError

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Balance column stale for manual accounts | LOW | Run `recalculateBalance()` for all manual accounts as a one-time repair query; add the call to import going forward |
| Sync trigger failing due to manual accounts in rate-limit check | LOW | Add `WHERE source = 'simplefin'` filter to the accounts query in the trigger; deploy |
| Manual account deleted accidentally (no soft delete) | HIGH | Restore from iCloud Drive backup (SQLite .backup snapshots run every 6 hours); re-run CSV import if backup is older than the import |
| Preview stats stale after inline account creation | LOW | Add "Refresh preview" button or disclaimer; execute step always re-checks dedup |
| Balance snapshot missing for import day | LOW | Manually insert a `balance_snapshots` row for today via a one-off SQL query on the server |
| Sync upsert overwrote manual account data | MEDIUM | Restore from iCloud backup; add the `WHERE source = 'simplefin'` guard to the upsert DO UPDATE clause |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Sync trigger iterates manual accounts | Schema migration phase (add `source` column + update sync trigger filter) | Test: insert manual account, trigger sync, confirm no rate-limit error and `accounts_synced` excludes it |
| Balance column goes stale | Account CRUD service phase (define `recalculateBalance()`) + import service update phase | Test: call `executeImport()`, then query `accounts.balance` and compare to `SUM(transactions.amount)` |
| Inline account creation leaves preview stats stale | Import wizard UI phase | Acceptance: add disclaimer note; test confirms execute produces correct imported count regardless |
| Cascade delete destroys history | Account CRUD service phase (add `dryRun` option + return count) | Test: `deleteAccount({ id, dryRun: true })` returns correct count; UI shows count in confirmation |
| Sync upsert overwrites manual account | Schema migration phase (update DO UPDATE clause) | Test: sync with a manual account present, confirm `source` column unchanged after sync |
| `accounts.list` missing `source` | Schema migration phase (update query in same commit) | Test: `accounts.list` response includes `source` field with value `"manual"` or `"simplefin"` |

---

## Sources

- Direct codebase analysis: `packages/server/migrations/001-initial-schema.sql` — schema structure, ON DELETE CASCADE rules, account ID format, `simplefin_id` UNIQUE constraint
- Direct codebase analysis: `packages/server/src/sync/sync-service.ts` — upsert pattern (lines 94-105), how `simplefin_id` is set, balance update, balance snapshot insertion
- Direct codebase analysis: `packages/server/src/sync/trpc-router.ts` — rate-limit check queries all accounts (lines 60-64), `accounts.list` column selection (lines 119-134)
- Direct codebase analysis: `packages/server/src/import/import-service.ts` — stateless preview/execute pattern, dedup hash computation, post-import hooks (categorize + transfer detect), account auto-match logic
- Direct codebase analysis: `packages/server/src/reports/reports-service.ts` — net worth chart reads `balance_snapshots`, which reads the `balance` column
- Direct codebase analysis: `packages/server/src/sync/rate-limiter.ts` — rate limiter behavior for unknown account IDs
- Design document: `.planning/designs/2026-03-25-manual-accounts-csv-import-design.md` — `manual_<uuid>` ID convention, `recalculateBalance()` placement, `last_synced` column reuse, `source = 'manual'` guard on mutations

---
*Pitfalls research for: Manual account management + CSV import integration in budgeting app with auto-sync (v2.7)*
*Researched: 2026-03-25*
