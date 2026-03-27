# Phase 49: tRPC Response Extension - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Client can consume structured per-account warnings from the existing sync.status endpoint. This phase extends the `sync.status` tRPC query to include a `warnings` array queried from the `sync_warnings` table (created in Phase 47, populated in Phase 48). No new endpoints, no UI changes -- purely extending the existing response shape.

</domain>

<decisions>
## Implementation Decisions

### Response Shape (API-01)
- Add a `warnings` array to the existing `sync.status` return object, alongside `lastSync`, `errorCount`, and `accounts`
- Each warning entry contains: `accountId` (string), `accountName` (string), `errorCode` (string), `message` (string), `lastSeen` (string ISO datetime)
- Field names use camelCase to match the existing tRPC response convention (e.g., `lastSync.startedAt`, `lastSync.completedAt`)
- When no warnings exist, the array is empty `[]` -- no null, no omission

### Query Implementation (API-02)
- Query `sync_warnings` table directly in the `sync.status` procedure handler, same as the existing `sync_log` and `accounts` queries already inline there
- SQL: `SELECT account_id, account_name, error_code, message, last_seen FROM sync_warnings ORDER BY last_seen DESC` (Claude's Decision: ORDER BY last_seen DESC puts most recently observed warnings first, which is the natural priority for UI display)
- Map snake_case DB columns to camelCase in the return object, matching the pattern used for `lastSync` fields (e.g., `started_at` -> `startedAt`)
- No filtering by sync_log_id needed -- the table contains only active warnings (Phase 48 auto-clears resolved ones)

### No Service Layer Extraction
- Keep the query inline in the tRPC router handler, not in a separate service function (Claude's Decision: single SELECT with no business logic does not warrant a service layer; matches existing pattern where sync.status handler queries sync_log and accounts inline)

### Type Safety
- TypeScript `as` cast on the query result, matching the existing pattern in the `sync.status` handler for `lastSync` and `accounts` (Claude's Decision: consistent with codebase style; all tRPC router queries use inline `as` casts rather than Zod output schemas)

### Backward Compatibility
- Existing `lastSync`, `errorCount`, and `accounts` fields remain unchanged in shape and behavior
- The `warnings` field is additive only -- no existing field removed or renamed
- Client code consuming sync.status will see a new `warnings` property; TanStack Query will pick it up on next refetch without any client changes needed in this phase

### Claude's Discretion
- Exact placement of the warnings query within the handler (before or after existing queries)
- Whether to use a prepared statement variable or inline the `db.prepare()` call
- Whether to include `occurrence_count` or `first_seen` in the response (not required by API-01, but harmless if included)

</decisions>

<specifics>
## Specific Ideas

- The `sync_warnings` table schema from Phase 47: `account_id TEXT NOT NULL`, `account_name TEXT NOT NULL`, `error_code TEXT NOT NULL`, `message TEXT NOT NULL`, `first_seen TEXT`, `last_seen TEXT`, `occurrence_count INTEGER`
- API-01 specifies exactly 5 fields: accountId, accountName, errorCode, message, lastSeen -- `first_seen` and `occurrence_count` are not required in the tRPC response
- The sync.status handler currently returns 3 top-level keys (`lastSync`, `errorCount`, `accounts`); this phase adds a 4th key (`warnings`)
- Phase 50 (Dashboard Warning UI) and Phase 51 (Navbar Warning Indicator) both depend on the `warnings` array added here -- they need `accountName` for display and `errorCode` for determining whether to show a reconnect link

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/sync/trpc-router.ts` lines 80-119: The `sync.status` query handler is the sole modification target. It already demonstrates the pattern of multiple `db.prepare().get/all()` calls with inline `as` casts and snake_case-to-camelCase mapping.

### Established Patterns
- All tRPC query handlers in `trpc-router.ts` use `ctx.db.prepare(SQL).get()` or `.all()` with TypeScript `as` casts for the result type
- Snake_case DB columns are mapped to camelCase in return objects (e.g., `started_at` -> `startedAt`, `error_message` -> `errorMessage`)
- Return objects are plain object literals -- no Zod output schema validation on tRPC procedures

### Integration Points
- `packages/server/src/sync/trpc-router.ts` line 80: `sync.status` procedure -- add warnings query and include in return object
- `packages/server/migrations/007-sync-warnings.sql`: Table schema that defines available columns
- `packages/client/src/pages/DashboardPage.tsx` line 52-54: Consumes `sync.status` via `useQuery` -- will gain access to `warnings` via type inference (consumed in Phase 50)
- `packages/client/src/components/SyncStatus.tsx` line 21-24: Navbar component consuming `sync.status` with 30s refetch interval -- will gain access to `warnings` (consumed in Phase 51)

</code_context>

<deferred>
## Deferred Ideas

- Dashboard UI rendering of warnings array -- Phase 50
- Navbar amber warning indicator -- Phase 51
- Agent tool updates to include warnings in get_sync_status -- Phase 52
- Pagination or filtering of warnings (unnecessary at current scale: ~10 accounts across 3 institutions)
- Zod output schema validation on sync.status response -- not used anywhere in the codebase, would be a pattern deviation

</deferred>

---

*Phase: 49-trpc-response-extension*
*Context gathered: 2026-03-26 via auto-context*
