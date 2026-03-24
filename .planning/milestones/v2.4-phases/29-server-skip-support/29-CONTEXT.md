# Phase 29: Server Skip Support - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Server gracefully handles partial account mappings, enabling clients to omit skipped accounts without errors. This phase modifies the execute endpoint to skip rows for unmapped accounts instead of throwing, adds a `skippedByAccountFilter` count to the execute result, and adds per-account row counts (`rowCountByAccount`) to the preview result so the client can display how many rows each CSV account contains.

</domain>

<decisions>
## Implementation Decisions

### Execute Endpoint - Partial Account Mappings (EXEC-01)
- Remove the `unmappedAccounts` validation check in `executeImport()` that currently throws `Error('Unmapped accounts: ...')`
- Rows whose `accountName` has no entry in `accountMappings` are silently skipped (not inserted) instead of causing an error
- Add `skippedByAccountFilter` field to `ExecuteResult` tracking how many valid rows were skipped due to unmapped accounts
- Existing `skippedCount` continues to track dedup-skipped rows (INSERT OR IGNORE conflicts) -- the two skip reasons are distinct counters (Claude's Decision: separating skip reasons lets the client show meaningful feedback for each)

### Preview Endpoint - Per-Account Row Counts
- Add `rowCountByAccount` field to `PreviewResult` as `Record<string, number>` mapping CSV account names to their row counts
- Computed from `validTransformed` rows grouped by `accountName` (Claude's Decision: counting only valid rows matches what would actually import -- invalid rows are already reported via errors)
- Placed in the preview result alongside the existing `accounts` array so the client has both the mapping suggestions and the counts

### Type Changes
- `ExecuteResult` gains `skippedByAccountFilter: number`
- `PreviewResult` gains `rowCountByAccount: Record<string, number>`
- No Zod schema changes needed for the router -- output types are inferred from return values (Claude's Decision: tRPC infers output types automatically, no explicit output schema exists)

### Test Coverage
- Test that `executeImport` succeeds when `accountMappings` omits some CSV accounts
- Test that `skippedByAccountFilter` correctly counts rows from unmapped accounts
- Test that mapped account rows are still imported normally when some accounts are unmapped
- Test that `previewImport` returns correct `rowCountByAccount` per CSV account
- Use existing test patterns: in-memory SQLite via `createDatabase()`, CSV string fixtures (Claude's Decision: matches established test patterns in import-service.test.ts)

### Claude's Discretion
- Exact variable naming for the account filter skip counter inside the transaction loop
- Whether to compute `rowCountByAccount` with a reduce or a for-loop
- Order of fields in the updated type interfaces

</decisions>

<specifics>
## Specific Ideas

- The current execute function (lines 362-366 in import-service.ts) has an explicit guard: `if (unmappedAccounts.length > 0) throw new Error(...)`. This is the single code block to remove/replace with skip logic.
- Inside the transaction loop (line 380), the skip check should happen before `generateDedupHash` to avoid computing hashes for rows that will be skipped anyway.
- The `rowCountByAccount` computation in preview can be done after the validation loop where `validTransformed` is already built -- a simple groupBy on `accountName`.
- Dedup stats computation in preview (lines 284-328) already handles unmapped accounts by counting them as "new" -- this behavior should remain unchanged since preview does not know about skip decisions yet (that is a Phase 31 concern).

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `import-service.ts`: Contains both `previewImport()` and `executeImport()` functions that need modification -- well-structured with clear separation between parsing, validation, transformation, and execution
- `import-service.test.ts`: Existing test file with established patterns using in-memory SQLite, CSV string fixtures, and vitest describe/it blocks
- `import-router.ts`: tRPC router with `preview` and `execute` mutations -- no changes needed since output types are inferred

### Established Patterns
- `ExecuteResult` interface defines the return shape; tRPC infers it automatically -- adding a field to the interface is sufficient
- Execute uses `db.transaction()` for atomic operations -- skip logic goes inside the existing transaction
- Dedup uses `INSERT OR IGNORE` with `dedup_hash` unique constraint -- skip-by-account is a separate pre-insert check
- Test file uses `createDatabase()` for in-memory SQLite with migrations, `beforeEach`/`afterEach` for setup/teardown

### Integration Points
- `ExecuteResult` type is consumed by the client's import wizard results step -- adding `skippedByAccountFilter` will be available to the client via tRPC type inference
- `PreviewResult` type is consumed by the client's preview/mapping step -- adding `rowCountByAccount` will be available for Phase 30's row count badges
- No router changes needed -- the `accountMappings: z.record(z.string(), z.string())` Zod schema already allows partial records (omitting keys is valid)

</code_context>

<deferred>
## Deferred Ideas

- Client-side filtering of preview stats based on skip decisions -- Phase 31 (STAT-01, STAT-02, STAT-03)
- Skip option in account mapping dropdown UI -- Phase 30 (SKIP-01)
- Row count badge display in mapping UI -- Phase 30 (SKIP-02)
- Confirm summary reflecting filtered counts -- Phase 31 (EXEC-02)

</deferred>

---

*Phase: 29-server-skip-support*
*Context gathered: 2026-03-24 via auto-context*
