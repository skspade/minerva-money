# Phase 48: Sync Service Warning Pipeline - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Per-account sync errors are persisted and the sync_log accurately reflects partial success. This phase modifies `sync-service.ts` to write warning rows to `sync_warnings` (created in Phase 47), determine `partial` vs `success` vs `error` sync_log status, auto-clear warnings for accounts that recover, map connection-level errors to accounts, and clean up stale `running` entries. No UI or API changes -- purely service-layer logic.

</domain>

<decisions>
## Implementation Decisions

### Warning Persistence (SYNC-01)
- When SimpleFIN returns errors in the `errors`/`errlist` array with an `account_id`, write a row to `sync_warnings` using UPSERT: `INSERT INTO sync_warnings ... ON CONFLICT(account_id) DO UPDATE SET sync_log_id = excluded.sync_log_id, error_code = excluded.error_code, message = excluded.message, last_seen = datetime('now'), occurrence_count = occurrence_count + 1`
- `account_name` is resolved from the `accounts` array in the same SimpleFIN response (matching on `account_id`), falling back to the `account_id` string if no match (Claude's Decision: SimpleFIN returns both accounts and errors in the same response, so name lookup is straightforward)
- Warning writes happen inside the main sync flow after processing all accounts but before updating sync_log status (Claude's Decision: ensures warnings and status are consistent in a single logical step)

### Partial Status Logic (SYNC-02)
- sync_log status is `partial` when: the API call succeeded (no thrown exception), at least one account synced successfully, AND at least one warning was written
- sync_log status remains `success` when: the API call succeeded and zero warnings exist
- sync_log status is `error` when: the `fetchAccounts()` call itself throws (existing behavior, unchanged)
- The `partial` status value is a new string added to the status column -- SQLite TEXT column accepts it without migration (Claude's Decision: no enum constraint on sync_log.status, so adding a new value requires no schema change)

### Warning Auto-Clear (SYNC-03)
- At the end of a successful sync (after processing all accounts), delete `sync_warnings` rows for accounts that synced without errors in this run
- Implemented as: collect the set of account IDs that had errors, then `DELETE FROM sync_warnings WHERE account_id NOT IN (?)` scoped to accounts that were in the SimpleFIN response (Claude's Decision: accounts not in the response at all should retain their warnings -- they weren't retried)
- Only delete warnings for accounts that appeared in the current SimpleFIN response AND had no errors -- this prevents clearing warnings for accounts that SimpleFIN simply didn't return

### Connection-Level Error Mapping (SYNC-04)
- SimpleFIN errors with `conn_id` but no `account_id` are connection-level errors affecting all accounts on that connection
- Map `conn_id` to account IDs by matching against `rawAccount.conn_id` in the `data.accounts` array from the same response (Claude's Decision: conn_id is present on every SimpleFINAccount, making the mapping straightforward without DB queries)
- If a connection-level error has a `conn_id` that matches zero accounts in the response, write a single warning row with `account_id = conn_id` and `account_name` = connection name from error msg (Claude's Decision: edge case where the connection failed before returning any accounts -- still need to persist the warning)

### Stale Entry Cleanup (Success Criterion 5)
- Before inserting the new `running` sync_log entry, update any existing `running` entries to `error` with `error_message = 'Stale: superseded by new sync run'` and `completed_at = datetime('now')` (Claude's Decision: UPDATE is safer than DELETE since it preserves sync history and any attached warnings via foreign key)
- This handles the case where a previous sync crashed or was killed before completing

### Error Code Handling
- SimpleFIN `SimpleFINError.code` maps directly to the `error_code` column in `sync_warnings`
- SimpleFIN `SimpleFINError.msg` maps to the `message` column
- For per-account processing errors (caught in the existing try/catch around `syncAccount`), use error_code `'sync_error'` and the caught error message (Claude's Decision: distinguishes SimpleFIN-reported errors from local processing failures)

### Claude's Discretion
- Exact ordering of warning writes vs auto-clear within the sync flow
- Whether to extract warning logic into a separate helper function or keep it inline in `runSync`
- Variable naming for intermediate collections (error account sets, etc.)
- Whether to wrap warning writes in the same db.transaction or use separate statements

</decisions>

<specifics>
## Specific Ideas

- The `SimpleFINError` type in `simplefin-types.ts` already has `code`, `msg`, `conn_id?`, and `account_id?` fields -- these map directly to the warning pipeline needs
- The existing sync service already iterates `data.errors ?? data.errlist ?? []` and pushes to `result.errors` as strings -- this loop needs to be enhanced to also write to `sync_warnings`
- The `SyncResult` interface may need a `warnings` count or similar field so callers know about partial status, but the primary persistence is in the database
- The mock SimpleFIN client (`createMockSimpleFINClient`) loads from `fixtures/simplefin-response.json` which has an empty errors array -- tests will need custom clients that return errors
- SimpleFIN has 7 known error codes per REQUIREMENTS.md out-of-scope notes -- tests should cover at least account-level and connection-level error variants

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/sync/sync-service.ts`: The `runSync` function is the sole modification target. It already has the error iteration loop (lines 38-42), per-account try/catch (lines 51-60), and sync_log status updates (lines 64-66, 80-83).
- `packages/server/src/sync/simplefin-types.ts`: `SimpleFINError` interface with `code`, `msg`, `conn_id?`, `account_id?` already defines the error shape. `SimpleFINAccount` has `conn_id` for connection mapping.
- `packages/server/src/sync/sync-service.test.ts`: Existing test patterns use `createDatabase` for temp DB, custom client objects for error scenarios, and `skipBackup: true`. Follow this pattern for new tests.
- `packages/server/src/sync/simplefin-client.ts`: `createMockSimpleFINClient` can be referenced as a pattern for creating test clients with errors.

### Established Patterns
- Sync service uses `db.prepare().run()` for individual SQL statements and `db.transaction()` for atomic multi-statement operations
- Error handling: outer try/catch for API-level failures sets `error` status, inner try/catch per account adds to `result.errors` array
- Test database setup: `createDatabase(join(tmpDir, 'test.db'))` creates a fully migrated in-memory-like temp DB with all migrations applied
- All sync tests use `{ skipBackup: true }` to avoid filesystem side effects

### Integration Points
- `packages/server/src/sync/sync-service.ts` line 28-32: sync_log entry creation -- stale cleanup goes before this
- `packages/server/src/sync/sync-service.ts` line 38-42: error iteration loop -- warning writes hook into this
- `packages/server/src/sync/sync-service.ts` line 64-66: status update -- needs conditional `partial` logic
- `packages/server/migrations/007-sync-warnings.sql`: Schema already in place from Phase 47

</code_context>

<deferred>
## Deferred Ideas

- tRPC response extension to expose warnings to the client -- Phase 49
- Dashboard UI for partial sync badge and error list -- Phase 50
- Navbar warning indicator -- Phase 51
- Agent tool updates to surface warnings -- Phase 52
- Warning pruning/retention policy beyond CASCADE delete -- no current requirement
- Detailed SimpleFIN error code documentation/mapping table -- only 7 codes, can add if user requests

</deferred>

---

*Phase: 48-sync-service-warning-pipeline*
*Context gathered: 2026-03-26 via auto-context*
