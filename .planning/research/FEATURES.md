# Feature Landscape

**Domain:** Sync error visibility for personal budgeting app
**Researched:** 2026-03-26

## Context

This is a subsequent milestone research file for v2.8. The features below describe ONLY what is new:
per-account sync error visibility, partial sync status, and UI warning indicators. Existing features
(SimpleFIN sync with success/error logging, SyncStatus navbar component, Dashboard sync card,
SyncButton for manual sync) are fully shipped and working but per-account errors are currently silent.

**The core problem:** SimpleFIN returns per-account errors in its `errors` array (with `account_id`,
`code`, and `msg` fields). The current `sync-service.ts` already parses these (lines 38-42) and
pushes them into `result.errors[]`, but the sync is still marked as `'success'` in `sync_log` as
long as the API call itself succeeded. The UI shows green "success" even when individual accounts
failed to sync. The user has no visibility into which accounts have stale data.

---

## Table Stakes

Features the user expects once sync error visibility is promised. Missing any of these makes the milestone feel incomplete.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| `sync_warnings` table to persist per-account errors | Without persistence, errors vanish on page refresh. User must catch them in real-time or they disappear. The current `sync_log.error_message` is a single string for total failures only. | Low | New migration | Store `account_id`, `error_code`, `message`, `first_seen`, `last_seen`, `occurrence_count`. SimpleFIN errors include `account_id`, `code`, and `msg` fields per the [protocol spec](https://www.simplefin.org/protocol.html). |
| `'partial'` sync status | Current system marks sync as `'success'` even when individual accounts fail -- this is the core problem. A sync where 2/3 accounts succeed is neither "success" nor "error". | Low | sync_warnings table | Update `sync_log.status` to `'partial'` when `result.errors.length > 0 && result.accountsSynced > 0`. Existing `'success'` and `'error'` remain for clean/total-failure cases. |
| Auto-clear warnings on successful account sync | Stale warnings are worse than no warnings. If Fidelity failed yesterday but synced fine today, the warning must disappear automatically. | Low | sync_warnings table | On each sync, delete warnings for accounts that synced successfully. Without this, warnings accumulate forever and the user stops trusting them. Ship this WITH the warning writes, not as a follow-up. |
| tRPC `sync.status` returns structured warnings | Client needs per-account error data to render indicators. Current endpoint returns only `errorMessage` (a single string for total failures). | Low | sync_warnings table | Add `warnings: { accountId, accountName, errorCode, message, lastSeen }[]` to the status response. Query joins sync_warnings with accounts for display names. |
| Dashboard amber "Partial" badge | The dashboard sync card currently shows green "success" or red "error" -- needs a third state. Amber is the universal "warning/degraded" color. | Low | tRPC warnings data | Add amber styling branch to the existing status conditional. Currently `syncStatus.lastSync.status === 'success' ? 'text-green-600' : 'text-red-600'` -- add `'partial'` branch with `'text-amber-600'`. |
| Account error list on dashboard | User needs to know WHICH accounts failed, not just that something went wrong. The badge catches attention; the list provides actionable info. | Low | tRPC warnings data | Render each warning with account name, error description, and when it was last seen. At current scale (3 institutions, ~6 accounts), a simple flat list is sufficient. |
| Navbar amber warning indicator | User is not always on the dashboard. SyncStatus component in navbar must signal partial sync on every page. | Low | tRPC warnings data | Existing `SyncStatus` component already handles `'running'`, `'error'`, and `'success'` with separate returns. Add `'partial'` branch with amber text and affected account count. |
| SimpleFIN reconnect link | When a connection fails (`con.auth`), the fix is to re-auth on SimpleFIN's site. Without a link, user has to remember the URL. | Low | Warning error codes | Conditionally render `https://beta-bridge.simplefin.org/` link when error code starts with `con.`. This is the only actionable step for connection errors. |

## Differentiators

Features that go beyond minimum viable sync error visibility. Not expected, but improve the experience.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Warning tooltip on navbar indicator | Hover over amber indicator to see affected account names without navigating to dashboard. Avoids forcing navigation just to check what failed. | Low | tRPC warnings data | Lightweight HTML `title` attribute with account names. Minimal code, high convenience. |
| Agent awareness of sync warnings | "Are any of my accounts having sync issues?" via chat agent. Consistent with existing agent coverage of sync status. | Low | Query tool addition | Add `get_sync_warnings` tool to `query-tools.ts`. Small lift since it just queries the new table. The existing `get_sync_status` tool already exists -- extend it or add a companion. |
| Account-level staleness indicator | Show "Discover: synced 2 hours ago" vs "Fidelity: last synced 3 days ago" per account on dashboard accounts card. | Low | Existing `accounts.last_synced` column | Already have the data. Just needs visual treatment showing stale accounts (e.g., amber text when > 24h since last sync). Zero backend work. |
| Occurrence count tracking | Show "Fidelity has failed 3 of the last 5 syncs" vs "failed once". Helps distinguish transient glitches from persistent connection problems. | Low | `occurrence_count` column in sync_warnings | Include the column in the initial migration. Increment on each failure, display on dashboard. Low cost to add now, harder to retrofit later. |

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Push notifications / email alerts for sync failures | Explicitly out of scope per PROJECT.md: "External alerts (push/email) for sync failures -- in-app indicator sufficient". Single-user home server; user checks the app regularly. | Amber navbar indicator is the notification mechanism |
| Automatic SimpleFIN re-authentication | SimpleFIN auth requires browser-based OAuth flow at their bridge site. Cannot be automated from server-side code. | Provide a clickable link to SimpleFIN bridge site |
| Per-account manual retry | SimpleFIN API returns all accounts in one response (`/accounts`). Cannot selectively re-sync one account -- it is all-or-nothing per the protocol. | "Sync Now" button already triggers full sync. A failed account retries on next sync automatically. |
| Error code categorization UI | Three institutions, ~6 accounts. At most 2-3 warnings at once. Filtering/sorting warnings by type is overengineering for this scale. | Simple flat list of warnings is sufficient |
| Historical sync error dashboard | Adds complexity with no clear user action. Knowing sync failed 12 times last month does not help fix it -- the fix is always "re-auth on SimpleFIN" or "wait for transient issue to resolve". | Keep `occurrence_count` for inline context; skip dedicated history views |
| Granular error severity levels | SimpleFIN has only 7 error codes total (3 prefixes: `gen.*`, `con.*`, `act.*`). The distinction is simple: connection errors need re-auth, account errors are transient. | Color everything amber (warning). Red stays reserved for total sync failure. |
| Toast/snackbar notifications on sync completion | Sync happens at 6 AM/6 PM automatically. Toasts are transient and would be missed. Persistent indicator is better for async events. | Persistent navbar indicator + dashboard card |

---

## Feature Dependencies

```
sync_warnings table (migration)
  |
  +---> sync-service writes warnings per account on each sync
  |       |
  |       +---> auto-clear warnings for accounts that succeed
  |       |
  |       +---> set sync_log.status = 'partial' when errors + successes coexist
  |
  +---> tRPC sync.status returns warnings array
          |
          +---> Dashboard "Partial" badge + account error list
          |       |
          |       +---> SimpleFIN reconnect link (conditional on error code prefix)
          |
          +---> Navbar amber warning indicator
          |       |
          |       +---> Warning tooltip (account names on hover)
          |
          +---> Agent get_sync_warnings tool (optional, low lift)
```

**Ordering rationale:** Strict bottom-up dependency chain. Database table first, service logic writes to it, tRPC exposes it, UI consumes it. No parallelism possible between layers; each layer depends on the one below.

---

## MVP Recommendation

**Build all table stakes (they form one coherent feature):**

1. `sync_warnings` table migration -- Foundation everything depends on
2. sync-service: write warnings, auto-clear on success, set `'partial'` status -- Populates the table
3. tRPC `sync.status` with warnings array -- Exposes data to client
4. Dashboard partial badge + account error list + reconnect link -- Primary UI surface
5. Navbar amber indicator -- Secondary UI surface, ensures visibility from any page

**Include these low-effort differentiators:**

6. Navbar tooltip with account names -- Trivial to add alongside the indicator
7. `occurrence_count` column in migration -- Free to add now, useful later
8. Agent sync warnings in `get_sync_status` tool response -- Consistent with existing agent coverage

**Defer:**

- Account-level staleness indicator: Already have `last_synced` data. Follow-up polish pass, zero backend work.
- Historical sync error views: No user action; defer indefinitely.

---

## Complexity Assessment

This milestone is straightforward. Every table-stakes feature is Low complexity because:

- The data source already exists (SimpleFIN error responses are parsed in `sync-service.ts` lines 38-42)
- The UI surfaces already exist (SyncStatus component, Dashboard sync card with status conditionals)
- The tRPC endpoint already exists (`sync.status` already returns lastSync and accounts)
- The changes are purely additive (new table, new response fields, new UI conditional branches)

**Estimated total scope:** 1 migration + ~60 lines service logic + ~20 lines tRPC changes + ~100 lines UI changes across 2 components. This is a small, well-bounded milestone.

---

## SimpleFIN Error Code Reference

Per the [SimpleFIN Protocol specification](https://www.simplefin.org/protocol.html):

| Code | Scope | Description | User Action |
|------|-------|-------------|-------------|
| `gen.` | General | General error (fallback) | Wait and retry |
| `gen.api` | General | API usage error (developer-facing) | N/A (should not surface to user) |
| `gen.auth` | General | SimpleFIN server auth failure | Re-auth on SimpleFIN bridge |
| `con.` | Connection | General connection-level error | Re-auth on SimpleFIN bridge |
| `con.auth` | Connection | Authentication issue for a connection | Re-auth on SimpleFIN bridge |
| `act.` | Account | General account-level error | Wait and retry |
| `act.failed` | Account | Failed to get account info | Wait and retry |
| `act.missingdata` | Account | Incomplete transaction listing | Wait and retry |

**Key insight for UI:** `con.*` errors are actionable (user must re-auth). `act.*` errors are transient (retry fixes them). The reconnect link should only appear for `con.*` and `gen.auth` errors.

---

## Sources

- [SimpleFIN Protocol specification](https://www.simplefin.org/protocol.html) -- Error codes, AccountSet response structure, error object fields (HIGH confidence)
- [Actual Budget SimpleFIN sync issues](https://github.com/actualbudget/actual/issues/5346) -- Real-world sync error patterns from another budgeting app using SimpleFIN (MEDIUM confidence)
- [Actual Budget PR #4007: Fix sync errors when SimpleFIN account removed](https://github.com/actualbudget/actual/pull/4007) -- Handling removed/failed SimpleFIN accounts gracefully (MEDIUM confidence)
- Existing codebase: `sync-service.ts` (error parsing at lines 38-42), `SyncStatus.tsx` (status rendering), `DashboardPage.tsx` (sync card), `trpc-router.ts` (sync.status endpoint), `simplefin-types.ts` (SimpleFINError interface) -- all HIGH confidence

---
*Feature research for: Minerva Money v2.8 Sync Error Visibility*
*Researched: 2026-03-26*
