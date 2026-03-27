# Project Research Summary

**Project:** Minerva Money v2.8 — Sync Error Visibility
**Domain:** Personal budgeting app — sync status observability
**Researched:** 2026-03-26
**Confidence:** HIGH

## Executive Summary

Minerva Money v2.8 addresses a silent failure mode in the SimpleFIN sync pipeline: per-account errors are already parsed from the API response but are never persisted or surfaced to the user. The app currently reports "success" in sync_log even when individual bank connections fail, leaving the user with stale data and no indicator that anything went wrong. The fix is a bottom-up, strictly additive change: a new `sync_warnings` table, a third `'partial'` status value in sync_log, an extended tRPC `sync.status` response, and amber warning indicators in two existing UI surfaces (navbar and dashboard card).

The recommended approach requires zero new dependencies. Every capability needed — SQLite persistence, tRPC response extension, Tailwind styling, lucide-react icons — is already in the stack. The six affected files span three layers (database, service/API, client) but all changes are additive: new rows, new fields, new conditional branches. The existing TanStack Query cache invalidation wiring already covers the new data because warnings are returned inside the existing `sync.status` response rather than a new endpoint.

The primary risks are schema design choices made in the first phase that cannot be safely changed without a new migration. Two decisions must be made correctly at migration time: the table design should use an UPSERT pattern (one row per account, not append-only per sync run) to prevent unbounded table growth, and the sync service must mark stale `'running'` entries as `'error'` before starting a new sync to prevent the navbar from getting stuck in a permanent "Syncing..." state. Both are one-line fixes that are cheap now and costly to retrofit. There is also a pre-existing agent tool bug (wrong column names in `get_sync_status`) that must be fixed in the same pass to avoid propagating broken queries into the new warning data.

## Key Findings

### Recommended Stack

No new dependencies are required for this milestone. The entire implementation uses existing stack components: better-sqlite3 for the new migration and warning queries, tRPC + Zod for the additive response extension, TanStack Query for automatic client-side refresh, Tailwind `group-hover` for the CSS-only navbar tooltip, and lucide-react's `AlertTriangle` icon (already used in 4 client files). The project convention of zero component libraries should be maintained — Radix UI, Headless UI, and toast libraries are all explicitly out of scope for this milestone.

Full details: `.planning/research/STACK.md`

**Core technologies:**
- **better-sqlite3** (migration 007): New `sync_warnings` table with FK to `sync_log` and CASCADE cleanup — follows conventions of migrations 001-006
- **tRPC + Zod**: Additive `warnings[]` field on existing `sync.status` response — no codegen, types inferred automatically
- **TanStack Query**: Consumes new `warnings` field with zero new wiring — existing `sync.status` invalidation already covers it
- **Tailwind CSS**: Amber-600/amber-50 for warnings; `group-hover` for CSS-only navbar tooltip — no JS state needed
- **lucide-react**: `AlertTriangle` icon for navbar indicator — already a dependency, already used in 4 files

### Expected Features

The feature set forms a strict dependency chain. All table-stakes features are low complexity because the data source (SimpleFIN error parsing in sync-service.ts lines 38-42) and the UI surfaces (SyncStatus, DashboardPage sync card) already exist. This is a plumbing milestone: connect data that's already parsed to surfaces that already exist.

Full details: `.planning/research/FEATURES.md`

**Must have (table stakes):**
- `sync_warnings` table migration — without persistence, errors vanish on page refresh
- `'partial'` status in sync_log — the core problem: binary success/error does not capture partial failure
- Auto-clear warnings for accounts that successfully sync — stale warnings are worse than no warnings; must ship with warning writes, not as a follow-up
- `warnings[]` in tRPC `sync.status` response — client needs structured data, not strings; additive field, backward-compatible
- Dashboard amber "Partial" badge and per-account error list — primary UI surface with SimpleFIN reconnect link
- Navbar amber warning indicator — ensures visibility from any page without navigating to dashboard

**Should have (differentiators):**
- Navbar tooltip with affected account names on hover — trivial to add alongside the indicator, high convenience
- `occurrence_count` column in migration — free to include in the initial migration, useful context later, hard to retrofit
- Agent `get_sync_status` tool updated with warnings + fix existing column name bug — consistent with existing agent coverage and resolves documented tech debt

**Defer:**
- Account-level staleness indicators — data already exists in `accounts.last_synced`, purely a polish pass; zero backend work
- Historical sync error views — no actionable user value; the fix is always "re-auth or wait"
- Push/email notifications — explicitly out of scope per PROJECT.md; in-app indicator is sufficient for a single-user home server

### Architecture Approach

The architecture is a strict bottom-up dependency chain with no parallelism between the first three layers: the database table must exist before the service writes to it, the service must write warnings before the tRPC endpoint can expose them, and the endpoint shape must be finalized before client components can consume it. Within the client layer, the three UI changes (SyncStatus navbar, DashboardPage, agent tool) are independent and can be done in any order. The single most important architectural decision is to extend the existing `sync.status` response rather than create a new endpoint — this ensures all existing cache invalidation sites in SyncButton and DashboardPage automatically cover warning freshness without any additional wiring.

Full details: `.planning/research/ARCHITECTURE.md`

**Major components:**
1. `migrations/007-sync-warnings.sql` (NEW) — new table with FK to sync_log, index on sync_log_id; UPSERT-compatible design (one row per account)
2. `sync-service.ts` `runSync()` (MODIFY) — persist warnings per account, determine partial/success/error status, clean stale running entries before each sync
3. `trpc-router.ts` `syncRouter.status` (MODIFY) — JOIN to sync_warnings for latest sync, extend response with `warnings[]`; additive, non-breaking
4. `SyncStatus.tsx` (MODIFY) — amber `'partial'` branch with account count and group-hover tooltip; desktop-only per existing navbar pattern
5. `DashboardPage.tsx` (MODIFY) — amber badge, account error list, SimpleFIN reconnect link; new conditional section below existing status details
6. `query-tools.ts` `get_sync_status` (MODIFY) — fix existing column name bugs (`transactions_updated` -> `transactions_added`, `error` -> `error_message`), add active warnings to agent response

### Critical Pitfalls

Full details: `.planning/research/PITFALLS.md`

1. **Success status masking per-account errors** — Distinguish three error sources: SimpleFIN API errors (source 1, persist as warnings), per-account processing failures (source 2, persist as warnings), and rate-limit skips (source 3, operational behavior — NOT warnings). Only sources 1 and 2 trigger `'partial'` status.

2. **Unbounded sync_warnings table growth** — Use an UPSERT pattern with `UNIQUE(account_id)` and a `resolved_at` column instead of append-only rows. "Active" warnings are those with `resolved_at IS NULL`. Without this, twice-daily syncs with a broken connection produce 720+ rows per year per affected account.

3. **Stale 'running' entries breaking the UI permanently** — Add one cleanup statement at the start of `runSync()` to mark any existing `running` rows as `error`. Server crashes leave `running` rows that cause the navbar to show "Syncing..." indefinitely.

4. **Connection-level SimpleFIN errors without account_id** — SimpleFIN errors have optional `account_id`. Connection-level errors have `conn_id` but no `account_id`. These must be mapped to all accounts belonging to that connection via the accounts array in the SimpleFIN response, or silently dropped if no matching accounts are found (store with `account_id = NULL`).

5. **Agent tool propagating existing column name bugs** — `query-tools.ts` already queries wrong column names. Fix the pre-existing bug in the same phase as the warning additions — copying from the broken query into new warning code doubles the damage.

## Implications for Roadmap

Based on research, the dependency chain is strictly bottom-up with three sequential phases and one parallel execution window in the final phase.

### Phase 1: Database Foundation

**Rationale:** Everything depends on the table existing. Schema design choices here are the only irreversible decisions in this milestone — getting the UPSERT design right now prevents an unbounded growth problem that would require a new migration to fix.
**Delivers:** `sync_warnings` table with UPSERT-compatible schema (`UNIQUE(account_id)`, `resolved_at` column, `occurrence_count`), index on sync_log_id
**Addresses:** Table stakes item 1 (persistence); differentiator item 2 (occurrence_count free to add now)
**Avoids:** Pitfall 2 (unbounded growth — UPSERT design), Pitfall 8 (nullable account_id allows connection-level errors), Pitfall 7 (migration applied to shared production DB — back up before running dev with new migration)

### Phase 2: Sync Service Changes

**Rationale:** Must come after migration (table must exist). Determines data quality for all downstream consumers. All UI work depends on this logic being correct. Stale running entry cleanup must land here because it becomes user-visible once the navbar prominently shows sync status.
**Delivers:** Per-account warnings written to DB, `'partial'` status in sync_log, auto-clear warnings for accounts that succeed, stale `running` entry cleanup, rate-limit skips correctly excluded from warnings
**Addresses:** Table stakes items 2-3 (partial status, auto-clear on success)
**Avoids:** Pitfall 1 (success masking — correct partial status logic with three error sources), Pitfall 3 (stale running entries — mark as error before starting new sync), Pitfall 8 (conn_id without account_id — map to accounts array)

### Phase 3: tRPC Response Extension

**Rationale:** Must come after service changes (data must be populated to test). Finalizing the response shape unblocks all three client-layer changes simultaneously.
**Delivers:** `warnings[]` field in `sync.status` response; additive extension that does not break existing consumers; empty array when no warnings keeps existing UI paths unchanged
**Addresses:** Table stakes item 4 (structured warnings to client)
**Avoids:** Pitfall 5 (stale warning state — warnings inside existing endpoint, not a new one; all existing invalidation sites cover it automatically with zero new wiring)

### Phase 4: Client Layer (Three Independent Sub-Tasks)

**Rationale:** All three changes depend only on Phase 3's response shape and are independent of each other. Can be implemented in any order; landing them together avoids half-visible UI states in production.
**Delivers:** Complete user-visible sync error visibility across all app surfaces

**Phase 4a — Dashboard UI:**
- Amber "Partial" badge, per-account error list, SimpleFIN reconnect link
- Avoids Pitfall 9 (use amber-600/amber-50, distinct from existing yellow-600 backup indicator)

**Phase 4b — Navbar indicator:**
- Amber `SyncStatus` branch with account count; group-hover CSS-only tooltip with account names
- Avoids Pitfall 11 (desktop-only indicator; no changes to BottomTabBar)

**Phase 4c — Agent tool:**
- Fix pre-existing column name bugs (`transactions_updated` -> `transactions_added`, `error` -> `error_message`)
- Add active warnings to `get_sync_status` response
- Avoids Pitfall 6 (propagating wrong column names into new warning queries)

### Phase Ordering Rationale

- Phases 1-3 are strictly sequential: table must exist before service writes, service must write before router exposes, router shape must be finalized before client consumes
- Phase 4 is a parallel execution window — all three client changes are independent once the response shape is locked
- The UPSERT schema design (Phase 1) and stale-running-entry cleanup (Phase 2) are one-line additions that are free now and require a new migration to retrofit later
- Returning warnings inside `sync.status` (not a new endpoint) is the single most consequential architectural decision — it eliminates the need to audit and update invalidation sites in SyncButton, DashboardPage, and any future sync trigger

### Research Flags

No phases require a `/gsd:research-phase` call. All research is complete and implementation-ready.

Phases with well-documented patterns:
- **Phase 1 (Migration):** Follows exact conventions of migrations 001-006; schema fully specified with rationale
- **Phase 2 (Sync service):** Code touch points identified with exact line numbers; SimpleFIN error types confirmed against simplefin-types.ts
- **Phase 3 (tRPC):** Additive extension; response shape fully specified in ARCHITECTURE.md
- **Phase 4 (Client UI):** All Tailwind patterns verified against existing codebase; no new libraries; exact code snippets provided in STACK.md and ARCHITECTURE.md

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All findings from direct codebase inspection; zero new dependencies means no third-party uncertainty |
| Features | HIGH | SimpleFIN protocol spec consulted; error object shape confirmed against simplefin-types.ts; scope tightly bounded by PROJECT.md |
| Architecture | HIGH | All touch points identified with exact file paths and line numbers from codebase inspection |
| Pitfalls | HIGH | Based on direct analysis of existing code paths (sync-service.ts status logic, query-tools.ts column names, SyncStatus.tsx polling) — not speculation |

**Overall confidence:** HIGH

### Gaps to Address

- **Schema design conflict (UPSERT vs append-only):** PITFALLS.md recommends UPSERT with `resolved_at` (one row per account, bounded table); STACK.md and ARCHITECTURE.md describe an append-only model where "active warnings = latest sync's rows." These are in conflict. The UPSERT approach from PITFALLS.md prevents unbounded growth and produces simpler queries — it should be adopted. Confirm this resolution before Phase 1 begins.
- **SimpleFIN reconnect URL:** Three research files cite slightly different URLs (`https://bridge.simplefin.org/`, `https://bridge.simplefin.org/reconnect`, `https://beta-bridge.simplefin.org/`). Verify the correct URL against production SimpleFIN before shipping the reconnect link. Low risk — a wrong URL is a one-line fix with no data implications.

## Sources

### Primary (HIGH confidence)

- Codebase: `packages/server/src/sync/sync-service.ts` — runSync() status logic (lines 62-66, 76-83), error handling (lines 38-49), per-account processing (lines 44-61)
- Codebase: `packages/server/src/sync/simplefin-types.ts` — SimpleFINError shape with optional account_id and conn_id fields
- Codebase: `packages/server/src/sync/trpc-router.ts` — current sync.status response shape (lines 80-119)
- Codebase: `packages/server/migrations/001-006` — migration naming conventions, schema patterns, datetime defaults
- Codebase: `packages/server/src/db/migrate.ts` — migration runner (user_version, sorted files, transactional apply)
- Codebase: `packages/client/src/components/SyncStatus.tsx` — 30-second polling (line 24), current status rendering (lines 28-49)
- Codebase: `packages/client/src/components/SyncButton.tsx` — query invalidation on sync success (lines 11-15)
- Codebase: `packages/client/src/pages/DashboardPage.tsx` — sync status card (lines 182-267), amber/yellow color usage (line 258-259), sync mutation invalidation (lines 33-37)
- Codebase: `packages/server/src/agent/tools/query-tools.ts` — get_sync_status existing column name bug (line 257)
- Codebase: `packages/client/src/components/Layout.tsx` — navbar hidden on mobile (line 9), SyncStatus placement (lines 98-99)

### Secondary (MEDIUM confidence)

- [SimpleFIN Protocol specification](https://www.simplefin.org/protocol.html) — error codes (gen.*, con.*, act.*), AccountSet response structure, error object fields
- [Actual Budget PR #4007](https://github.com/actualbudget/actual/pull/4007) — handling removed/failed SimpleFIN accounts gracefully (real-world pattern corroboration)
- [Actual Budget issue #5346](https://github.com/actualbudget/actual/issues/5346) — real-world SimpleFIN sync error patterns

### Tertiary (LOW confidence)

- SimpleFIN reconnect URL — cited as `https://bridge.simplefin.org/` (STACK.md), `https://bridge.simplefin.org/reconnect` (PITFALLS.md), `https://beta-bridge.simplefin.org/` (FEATURES.md); requires verification before shipping

---
*Research completed: 2026-03-26*
*Ready for roadmap: yes*
