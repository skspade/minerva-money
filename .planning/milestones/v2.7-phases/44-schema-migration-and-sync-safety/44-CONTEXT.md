# Phase 44: Schema Migration and Sync Safety - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Manual accounts can safely exist in the database without contaminating the SimpleFIN sync pipeline. This phase adds a `source` column to the accounts table, establishes the `manual_` ID prefix convention, filters the sync trigger and rate-limit check to SimpleFIN-only accounts, and exposes the `source` field in the `accounts.list` tRPC query. No CRUD operations, no UI changes, no agent tools -- just schema and sync safety.

</domain>

<decisions>
## Implementation Decisions

### Database Migration
- Add migration `006-account-source.sql` with `ALTER TABLE accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'simplefin'` (from REQUIREMENTS.md SCHEMA-01, SCHEMA-02)
- Existing accounts automatically get `source = 'simplefin'` via the DEFAULT clause -- no backfill needed (from REQUIREMENTS.md SCHEMA-02)
- Migration numbering follows the established `NNN-description.sql` convention (current highest is `005-budget-funding-step.sql`)
- The migration runner uses `user_version` pragma and applies files in sort order -- file numbering is sufficient for ordering

### Manual Account ID Convention
- Manual account IDs use `manual_` prefix + UUID v4 to avoid collisions with SimpleFIN IDs (from REQUIREMENTS.md SCHEMA-03)
- SimpleFIN IDs are opaque strings from the provider (e.g., `ACT-...`) -- the `manual_` prefix is a namespace separator that guarantees no collision (from design doc)
- No schema constraint enforcing the prefix -- the convention is enforced by the account creation service in Phase 45 (Claude's Decision: ALTER TABLE cannot add CHECK constraints to existing columns in SQLite; service-layer enforcement is the established pattern in this codebase)

### Sync Trigger Safety
- The `sync.trigger` tRPC mutation must filter its pre-flight rate-limit check to `source = 'simplefin'` accounts only (from REQUIREMENTS.md SCHEMA-04)
- Current query `SELECT id, name FROM accounts` must become `SELECT id, name FROM accounts WHERE source = 'simplefin'` in the sync trigger
- The `runSync` function in `sync-service.ts` does not need changes -- it processes accounts returned by SimpleFIN's API, which never includes manual accounts (Claude's Decision: runSync iterates over `data.accounts` from the SimpleFIN response, not the local DB -- manual accounts never appear in that response)
- The sync scheduler (`sync-scheduler.ts`) calls `runSync` with the SimpleFIN client -- no changes needed since the client only returns SimpleFIN accounts

### Rate Limiter Isolation
- The rate limiter operates on account IDs passed to it -- it does not query the DB directly
- Manual accounts will never be passed to the rate limiter because the sync trigger pre-filters and `runSync` only processes SimpleFIN response data (Claude's Decision: defense-in-depth is unnecessary here since manual account IDs never enter the sync pipeline at any point)

### accounts.list Query Update
- The `accounts.list` tRPC query must include the `source` column in its SELECT and return it in the response object (from ROADMAP success criteria 4)
- Add `source` to the SQL SELECT clause and the TypeScript return type
- The `sync.status` query also returns account data -- add `source` there too for consistency (Claude's Decision: sync.status returns accounts list and downstream consumers may need to distinguish source)

### Test Coverage
- Migration test: verify the `source` column exists after migration and defaults to `'simplefin'` (Claude's Decision: migration tests are established in `migrate.test.ts`)
- Sync trigger test: verify rate-limit pre-check excludes manual accounts (Claude's Decision: sync trigger already has tests in `trpc-router.test.ts` -- extend them)
- accounts.list test: verify `source` field is returned in response (Claude's Decision: ensures the API contract is verified)

### Claude's Discretion
- Exact UUID generation approach (crypto.randomUUID vs uuid package) -- deferred to Phase 45 where account creation is implemented
- Whether to add an index on the `source` column -- table is small (3 accounts currently)
- Exact wording of migration file name (e.g., `006-account-source.sql` vs `006-source-column.sql`)

</decisions>

<specifics>
## Specific Ideas

- The design doc specifies reusing `last_synced` for manual accounts to store "last CSV import timestamp" -- no schema change needed for this, just behavioral in Phase 45
- The `simplefin_id` column remains nullable -- manual accounts leave it NULL (from design doc)
- The sync trigger's pre-flight check (lines 60-69 of `trpc-router.ts`) is the only place in the sync pipeline that queries the local accounts table -- this is the single point that needs filtering
- The `syncAccount` function upserts accounts with the existing schema columns -- when Phase 45 adds manual accounts, the upsert's `ON CONFLICT(id) DO UPDATE SET` will not overwrite `source` since it only updates `name`, `balance`, `last_synced`, and `updated_at`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/db/migrate.ts`: Migration runner using `user_version` pragma -- reads SQL files from migrations dir, applies in order, wraps each in a transaction
- `packages/server/migrations/`: Five existing migration files (001-005) -- established naming convention `NNN-description.sql`
- `packages/server/src/sync/trpc-router.ts`: Contains both the `syncRouter.trigger` mutation (lines 58-74) and `accountsRouter.list` query (lines 117-135) that need modification

### Established Patterns
- All schema changes are SQL migration files in `packages/server/migrations/` -- no programmatic schema modifications
- tRPC router returns camelCase properties mapped from snake_case DB columns (e.g., `last_synced` -> `lastSynced`)
- Service functions accept `db: Database.Database` as first parameter -- consistent dependency injection pattern
- Tests use in-memory SQLite databases with migrations applied fresh for each test

### Integration Points
- `packages/server/src/sync/trpc-router.ts` line 60: `SELECT id, name FROM accounts` in sync trigger -- needs `WHERE source = 'simplefin'` filter
- `packages/server/src/sync/trpc-router.ts` line 119: `SELECT id, name, institution, type, balance, last_synced FROM accounts` in accounts.list -- needs `source` added
- `packages/server/src/sync/trpc-router.ts` line 93: `SELECT id, name, balance, last_synced FROM accounts` in sync.status -- needs `source` added
- Phase 45 depends on the `source` column existing and the `manual_` ID convention being established

</code_context>

<deferred>
## Deferred Ideas

- Account CRUD service (create, update, delete, recalculateBalance) -- Phase 45
- Import wizard integration with inline account creation -- Phase 46
- Dashboard visual distinction for manual accounts -- Phase 46
- Agent `create_account` tool and `list_accounts` source field -- Phase 46
- Index on `source` column -- unnecessary at current scale, can add later if needed
- CHECK constraint on `source` column values -- SQLite ALTER TABLE limitations; service-layer validation is sufficient

</deferred>

---

*Phase: 44-schema-migration-and-sync-safety*
*Context gathered: 2026-03-25 via auto-context*
