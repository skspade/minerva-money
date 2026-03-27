# Phase 52: Agent Tool Update - Research

**Researched:** 2026-03-26
**Status:** Complete

## Summary

Phase 52 is a surgical update to a single tool handler in `query-tools.ts`. The scope is fully defined by the context document and confirmed by code inspection.

## Findings

### Bug Confirmation

The `get_sync_status` tool on line 250-264 of `packages/server/src/agent/tools/query-tools.ts` has two column name bugs:

1. **`transactions_updated`** — does not exist in `sync_log` table. The actual column is `transactions_added` (already in the SELECT, so `transactions_updated` is a duplicate reference to a non-existent column). SQLite silently returns NULL.
2. **`error`** — does not exist. The actual column is `error_message` per migration 001. SQLite silently returns NULL.

Current buggy SQL:
```sql
SELECT started_at, completed_at, status, accounts_synced, transactions_added, transactions_updated, error FROM sync_log ORDER BY started_at DESC LIMIT 5
```

Fixed SQL should be:
```sql
SELECT started_at, completed_at, status, accounts_synced, transactions_added, error_message FROM sync_log ORDER BY started_at DESC LIMIT 5
```

### sync_warnings Table Schema (migration 007)

Columns: `id`, `sync_log_id`, `account_id` (UNIQUE), `account_name`, `error_code`, `message`, `first_seen`, `last_seen`, `occurrence_count`

### Reference Implementation

The tRPC `sync.status` handler in `trpc-router.ts` (line 107-108) queries:
```sql
SELECT account_id, account_name, error_code, message, last_seen FROM sync_warnings ORDER BY last_seen DESC
```

The agent tool should use the same query for consistency, potentially adding `occurrence_count` and `first_seen` for richer agent context.

### Existing Patterns

- All query tools use `try { query + jsonResult(data) } catch { errorResult(error) }`
- `jsonResult()` wraps data as `{ content: [{ type: 'text', text: JSON.stringify(data) }] }`
- Tools use `db.prepare().all()` with inline SQL
- Tool descriptions guide the LLM to select the right tool

### Implementation Approach

Two separate queries (not a JOIN) is the right approach because:
1. sync_log and sync_warnings have different cardinalities (5 log rows vs N warning rows)
2. Matches the pattern used in the tRPC handler
3. Simpler to read and maintain

### Return Shape Change

Current: flat array of sync_log rows
New: `{ syncLog: [...], warnings: [...] }` — structured object with named keys

This is a breaking change to the tool's return format, but since consumers are LLM prompts (not typed code), it's safe. The named keys actually improve LLM comprehension.

## Risks

- **None significant.** This is a ~15-line change to a single file with no downstream dependencies beyond LLM consumption.

## RESEARCH COMPLETE
