# Phase 52: Agent Tool Update - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Agent accurately reports sync status including warnings and fixes pre-existing query bugs. This phase updates the `get_sync_status` tool in `query-tools.ts` to (1) fix two column name bugs in the sync_log query and (2) include active sync warnings from the `sync_warnings` table added in Phase 47 and populated in Phase 48. No new tools, no UI changes, no schema changes.

</domain>

<decisions>
## Implementation Decisions

### Bug Fixes
- Fix `transactions_updated` -> `transactions_added` in the sync_log SELECT query (actual column name per migration 001)
- Fix `error` -> `error_message` in the sync_log SELECT query (actual column name per migration 001)
- Both are silent failures today -- SQLite returns NULL for non-existent columns rather than erroring

### Warnings Integration (AGENT-01)
- Query `sync_warnings` table in the same `get_sync_status` tool handler, after the existing sync_log query
- SQL: `SELECT account_id, account_name, error_code, message, last_seen FROM sync_warnings ORDER BY last_seen DESC` (Claude's Decision: matches the exact query used in the tRPC sync.status handler for consistency)
- Return warnings as a `warnings` array alongside the existing sync log rows in the JSON result
- Return shape: `{ syncLog: [...], warnings: [...] }` to clearly separate the two datasets (Claude's Decision: wrapping in named keys avoids ambiguity since the tool previously returned a flat array of sync_log rows)

### Response Field Naming
- Keep snake_case column names in the agent response rather than mapping to camelCase (Claude's Decision: agent tool responses are consumed by the LLM, not TypeScript code -- snake_case is more readable for the model and avoids an unnecessary mapping step; this matches the existing pattern where get_sync_status returns raw DB column names)

### Tool Description Update
- Update the tool description string to mention warnings capability: include "active warnings per account" alongside existing "last sync time, result, and any errors" (Claude's Decision: helps the model select this tool when the user asks about sync problems or account issues)

### Claude's Discretion
- Whether to use a single combined query (JOIN) or two separate queries for sync_log and sync_warnings
- Exact wording of the updated tool description
- Whether to include `occurrence_count` or `first_seen` in the warnings response

</decisions>

<specifics>
## Specific Ideas

- The `sync_warnings` table has columns: `id`, `sync_log_id`, `account_id`, `account_name`, `error_code`, `message`, `first_seen`, `last_seen`, `occurrence_count` (from migration 007)
- The `sync_log` table has columns: `id`, `started_at`, `completed_at`, `status`, `error_message`, `accounts_synced`, `transactions_added` (from migration 001)
- The current buggy query on line 257 of query-tools.ts: `'SELECT started_at, completed_at, status, accounts_synced, transactions_updated, error FROM sync_log ORDER BY started_at DESC LIMIT 5'`
- The tRPC `sync.status` handler (trpc-router.ts lines 107-115) already queries sync_warnings with the same SELECT and ORDER BY -- this is the reference implementation
- AGENT-01 is the only requirement for this phase
- Known tech debt item in PROJECT.md confirms these bugs: "agent get_sync_status references non-existent available_balance column" (note: the available_balance bug was already fixed; the transactions_updated and error bugs remain)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/agent/tools/tool-helpers.ts`: `jsonResult()` helper wraps data in the Agent SDK content format -- used by all query tools
- `packages/server/src/agent/tools/query-tools.ts`: `get_sync_status` tool (lines 250-264) is the sole modification target

### Established Patterns
- All query tools follow the same pattern: `try { query + jsonResult(data) } catch { errorResult(error) }`
- Raw `db.prepare().all()` with inline SQL strings -- no service layer for simple queries
- Agent tool responses use `jsonResult()` which wraps data as `{ content: [{ type: 'text', text: JSON.stringify(data) }] }`
- Other tools that query multiple tables (e.g., `list_transactions` joins transactions + categories) do so in a single handler

### Integration Points
- `packages/server/src/agent/tools/query-tools.ts` lines 250-264: The `get_sync_status` tool handler -- fix column names and add warnings query
- `packages/server/migrations/001-initial-schema.sql` lines 98-105: Defines sync_log schema (source of truth for column names)
- `packages/server/migrations/007-sync-warnings.sql`: Defines sync_warnings schema

</code_context>

<deferred>
## Deferred Ideas

- Agent tool to trigger re-authentication with SimpleFIN -- cannot be automated server-side per REQUIREMENTS.md out-of-scope
- Dedicated unit tests for query-tools.ts -- listed as known tech debt in PROJECT.md but not in scope for this phase
- Removing `transactions_updated` from PROJECT.md known tech debt list after the fix -- should happen during milestone completion

</deferred>

---

*Phase: 52-agent-tool-update*
*Context gathered: 2026-03-26 via auto-context*
