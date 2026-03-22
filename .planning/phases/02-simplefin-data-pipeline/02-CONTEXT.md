# Phase 2: SimpleFIN Data Pipeline - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Real bank transactions flow into the database with correct deduplication, rate-limit safety, and full error observability -- before any UI exists. This phase delivers: a SimpleFIN HTTP client with mock fixture mode, a sync service with layered deduplication and rate-limit enforcement, a scheduled auto-sync via croner, sync error logging, balance snapshot recording, and tRPC procedures for manual sync trigger and status queries.

</domain>

<decisions>
## Implementation Decisions

### SimpleFIN HTTP Client
- Access URL stored in `.env` file as `SIMPLEFIN_ACCESS_URL`, loaded at server startup
- Client exposes typed methods: `fetchAccounts()`, `fetchTransactions()`, `fetchBalances()` matching ARCHITECTURE.md spec
- Response normalization converts SimpleFIN JSON into app domain types with amounts as integer cents using the existing `toCents()` helper from `shared/src/types.ts`
- Mock fixture mode activated by environment variable (e.g., `SIMPLEFIN_MOCK=true`) to prevent live API calls during development and testing
- One-time setup token exchange (`claimToken`) is a standalone utility, not part of the sync flow (Claude's Decision: token exchange happens once during initial setup, keeping it separate avoids polluting the sync path)
- HTTP client uses native `fetch` API (Claude's Decision: Node 18+ has built-in fetch, avoids adding axios/got dependency)

### Transaction Deduplication
- Primary dedup: SimpleFIN `transactionId` used as the `transactions.id` primary key
- Fallback dedup: hash of `accountId + date + amount + payee` stored in `dedup_hash` column with UNIQUE index (existing schema constraint `idx_transactions_dedup_hash`)
- Insert strategy: `INSERT OR IGNORE` to silently skip duplicates at the database level
- Hash algorithm: SHA-256 of the concatenated fields, truncated to hex string (Claude's Decision: SHA-256 is built into Node crypto, collision risk negligible for this domain)

### Rate Limiting
- Server hard-caps SimpleFIN requests at 20/day per account, reserving 4 for manual syncs
- Rate limit counter stored in-memory with daily reset (Claude's Decision: single-server app with no horizontal scaling -- in-memory counter is simplest and survives only until restart which naturally resets the daily window)
- Each API call increments the counter; sync aborts with a logged error if cap would be exceeded
- Manual sync calls check remaining quota before proceeding, returning an error if fewer than 4 requests remain

### Sync Service
- Sync service is a standalone module in `packages/server/src/sync/` (Claude's Decision: follows established pattern of feature-based directories like `backup/` and `db/`)
- Sync processes all accounts in a single sync run, one account at a time sequentially (Claude's Decision: sequential is simpler and avoids concurrent rate-limit race conditions)
- Each account sync: fetch transactions, normalize to domain types, INSERT OR IGNORE into `transactions` table, update `accounts.balance` and `accounts.last_synced`
- Balance snapshots inserted into `balance_snapshots` table after each successful account sync (UNIQUE on `account_id, date` prevents duplicates for same-day re-syncs)
- Post-sync backup trigger calls the existing `createBackup()` from `packages/server/src/backup/backup.ts`

### Sync Error Logging
- Sync runs create a `sync_log` row at start (`status: 'running'`), update on completion (`status: 'success'` or `status: 'error'`)
- Error messages include account context (account name/ID) for debugging
- `sync_log.completed_at` is set when the sync finishes regardless of success/failure
- `sync_log.accounts_synced` and `sync_log.transactions_added` are populated on success

### Scheduled Sync
- Use `croner` package for cron-based scheduling (from ROADMAP plan 02-03)
- Twice-daily auto-sync schedule (Claude's Decision: default to 6:00 AM and 6:00 PM local time -- aligns with typical daily banking activity windows)
- Scheduler starts when the Express server starts, not as a separate process (Claude's Decision: single process keeps deployment simple for home server)
- Post-sync triggers backup via `createBackup()`

### tRPC Procedures
- tRPC router added to Express server for sync operations
- `sync.trigger` mutation: initiates a manual sync, returns sync result summary
- `sync.status` query: returns last sync time, error count, and per-account sync status
- tRPC setup uses `@trpc/server` with Express adapter (Claude's Decision: this is the first tRPC integration -- establishes the pattern for all future phases)
- Service layer pattern: tRPC router calls sync service, sync service calls data access functions (from ARCHITECTURE.md four-layer architecture)

### Mock Fixture Mode
- Fixture data is static JSON files in `packages/server/src/sync/fixtures/` (Claude's Decision: JSON fixtures are easy to inspect and version-control)
- Fixtures represent realistic SimpleFIN API responses with multiple accounts, transaction types, and edge cases (pending transactions, zero-amount entries)
- Mock client implements the same interface as the real SimpleFIN client, returning fixture data
- Fixture data includes at least 3 accounts matching the user's real institutions: Discover (banking), Fidelity (investment), Consumers CU (banking)

### Testing Strategy
- Vitest for all tests, consistent with Phase 1 (established pattern)
- TDD approach: write failing tests first for sync service, dedup logic, and rate limiter
- Tests use the mock fixture mode exclusively -- no live SimpleFIN API calls in tests
- Database tests use temporary SQLite files via `createDatabase()` with custom path (established pattern from Phase 1)

### Claude's Discretion
- Internal naming of sync service methods and helper functions
- Exact cron expression syntax for the twice-daily schedule
- Fixture data content (specific transaction amounts, payee names, dates)
- Whether rate-limit counter uses a Map, plain object, or class
- Internal structure of the tRPC router file (single file vs split by concern)
- Exact error message formatting in sync_log entries

</decisions>

<specifics>
## Specific Ideas

- ARCHITECTURE.md specifies the SimpleFIN client API surface: `claimToken()`, `fetchAccounts()`, `fetchBalances()`, `fetchTransactions()`, `fetchFullHistory()` plus normalize helpers (`normalizeAccount()`, `normalizeTransaction()`, `parseAmount()`, `epochToDate()`)
- SimpleFIN protocol spec is at https://www.simplefin.org/protocol.html (v2 released 2026-03-19) -- the researcher should consult this for response shapes
- Three institutions to model in fixtures: Discover (banking + HELOC), Fidelity (investments, balance-only), Consumers Credit Union (banking)
- SimpleFIN rate limit: 24 requests/day per account, 90-day max date range per request. Rate limit violations appear in the `errlist` response field
- The `Cents` branded type and `toCents()` helper already exist in `packages/shared/src/types.ts`
- The sync_log table already exists in the schema with columns: `id`, `started_at`, `completed_at`, `status`, `error_message`, `accounts_synced`, `transactions_added`
- The balance_snapshots table has a UNIQUE constraint on `(account_id, date)` -- same-day re-syncs will need INSERT OR REPLACE or ON CONFLICT handling
- ARCHITECTURE.md notes: "Data refreshes once daily per linked account (timing varies)" -- sync should not expect fresh data on every call

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createDatabase()` in `packages/server/src/db/connection.ts`: creates a database with WAL mode and foreign keys enabled, runs migrations. Use for test databases with custom paths.
- `createBackup()` in `packages/server/src/backup/backup.ts`: async backup function that handles timestamped snapshots, latest copy, integrity check, and pruning. Call this post-sync.
- `Cents` type and `toCents()` in `packages/shared/src/types.ts`: branded type for money values. Use in all SimpleFIN response normalization.
- `001-initial-schema.sql`: complete schema with all tables needed for this phase (accounts, transactions, balance_snapshots, sync_log) already created.

### Established Patterns
- Feature-based directory structure: `packages/server/src/backup/` contains both source and test files side-by-side (`backup.ts`, `backup.test.ts`). Follow same pattern for sync module.
- Database connection accepts optional path parameter for test isolation.
- Express server exports `app` for testability (wraps listen in `NODE_ENV !== 'test'` check).
- Migration runner uses PRAGMA user_version -- new tables for this phase should NOT require new migrations since the schema already covers all needed tables.

### Integration Points
- `packages/server/src/index.ts`: Express server entry point. tRPC middleware and sync scheduler will be initialized here.
- `packages/server/src/db/connection.ts`: Sync service needs a database instance. The server entry point should create the DB and pass it to both the sync service and tRPC context.
- `packages/server/src/backup/backup.ts`: `createBackup(db)` must be called after each successful sync run.
- `.env` file: `SIMPLEFIN_ACCESS_URL` and `SIMPLEFIN_MOCK` environment variables need to be defined.

</code_context>

<deferred>
## Deferred Ideas

- UI for sync status indicator and "Sync Now" button (Phase 3 -- SYNC-03, SYNC-04)
- React app shell and TanStack Query setup (Phase 3)
- Transaction categorization (Phase 4-5)
- Investment account balance-only display treatment (Phase 3 -- ACCT-03)
- Historical backfill of 90-day transaction history (Claude's Decision to defer: initial sync will fetch available history, but a dedicated backfill command is not required by any Phase 2 requirement)
- Setup token claim flow UI (out of scope -- one-time manual operation documented in README)

</deferred>

---

*Phase: 02-simplefin-data-pipeline*
*Context gathered: 2026-03-22 via auto-context*
