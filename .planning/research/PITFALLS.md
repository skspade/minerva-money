# Domain Pitfalls

**Domain:** Sync error visibility — per-account warnings, partial sync status, dashboard/navbar indicators
**Researched:** 2026-03-26
**Confidence:** HIGH (based on direct codebase analysis of sync pipeline, sync_log schema, SyncStatus component, DashboardPage, and SimpleFIN response types)

---

## Critical Pitfalls

### Pitfall 1: "Success" Status Masking Per-Account Errors

**What goes wrong:**
The current `runSync()` (sync-service.ts lines 62-66) writes `status = 'success'` to sync_log whenever the SimpleFIN API call itself succeeds — even when individual accounts have errors. The SimpleFIN response can include per-account errors in the `errors`/`errlist` array (e.g., bank connection expired, institution down), and individual `syncAccount()` calls can throw. These errors are pushed to `result.errors[]` but the sync_log row is still marked `'success'`. The sync_log only gets `'error'` status when the entire `client.fetchAccounts()` call fails (line 76-83). This means the current system silently reports "success" for partial syncs — the exact problem v2.8 aims to fix.

**Why it happens:**
The status field was designed as a binary: the API call worked or it didn't. Per-account granularity was never modeled. The `result.errors` array is returned to the caller but never persisted.

**Consequences:**
If you add a `'partial'` status but only check the `result.errors` array length, you miss errors that were caught during `syncAccount()` processing. If you check both the SimpleFIN `errList` and the per-account catch blocks but forget that `result.errors` also includes rate-limit messages (line 48-49), you'll flag rate-limited accounts as "errors" when they're actually expected behavior.

**Prevention:**
Distinguish between three error sources in the sync pipeline:
1. SimpleFIN API-level errors (`data.errors`/`data.errlist`) — these are connection/institution problems
2. Per-account processing failures (the catch block on line 57-60) — these are app-level bugs
3. Rate-limit skips (line 47-49) — these are expected behavior, not errors

Only sources 1 and 2 should produce warnings. Source 3 is operational. The `'partial'` status should be set when `result.accountsSynced > 0` AND warnings exist from sources 1 or 2.

**Detection:**
- sync_log shows `status = 'success'` but `result.errors` is non-empty
- Dashboard shows green "Success" when a bank connection is actually broken

**Phase to address:**
First phase — sync service changes. This is the foundational logic that everything else depends on.

---

### Pitfall 2: sync_warnings Table Without Cleanup Creates Unbounded Growth

**What goes wrong:**
A `sync_warnings` table that stores per-account errors with history but has no retention policy will grow without bound. With twice-daily syncs and a persistently broken bank connection, that's ~60 warning rows per month per broken account. Over a year, that's 720+ rows for one account. The table is queried on every page load (SyncStatus auto-refetches every 30 seconds) and on every dashboard render.

**Why it happens:**
The natural instinct is to INSERT a new warning row on every sync, building a history. But unlike sync_log (which has one row per sync), sync_warnings would have N rows per sync (one per affected account), and the "current warnings" query must filter to the latest sync.

**Consequences:**
Without a retention policy or "latest only" design, the query to get current warnings becomes increasingly expensive, or you end up writing complex "get the most recent warning per account" queries with window functions.

**Prevention:**
Use an UPSERT pattern: `INSERT INTO sync_warnings (account_id, ...) ON CONFLICT(account_id) DO UPDATE SET ...`. The table has one row per account (not per sync). The row represents the *current* state. Add a `resolved_at` column that gets set when an account syncs successfully. This means the table stays bounded at the number of accounts (~5-10 rows), current-state queries are trivial (`WHERE resolved_at IS NULL`), and the sync_log table retains the historical record.

**Detection:**
- sync_warnings table has hundreds of rows
- Current-warnings query uses `GROUP BY` or `ROW_NUMBER()` instead of a simple `WHERE`

**Phase to address:**
First phase — schema migration. Get the table design right before building anything on top of it.

---

### Pitfall 3: Status State Machine With No Transition Rules

**What goes wrong:**
Adding `'partial'` to the status field creates a 4-state machine: `running -> success | partial | error`. Without explicit transition rules, edge cases create impossible states:
- A sync starts (`running`), the API returns accounts with some errors, but then the server crashes before the UPDATE. The row stays `running` forever.
- A subsequent sync starts while a previous one is still `running` (croner overlap or manual + scheduled collision). Two sync_log rows are `running` simultaneously.
- The SyncStatus component checks `status.lastSync.status === 'running'` to show "Syncing..." — if a stale `running` row exists from a crash, the UI permanently shows "Syncing..." even though nothing is running.

**Why it happens:**
The current code has no recovery for stale `running` entries. This isn't a problem today because: (1) syncs complete quickly, (2) crashes are rare, (3) the user can just trigger another sync. But once you surface sync status prominently (navbar indicator, dashboard badge), a stale `running` state becomes a visible bug.

**Consequences:**
Navbar shows a permanent "syncing" spinner. Dashboard status card is stuck on "Syncing...". User clicks "Sync Now" repeatedly, creating more stale rows.

**Prevention:**
Before inserting a new sync_log row, mark any existing `running` rows as `error` with a message like "Interrupted — previous sync did not complete." Add this as the first statement in `runSync()`. This is a one-line fix but must be done in the same phase that makes the status more visible.

**Detection:**
- Multiple `running` rows in sync_log
- SyncStatus component stuck on "Syncing..." when no sync is active

**Phase to address:**
First phase — sync service changes. Clean up stale `running` entries before they become user-visible problems.

---

### Pitfall 4: SimpleFIN Error Codes Are Not Stable — Don't Parse Them

**What goes wrong:**
The SimpleFIN `errors` array contains objects with `code` and `msg` fields (simplefin-types.ts line 6-10). It's tempting to parse the `code` field to determine error severity, map to specific UI messages, or auto-link to SimpleFIN reconnect. But SimpleFIN's error codes are not documented as a stable API — they come from upstream MX aggregator error codes which change without notice.

**Why it happens:**
Developer sees error codes like `"FI_NOT_AVAILABLE"` or `"AUTH_REQUIRED"` and builds switch statements against them. These work for a while, then break when MX changes their error taxonomy.

**Consequences:**
The UI shows "Unknown error" for new error codes, or worse, categorizes a serious auth failure as a minor temporary issue.

**Prevention:**
Store the raw `code` and `msg` verbatim. Display the `msg` to the user (it's human-readable). Use the presence of an error (not its code) to set the `'partial'` status. The only safe classification is: "has error" vs. "no error" — not "what kind of error." If you want to show a "Reconnect" link, show it for ALL per-account errors, not just specific codes. The SimpleFIN reconnect URL is `https://bridge.simplefin.org/reconnect` — always valid regardless of error type.

**Detection:**
- Switch statement or if-chain on SimpleFIN error codes in the codebase
- Different UI treatments for different error codes

**Phase to address:**
First phase — sync service and warning persistence. Store raw, don't interpret.

---

### Pitfall 5: Dashboard and Navbar Showing Stale Warning State After Successful Sync

**What goes wrong:**
The SyncStatus component auto-refetches every 30 seconds (SyncStatus.tsx line 24). The SyncButton invalidates the sync.status query on success (SyncButton.tsx lines 11-15). But if warnings are served from a separate endpoint or table, the SyncButton's invalidation list must also include the new warnings query key. If it doesn't, the sequence is: user clicks Sync Now -> sync succeeds (all accounts OK) -> sync.status shows "Success" -> but the navbar warning indicator still shows the old warnings from the previous sync until the next 30-second refetch.

**Why it happens:**
The SyncButton.tsx `onSuccess` handler explicitly lists which queries to invalidate (lines 11-15). Adding a new data source (sync warnings) without updating every invalidation site creates a stale-data window.

**Consequences:**
User sees contradictory states: "Last synced: just now, Success" in the dashboard alongside an amber warning indicator in the navbar. The 30-second refetch eventually fixes it, but the brief inconsistency erodes trust.

**Prevention:**
Return warnings as part of the existing `sync.status` query response rather than a separate endpoint. This way, any component that already invalidates `sync.status` automatically gets fresh warning data. The sync.status query already returns `lastSync` and `accounts` — adding a `warnings` field keeps the invalidation surface unchanged.

If warnings must be a separate endpoint, add the new query key to ALL invalidation sites: `SyncButton.tsx`, `DashboardPage.tsx` (line 34-37), and any future component that triggers sync.

**Detection:**
- Amber indicator visible for 0-30 seconds after a successful sync that resolved all warnings
- `queryClient.invalidateQueries` calls that don't include the warnings query key

**Phase to address:**
tRPC endpoint phase. Design the API response shape to include warnings in the existing sync.status response.

---

### Pitfall 6: Agent get_sync_status Tool Returns Wrong Column Names

**What goes wrong:**
The existing `get_sync_status` agent tool (query-tools.ts line 254-257) queries `sync_log` with column names that don't match the actual schema: it selects `transactions_updated` and `error` — but the schema has `transactions_added` and `error_message`. This is a pre-existing bug (documented in PROJECT.md tech debt). When you add a `'partial'` status and warnings to the sync system, the agent tool will also need updating — and if you copy from the existing (buggy) query, you'll propagate the same column name errors.

**Why it happens:**
The agent tool was written independently from the tRPC router and uses a raw SQL query rather than calling the service function. The column names were typed from memory.

**Consequences:**
Agent reports NULL for sync errors and transaction counts. Adding warnings data to a query that's already broken means the agent can't tell users about sync problems — defeating part of the purpose of v2.8.

**Prevention:**
Fix the existing column name bug in the same phase that adds warnings. Consider having the agent tool call the same function that backs the tRPC `sync.status` endpoint, rather than running its own raw SQL. This follows the existing pattern where most agent tools wrap service functions.

**Detection:**
- Agent responds with "0 transactions added" when the sync log shows non-zero
- Agent says "no errors" when sync_log.error_message has content

**Phase to address:**
Agent tool update phase. Fix the existing bug alongside the new warnings integration.

---

## Moderate Pitfalls

### Pitfall 7: Migration Adding sync_warnings Table While Production Is Running

**What goes wrong:**
The app runs in production on the same iMac where development happens. The migration runner executes on server startup. If you add migration 007 with a new `sync_warnings` table and new columns, the next `npm run dev` will apply the migration to the shared production database. If the migration has a bug (wrong column type, missing DEFAULT, bad FOREIGN KEY), the production database is corrupted and the production process (still running the old code) may crash on its next sync.

**Why it happens:**
Dev and production share the same SQLite database at `~/minerva-money/data/minerva.db`. Migrations are forward-only. There's no down-migration or rollback mechanism.

**Prevention:**
(1) Back up the database before running dev with a new migration: `cp ~/minerva-money/data/minerva.db ~/minerva-money/data/minerva-pre-007.db`. (2) Test the migration on a copy first. (3) Keep migrations additive — `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN` are safe. Never rename or drop columns in a migration. (4) Stop production before starting dev when a migration is pending.

**Detection:**
- Production process crashes with "no such column" or "no such table" after running dev
- Migration runner logs an error on startup

**Phase to address:**
Schema migration phase. Document the backup step in the phase verification.

---

### Pitfall 8: Mapping SimpleFIN Errors to Account IDs When account_id Is Optional

**What goes wrong:**
The SimpleFIN error object has `account_id` as optional (simplefin-types.ts line 9). Some errors are connection-level (e.g., "bank website down") and have a `conn_id` but no `account_id`. The current code (sync-service.ts lines 38-42) concatenates these into a generic error string. When you try to persist per-account warnings, connection-level errors without `account_id` don't map to any specific account.

**Why it happens:**
SimpleFIN's error model distinguishes between connection errors (affecting all accounts at an institution) and account-specific errors. The current code doesn't need to distinguish because it dumps everything into `result.errors[]` as strings.

**Consequences:**
If you only persist warnings with an `account_id`, connection-level errors are silently dropped. If you require `account_id` as NOT NULL in the sync_warnings table, connection-level errors can't be stored.

**Prevention:**
When an error has `conn_id` but no `account_id`, look up all accounts with matching `conn_id` (stored as part of the SimpleFIN account data, available in the response's `accounts` array) and create a warning for each. This maps "Discover is down" to warnings on both the Discover Checking and Discover HELOC accounts. If no matching accounts are found, store the warning with `account_id = NULL` and handle it as a "general sync warning" in the UI.

**Detection:**
- Bank connection goes down but no warnings appear because the errors have no `account_id`
- Warnings table has constraint violations when inserting connection-level errors

**Phase to address:**
First phase — sync service changes. Handle both error shapes when persisting warnings.

---

### Pitfall 9: "Partial" Badge Color Collision With Existing UI Semantics

**What goes wrong:**
The design calls for an amber "Partial" badge on the dashboard. The existing DashboardPage uses exactly two status colors: `text-green-600` for success and `text-red-600` for error (line 214-216). The SyncStatus component (navbar) uses `text-blue-300` for running, `text-red-400` for error, and `text-gray-400` for success. Adding amber (yellow/orange) introduces a third semantic color. If the amber shade chosen is too close to the existing yellow used elsewhere (e.g., "Local only" backup warning at line 258-259 uses `text-yellow-600`), the two amber/yellow indicators blur together visually.

**Why it happens:**
No design system or color palette documentation exists — Tailwind classes are applied inline. Each component picks its own colors.

**Consequences:**
User sees two yellow-ish indicators and conflates "sync partial" with "backup local only." Or worse, the amber badge is too subtle against the white card background and gets missed entirely.

**Prevention:**
Use `text-amber-600` and `bg-amber-50` for sync warnings consistently. Reserve `text-yellow-600` for backup warnings. Document the color semantics in a comment at the top of the SyncStatus component. Use the same amber shades in both the dashboard badge and the navbar indicator for consistency.

**Detection:**
- Two different yellow/amber shades on the same dashboard page
- User reports not noticing the warning indicator

**Phase to address:**
UI phase — dashboard and navbar updates.

---

## Minor Pitfalls

### Pitfall 10: 30-Second Polling Creates Unnecessary Load During Active Use

**What goes wrong:**
SyncStatus refetches every 30 seconds regardless of whether a sync is in progress. With the addition of warnings (which change only on sync), this polling queries the sync_warnings table 120 times per hour even when no sync has occurred.

**Prevention:**
This is acceptable at the current scale (single user, SQLite on local disk, query is trivial). Don't optimize this unless it causes measurable issues. The alternative (WebSocket push) adds significant complexity for zero user-visible benefit.

---

### Pitfall 11: Navbar Warning Tooltip Overflowing on Mobile

**What goes wrong:**
The design calls for a navbar amber warning indicator with a tooltip showing affected account count. The navbar is hidden on mobile (Layout.tsx line 9: `hidden md:block`). If the tooltip is implemented as a CSS hover tooltip, it won't work on mobile at all. The BottomTabBar component handles mobile navigation separately and has no sync status display.

**Prevention:**
Don't add a warning indicator to the BottomTabBar. The dashboard sync status card is already visible on mobile. The navbar indicator is desktop-only, matching the existing pattern where SyncStatus and SyncButton are navbar children.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Schema migration (sync_warnings table) | Unbounded table growth; missing cleanup of stale running rows; migration applied to production DB | UPSERT pattern (one row per account); clean stale running rows in runSync(); backup DB before migration |
| Sync service changes (partial status, warning persistence) | Conflating rate-limit skips with real errors; losing connection-level errors without account_id; not fixing stale running entries | Separate error sources; map conn_id errors to accounts; mark stale running rows as error |
| tRPC endpoint (sync.status response shape) | Warnings on separate endpoint causing stale-state window; breaking existing SyncStatus contract | Return warnings inside existing sync.status response; maintain backward-compatible response shape |
| Dashboard UI (amber badge, error list) | Color collision with backup status yellow; badge invisible on white background | Use amber-600/amber-50 consistently; test visual distinction from yellow-600 |
| Navbar UI (warning indicator) | Tooltip not working on mobile; stale indicator after successful sync | Desktop-only indicator; rely on sync.status invalidation for freshness |
| Agent tool update | Propagating existing column name bugs; raw SQL diverging from tRPC endpoint | Fix column names; consider wrapping the same service function used by tRPC |

---

## "Looks Done But Isn't" Checklist

- [ ] **Partial status set correctly:** Verify that `status = 'partial'` is written to sync_log when some accounts succeed and others have errors — not just when the SimpleFIN errors array is non-empty (rate-limit skips should not trigger partial)
- [ ] **Stale running cleanup:** Verify that starting a new sync marks any existing `running` rows as `error`
- [ ] **Connection-level errors mapped:** Verify that a SimpleFIN error with `conn_id` but no `account_id` produces warnings for all accounts belonging to that connection
- [ ] **Warning resolved on success:** Verify that a successful sync for an account clears (resolves) its existing warning — not just inserts a new "success" row
- [ ] **All invalidation sites updated:** Verify that SyncButton.tsx, DashboardPage.tsx sync mutation, and any other `onSuccess` handlers invalidate the query key that serves warnings
- [ ] **Agent tool column names fixed:** Verify that the `get_sync_status` tool uses `transactions_added` and `error_message` (not `transactions_updated` and `error`)
- [ ] **Agent tool returns warnings:** Verify that the `get_sync_status` tool includes current warnings in its response
- [ ] **SimpleFIN reconnect link correct:** Verify the reconnect URL is valid and opens the SimpleFIN bridge reconnect flow
- [ ] **Manual accounts excluded from warnings:** Verify that `source = 'manual'` accounts never appear in sync warnings (they don't sync via SimpleFIN)
- [ ] **Amber color distinct from yellow:** Verify visually that the "Partial" badge is distinguishable from the "Local only" backup indicator on the same dashboard page

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| sync_log stuck on 'running' forever | LOW | One-line SQL: `UPDATE sync_log SET status = 'error', completed_at = datetime('now'), error_message = 'Interrupted' WHERE status = 'running'` |
| sync_warnings table has thousands of rows | LOW | Truncate table, switch to UPSERT pattern, re-sync to populate current state |
| Agent tool returning NULLs due to wrong column names | LOW | Fix the SQL query column names; no data loss |
| Migration applied to production with bug | MEDIUM | Restore from iCloud backup (snapshots every 6 hours); fix migration; re-apply |
| Amber badge not visible to user | LOW | Change Tailwind color classes; no data changes needed |
| Stale warnings shown after successful sync | LOW | Add missing query invalidation to onSuccess handler; redeploy |

---

## Sources

- Direct codebase analysis: `packages/server/src/sync/sync-service.ts` — runSync() status logic (lines 62-66 success, 76-83 error), error collection (lines 38-49), per-account processing (lines 44-61)
- Direct codebase analysis: `packages/server/src/sync/simplefin-types.ts` — SimpleFINError shape (lines 6-10), optional account_id and conn_id fields
- Direct codebase analysis: `packages/server/src/sync/trpc-router.ts` — sync.status query (lines 80-119), sync.trigger rate-limit check (lines 62-74)
- Direct codebase analysis: `packages/client/src/components/SyncStatus.tsx` — 30-second polling (line 24), status rendering logic (lines 28-49)
- Direct codebase analysis: `packages/client/src/components/SyncButton.tsx` — query invalidation on sync success (lines 11-15)
- Direct codebase analysis: `packages/client/src/pages/DashboardPage.tsx` — sync status card color scheme (lines 214-216), backup yellow indicator (line 258-259), sync mutation invalidation (lines 33-37)
- Direct codebase analysis: `packages/client/src/components/Layout.tsx` — navbar hidden on mobile (line 9), SyncStatus and SyncButton placement (lines 98-99)
- Direct codebase analysis: `packages/server/src/agent/tools/query-tools.ts` — get_sync_status wrong column names (line 257)
- Direct codebase analysis: `packages/server/migrations/001-initial-schema.sql` — sync_log schema (lines 97-105), no sync_warnings table
- Direct codebase analysis: `packages/server/src/sync/fixtures/simplefin-response.json` — fixture has empty errlist, three connections with conn_id values
- Project context: `.planning/PROJECT.md` — tech debt noting agent column name mismatches (line 112), v2.8 target features (lines 67-76)

---
*Pitfalls research for: Sync error visibility — per-account warnings, partial sync status, dashboard/navbar indicators (v2.8)*
*Researched: 2026-03-26*
