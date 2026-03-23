# Phase 1: Foundation - Research

**Researched:** 2026-03-22
**Domain:** Monorepo scaffolding, SQLite schema design, backup infrastructure
**Confidence:** HIGH

## Summary

Phase 1 establishes the project foundation: an npm workspaces monorepo with three packages (client, server, shared), a complete SQLite schema using integer-cent money storage, a PRAGMA user_version migration runner, and an iCloud Drive backup module using better-sqlite3's `.backup()` API. All technology choices are locked by the user via CONTEXT.md and ARCHITECTURE.md -- no library selection decisions remain.

The primary risk is getting the monorepo wiring correct (TypeScript project references, npm workspaces, concurrent dev scripts) so that Phase 2 can immediately build on the foundation. The backup module is straightforward but requires careful testing since `.backup()` is async (returns a Promise) while better-sqlite3 is otherwise synchronous.

**Primary recommendation:** Build the monorepo scaffold first (Plan 01), then schema + migrations (Plan 02), then backup module (Plan 03) -- matching the roadmap's existing plan structure since each has clear boundaries and minimal file overlap.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Monorepo with three packages: `client`, `server`, `shared`
- TypeScript across all packages with strict mode
- Vite for client dev server and bundling
- Express for the backend server
- `npm run dev` starts both Express server and Vite dev server concurrently
- npm workspaces for monorepo package management
- `concurrently` package to run Express and Vite in parallel
- Vitest as the test framework
- ESLint for linting
- All money values stored as INTEGER columns representing cents
- better-sqlite3 as the SQLite driver
- UNIQUE constraints on transactions for dedup: transactionId primary key, hash fallback index
- PRAGMA user_version-based migration runner
- Schema includes all tables: accounts, transactions, categories, category_groups, budget_allocations, categorization_rules, transfer_links, balance_snapshots, sync_log
- Database file at `~/minerva-money/data/minerva.db`
- WAL journal mode enabled via PRAGMA
- File-based migrations executed in order, tracked by PRAGMA user_version
- Migrations are plain SQL files, one per version increment
- Migration runner is a TypeScript module that reads SQL files and applies them in a transaction
- Uses better-sqlite3 `.backup()` API for atomic snapshots
- Backup target: `~/Library/Mobile Documents/com~apple~CloudDrive/MinervaBackups/`
- Timestamped snapshots with format `minerva_YYYYMMDD_HHMMSS.db` plus `minerva_latest.db` copy
- 30-day retention with automatic pruning
- PRAGMA integrity_check run on each backup after writing
- launchd plist for 6-hour scheduled execution
- Backup module exported as a callable function
- Backup script written as a Node.js module (not bash)
- Vitest with at least migration runner and backup module covered
- Tests use in-memory or temp-file SQLite database

### Claude's Discretion
- Internal file/folder naming within each package (e.g., `src/db/` vs `src/database/`)
- Exact ESLint rule configuration beyond TypeScript strict defaults
- tsconfig path alias structure
- Order of columns in CREATE TABLE statements
- Whether migration SQL files live in `server/migrations/` or `shared/migrations/`

### Deferred Ideas (OUT OF SCOPE)
- SimpleFIN client and sync logic (Phase 2)
- React app shell and UI components (Phase 3)
- tRPC router definitions beyond server scaffold (Phase 2+)
- Category and budget seed data (Phase 4+)
- launchd plist installation/loading (not a success criterion)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFR-01 | App performs atomic SQLite backups to iCloud Drive every 6 hours via launchd | better-sqlite3 `.backup()` API confirmed async/atomic; launchd plist creation covered |
| INFR-02 | App triggers SQLite backup after every SimpleFIN sync completion | Backup module exported as callable function; Phase 2 will import it |
| INFR-03 | App retains 30 days of timestamped backup snapshots plus a latest copy | Node.js fs API for timestamp naming, copy, and age-based pruning |
| INFR-04 | All money values are stored as integers (cents) to avoid floating-point errors | SQLite INTEGER column type; enforced at schema level in CREATE TABLE |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^11.x | SQLite driver | Synchronous API, fastest Node SQLite driver, native `.backup()` support |
| express | ^4.x | HTTP server | Locked by ARCHITECTURE.md |
| typescript | ^5.x | Language | Full-stack TypeScript per project constraints |
| vite | ^6.x | Client bundler + dev server | Locked by CONTEXT.md |
| vitest | ^3.x | Test framework | Locked by CONTEXT.md, Vite-native |
| concurrently | ^9.x | Run Express + Vite in parallel | Locked by CONTEXT.md for `npm run dev` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/better-sqlite3 | ^7.x | TypeScript types for better-sqlite3 | Always -- enables typed database API |
| @types/express | ^4.x | TypeScript types for Express | Always -- typed request/response |
| eslint | ^9.x | Linting | Locked by CONTEXT.md |
| @typescript-eslint/parser | ^8.x | TypeScript ESLint parser | Paired with eslint for TS |
| @typescript-eslint/eslint-plugin | ^8.x | TypeScript ESLint rules | Paired with eslint for TS |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| npm workspaces | pnpm/turborepo | npm workspaces locked by user -- simplest, no extra dependency |
| concurrently | npm-run-all2 | concurrently locked by user -- standard for dual-server dev |
| plain SQL migrations | drizzle-kit/knex | PRAGMA user_version migrations locked by user -- simplest, no ORM |

**Installation:**
```bash
# Root
npm install -D typescript concurrently eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin vitest

# Server package
npm install better-sqlite3 express
npm install -D @types/better-sqlite3 @types/express

# Client package
npm install -D vite
```

## Architecture Patterns

### Recommended Project Structure
```
minerva-money/
├── package.json              # Root workspace config
├── tsconfig.base.json        # Shared TS settings
├── vitest.config.ts          # Root vitest config (projects: ['packages/*'])
├── packages/
│   ├── client/
│   │   ├── package.json
│   │   ├── tsconfig.json     # Extends base, includes client paths
│   │   ├── vite.config.ts    # Vite config with proxy to Express
│   │   ├── index.html
│   │   └── src/
│   │       └── main.ts       # Vite entry point (minimal for Phase 1)
│   ├── server/
│   │   ├── package.json
│   │   ├── tsconfig.json     # Extends base
│   │   ├── vitest.config.ts  # Server test config
│   │   ├── migrations/       # SQL migration files
│   │   │   └── 001-initial-schema.sql
│   │   └── src/
│   │       ├── index.ts      # Express entry point
│   │       ├── db/
│   │       │   ├── connection.ts  # Database connection + WAL setup
│   │       │   └── migrate.ts     # Migration runner
│   │       └── backup/
│   │           └── backup.ts      # Backup module
│   └── shared/
│       ├── package.json
│       ├── tsconfig.json     # Extends base
│       └── src/
│           └── types.ts      # Shared TypeScript types
```

### Pattern 1: npm Workspaces Monorepo
**What:** Root package.json declares `"workspaces": ["packages/*"]`. Each package has its own package.json with a `name` field (e.g., `@minerva/server`).
**When to use:** Always -- this is the locked monorepo strategy.
**Key detail:** Cross-package imports work via the package name (e.g., `import { type } from '@minerva/shared'`). The `shared` package needs `"main"` and `"types"` fields pointing to its output.

### Pattern 2: PRAGMA user_version Migration Runner
**What:** SQLite's built-in `PRAGMA user_version` stores an integer version number in the database file. The migration runner reads this, finds SQL files with higher version numbers, and applies them in order within a transaction.
**When to use:** Every server startup -- check and apply pending migrations.
**Example:**
```typescript
// Source: better-sqlite3 Context7 docs
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function migrate(db: Database.Database, migrationsDir: string): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = parseInt(file.split('-')[0], 10);
    if (version <= currentVersion) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
  }
}
```

### Pattern 3: Vite Proxy to Express
**What:** Vite dev server proxies API requests to Express backend, allowing both to run on different ports during development.
**When to use:** Development mode -- `npm run dev` runs both servers.
**Example:**
```typescript
// Source: Vite Context7 docs - server proxy configuration
// packages/client/vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/trpc': 'http://localhost:3001',
    },
  },
});
```

### Pattern 4: better-sqlite3 Backup API
**What:** The `.backup()` method creates an atomic copy of the database file, safe even during writes when WAL mode is enabled.
**When to use:** Scheduled backups and post-sync backups.
**Example:**
```typescript
// Source: better-sqlite3 Context7 docs
import Database from 'better-sqlite3';

const db = new Database('minerva.db');

// Simple backup
await db.backup('/path/to/backup.db');

// Backup with progress
await db.backup('/path/to/backup.db', {
  progress({ totalPages, remainingPages }) {
    const pct = ((totalPages - remainingPages) / totalPages * 100).toFixed(1);
    console.log(`Backup: ${pct}%`);
    return 200;
  }
});
```

### Anti-Patterns to Avoid
- **Putting the database file in iCloud Drive:** SQLite writes to multiple files (.db, -wal, -shm). iCloud sync mid-write corrupts the remote copy. Database lives at `~/minerva-money/data/minerva.db`; only atomic snapshots go to iCloud.
- **Using REAL/FLOAT for money:** Floating-point arithmetic causes rounding errors. All money columns MUST be INTEGER (cents).
- **Running migrations without a transaction:** A failed migration leaves the database in a partial state. Wrap each migration in a transaction with the version bump.
- **Forgetting WAL mode:** Without WAL, the database locks entirely during writes. Set `PRAGMA journal_mode = WAL` on connection open.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Concurrent dev servers | Custom process spawning | `concurrently` package | Handles signal forwarding, output interleaving, exit codes |
| SQLite backup | File copy of .db file | `db.backup()` API | File copy can produce corrupted backups during writes; `.backup()` is atomic |
| TypeScript compilation | Custom build scripts | `tsc` with project references | Native monorepo support via composite projects |
| Test framework config | Custom test runner | Vitest `projects` config | Native monorepo test discovery via `projects: ['packages/*']` |

**Key insight:** better-sqlite3's `.backup()` is the only safe way to copy a SQLite database that may be in use. Never use `fs.copyFile()` on a live database.

## Common Pitfalls

### Pitfall 1: npm Workspaces Hoisting Confusion
**What goes wrong:** Dependencies installed in root `node_modules` instead of package-local, causing import resolution issues.
**Why it happens:** npm workspaces hoists dependencies by default. If two packages use different versions of a library, conflicts arise.
**How to avoid:** Install package-specific dependencies from within the package directory or use `--workspace=packages/server`. Keep `better-sqlite3` (native module) in the server package only.
**Warning signs:** "Cannot find module" errors despite the package being in package.json.

### Pitfall 2: better-sqlite3 Native Module Rebuild
**What goes wrong:** `better-sqlite3` fails to import with "Module not found" or "Invalid ELF header" errors.
**Why it happens:** Native Node modules must be compiled for the correct Node.js version and platform. Switching Node versions or running `npm install` from the wrong directory can break it.
**How to avoid:** Install `better-sqlite3` from the server package directory. If issues arise, run `npm rebuild better-sqlite3`.
**Warning signs:** Segfaults or module load errors on server start.

### Pitfall 3: .backup() Returns a Promise
**What goes wrong:** Backup appears to complete instantly but the file is empty or incomplete.
**Why it happens:** Unlike all other better-sqlite3 methods (which are synchronous), `.backup()` is asynchronous and returns a Promise. Forgetting to `await` it causes the function to return before the backup is written.
**How to avoid:** Always `await db.backup(path)`. This is the one async method in better-sqlite3.
**Warning signs:** Backup files with 0 bytes or missing data.

### Pitfall 4: Migration Version Gaps
**What goes wrong:** A migration is skipped because its filename doesn't parse to the expected version number.
**Why it happens:** Inconsistent naming (e.g., `1-init.sql` vs `001-init.sql`) causes sort order issues.
**How to avoid:** Use zero-padded version numbers consistently: `001-initial-schema.sql`, `002-add-index.sql`. Parse the numeric prefix explicitly.
**Warning signs:** `PRAGMA user_version` doesn't match the number of migration files applied.

### Pitfall 5: Vitest Projects Config Key Name
**What goes wrong:** Vitest ignores workspace packages, runs no tests.
**Why it happens:** In Vitest v3+, the config key changed from `workspace` to `projects`. Using the old key silently fails.
**How to avoid:** Use `test.projects` (not `test.workspace`) in vitest.config.ts.
**Warning signs:** `vitest` command finds 0 test files despite tests existing in packages.

## Code Examples

### Database Connection with WAL Mode
```typescript
// Source: better-sqlite3 Context7 docs
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';

export function createDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? path.join(os.homedir(), 'minerva-money', 'data', 'minerva.db');
  const db = new Database(resolvedPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}
```

### Vitest Monorepo Config
```typescript
// Source: Vitest Context7 docs - projects configuration
// vitest.config.ts (root)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
```

### npm Workspaces Root package.json
```json
{
  "name": "minerva-money",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "concurrently \"npm run dev --workspace=packages/server\" \"npm run dev --workspace=packages/client\"",
    "build": "npm run build --workspaces",
    "test": "vitest run"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `vitest.workspace.ts` file | `test.projects` in vitest.config.ts | Vitest v3 (2025) | No separate workspace file needed |
| ESLint flat config optional | ESLint flat config default | ESLint v9 (2024) | Use `eslint.config.js` not `.eslintrc` |
| `ts-node` for running TS | `tsx` or native Node.js `--experimental-strip-types` | 2025 | Simpler TypeScript execution |

**Deprecated/outdated:**
- `vitest.workspace.ts`: Replaced by `test.projects` in config file (Vitest v3+)
- `.eslintrc.*` files: Replaced by `eslint.config.js` flat config (ESLint v9+)

## Open Questions

1. **tsx vs ts-node for server dev mode**
   - What we know: Both work for running TypeScript server code in development. `tsx` is faster and simpler. Node.js 22+ has `--experimental-strip-types`.
   - What's unclear: Whether the project wants to use `tsx`, `ts-node`, or native Node type stripping.
   - Recommendation: Use `tsx` for dev mode (`tsx watch src/index.ts`) -- simplest, no config needed. This is a Claude's Discretion area.

## Sources

### Primary (HIGH confidence)
- Context7 `/wiselibs/better-sqlite3` - backup API, PRAGMA, WAL mode
- Context7 `/vitest-dev/vitest` - projects config, monorepo setup
- Context7 `/vitejs/vite` - proxy configuration, Express middleware mode

### Secondary (MEDIUM confidence)
- ARCHITECTURE.md - project-specific paths, backup strategy, tech stack decisions
- CONTEXT.md - locked implementation decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries locked by user, versions verified via Context7
- Architecture: HIGH - patterns well-documented, monorepo + SQLite is mature
- Pitfalls: HIGH - common issues well-known for these libraries

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable stack, 30-day validity)
