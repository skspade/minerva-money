# Phase 1: Foundation - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

The project is buildable, the database schema is correct by design, and the backup system is in place before any data is written. This phase delivers: monorepo scaffolding (client, server, shared packages), TypeScript and build tooling, the complete SQLite schema with integer-cent money storage and dedup constraints, a migration runner, and the iCloud Drive backup module with integrity checking and 30-day retention.

</domain>

<decisions>
## Implementation Decisions

### Monorepo and Build Tooling
- Monorepo with three packages: `client`, `server`, `shared` (from ROADMAP plan 01-01)
- TypeScript across all packages with strict mode (from PROJECT.md constraints -- full-stack TypeScript)
- Vite for client dev server and bundling (from PROJECT.md constraints)
- Express for the backend server (from PROJECT.md constraints)
- `npm run dev` starts both Express server and Vite dev server concurrently (from success criteria)
- npm workspaces for monorepo package management (Claude's Decision: simplest monorepo tool for three packages, no extra dependency)
- `concurrently` package to run Express and Vite in parallel under a single `dev` script (Claude's Decision: standard lightweight approach for dual-server dev mode)
- Vitest as the test framework (from ROADMAP plan 01-01 -- "Vitest" explicitly mentioned)
- ESLint for linting (from ROADMAP plan 01-01)

### Database Schema
- All money values stored as INTEGER columns representing cents (from INFR-04, REQUIREMENTS.md)
- better-sqlite3 as the SQLite driver (from PROJECT.md constraints)
- UNIQUE constraints on transactions for dedup: transactionId primary key, hash fallback index (from ROADMAP plan 01-02 and PROJECT.md Key Decisions)
- PRAGMA user_version-based migration runner (from ROADMAP plan 01-02)
- Schema includes all tables needed for the full app: accounts, transactions, categories, category_groups, budget_allocations, categorization_rules, transfer_links, balance_snapshots, sync_log (Claude's Decision: ROADMAP says "all tables" and ARCHITECTURE.md lists these; defining upfront avoids schema rewrites)
- Database file at `~/minerva-money/data/minerva.db` (from ARCHITECTURE.md)
- WAL journal mode enabled via PRAGMA (Claude's Decision: WAL is standard for better-sqlite3 concurrent read/write and required for safe .backup() during writes)

### Migration Runner
- File-based migrations executed in order, tracked by PRAGMA user_version (from ROADMAP plan 01-02)
- Migrations are plain SQL files, one per version increment (Claude's Decision: simplest approach -- no ORM, aligns with direct better-sqlite3 usage)
- Migration runner is a TypeScript module that reads SQL files and applies them in a transaction (Claude's Decision: transactional application ensures atomic schema changes)

### Backup Module
- Uses better-sqlite3 `.backup()` API for atomic snapshots (from ARCHITECTURE.md and INFR-01)
- Backup target: `~/Library/Mobile Documents/com~apple~CloudDrive/MinervaBackups/` (from ARCHITECTURE.md)
- Timestamped snapshots with format `minerva_YYYYMMDD_HHMMSS.db` plus a `minerva_latest.db` copy (from ARCHITECTURE.md and INFR-03)
- 30-day retention with automatic pruning of older backups (from INFR-03)
- PRAGMA integrity_check run on each backup after writing (from success criteria)
- launchd plist for 6-hour scheduled execution (from INFR-01 and ARCHITECTURE.md)
- Backup module exported as a callable function for programmatic use by future sync trigger (from INFR-02 -- post-sync backup)
- Backup script written as a Node.js module, not a bash script (Claude's Decision: keeps implementation in TypeScript for consistency; the bash script in ARCHITECTURE.md is a reference design, but better-sqlite3 .backup() is the actual API to use)

### Testing
- Vitest with at least migration runner and backup module covered (from success criteria)
- Tests use an in-memory or temp-file SQLite database (Claude's Decision: avoids polluting real database; temp file needed for backup testing since .backup() requires a file target)

### Claude's Discretion
- Internal file/folder naming within each package (e.g., `src/db/` vs `src/database/`)
- Exact ESLint rule configuration beyond TypeScript strict defaults
- tsconfig path alias structure
- Order of columns in CREATE TABLE statements
- Whether migration SQL files live in `server/migrations/` or `shared/migrations/`

</decisions>

<specifics>
## Specific Ideas

- ARCHITECTURE.md provides a complete backup script reference (bash version) and launchd plist structure -- use as specification for the Node.js implementation
- Database path is explicitly `~/minerva-money/data/minerva.db` per ARCHITECTURE.md
- Backup path is explicitly `~/Library/Mobile Documents/com~apple~CloudDrive/MinervaBackups/` per ARCHITECTURE.md
- Transaction dedup uses two-tier strategy: `transactionId` as primary key, plus a UNIQUE index on hash of `account + date + amount + merchant` as fallback
- The `shared` package should contain TypeScript types used by both client and server (tRPC router types, domain models)
- ARCHITECTURE.md specifies a service layer pattern: tRPC routers call service modules which call data access modules -- schema design should anticipate this layering

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None -- this is a greenfield project with no existing source code. Only ARCHITECTURE.md exists at the repo root.

### Established Patterns
- ARCHITECTURE.md defines a four-layer architecture: React SPA / tRPC API / Service Layer / Data Access. Phase 1 establishes the Data Access layer foundation.
- PROJECT.md Key Decisions table establishes tRPC as the API layer and better-sqlite3 as the database driver.
- Backup strategy is well-documented in ARCHITECTURE.md with specific paths, retention policy, and both scheduled (launchd) and programmatic (post-sync) triggers.

### Integration Points
- The migration runner must produce a schema that Phase 2 (SimpleFIN Data Pipeline) can immediately write to -- accounts, transactions, balance_snapshots, and sync_log tables are critical
- The backup module must be importable by the sync service in Phase 2 for post-sync backup triggering (INFR-02)
- The Express + tRPC server scaffold must be ready for Phase 2 to add sync procedures

</code_context>

<deferred>
## Deferred Ideas

- SimpleFIN client and sync logic (Phase 2)
- React app shell and UI components (Phase 3)
- tRPC router definitions beyond server scaffold (Phase 2+)
- Category and budget seed data (Phase 4+)
- The launchd plist file is documented but actual installation/loading is a deployment concern -- Phase 1 creates the plist file but does not require `launchctl load` as part of success criteria

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-22 via auto-context*
