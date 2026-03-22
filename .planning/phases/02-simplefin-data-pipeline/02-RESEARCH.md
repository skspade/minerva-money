# Phase 2: SimpleFIN Data Pipeline - Research

**Researched:** 2026-03-22
**Domain:** Financial data sync (SimpleFIN API), cron scheduling, tRPC
**Confidence:** HIGH

## Summary

Phase 2 builds the data pipeline that fetches bank transactions from SimpleFIN, deduplicates and stores them in SQLite, schedules automated syncs, and exposes sync controls via tRPC. The SimpleFIN protocol v2.0.0 is a simple REST API with HTTP Basic Auth — the `/accounts` endpoint returns all accounts and transactions in a single call. Amounts are numeric strings (not integers), so normalization to integer cents is required. Transaction IDs are provided by SimpleFIN and serve as the primary dedup key.

The stack is minimal: native `fetch` for HTTP, `croner` for scheduling, `@trpc/server` with Express adapter for the API layer, and `zod` for input validation. All tables (accounts, transactions, balance_snapshots, sync_log) already exist in the Phase 1 schema — no migrations needed. The existing `createBackup()`, `createDatabase()`, `Cents` type, and `toCents()` helper are all reusable.

**Primary recommendation:** Build the SimpleFIN client as a thin wrapper over fetch with a mock-switchable interface, then layer the sync service on top with INSERT OR IGNORE dedup and in-memory rate limiting.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Access URL stored in `.env` as `SIMPLEFIN_ACCESS_URL`, loaded at server startup
- Client exposes typed methods: `fetchAccounts()`, `fetchTransactions()`, `fetchBalances()` matching ARCHITECTURE.md spec
- Response normalization converts SimpleFIN JSON into app domain types with amounts as integer cents using `toCents()`
- Mock fixture mode activated by `SIMPLEFIN_MOCK=true` environment variable
- One-time setup token exchange (`claimToken`) is a standalone utility, not part of the sync flow
- HTTP client uses native `fetch` API (Node 18+)
- Primary dedup: SimpleFIN `transactionId` used as `transactions.id` primary key
- Fallback dedup: SHA-256 hash of `accountId + date + amount + payee` in `dedup_hash` column with UNIQUE index
- Insert strategy: `INSERT OR IGNORE`
- Rate limit: 20/day per account, reserving 4 for manual syncs, in-memory counter with daily reset
- Sync service in `packages/server/src/sync/`
- Sequential account processing (one at a time)
- Balance snapshots inserted after each successful account sync
- Post-sync backup trigger calls `createBackup()`
- Sync log rows: start as `running`, update to `success`/`error`
- `croner` for cron scheduling, twice-daily (6:00 AM and 6:00 PM)
- Scheduler starts with Express server
- tRPC router: `sync.trigger` mutation, `sync.status` query
- tRPC uses `@trpc/server` with Express adapter
- Fixture data as static JSON in `packages/server/src/sync/fixtures/`
- Fixtures include 3 accounts: Discover, Fidelity, Consumers CU
- Vitest for all tests, TDD approach

### Claude's Discretion
- Internal naming of sync service methods and helper functions
- Exact cron expression syntax for the twice-daily schedule
- Fixture data content (specific transaction amounts, payee names, dates)
- Whether rate-limit counter uses a Map, plain object, or class
- Internal structure of the tRPC router file (single file vs split by concern)
- Exact error message formatting in sync_log entries

### Deferred Ideas (OUT OF SCOPE)
- UI for sync status indicator and "Sync Now" button (Phase 3)
- React app shell and TanStack Query setup (Phase 3)
- Transaction categorization (Phase 4-5)
- Investment account balance-only display treatment (Phase 3)
- Historical backfill dedicated command
- Setup token claim flow UI
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SYNC-01 | App syncs transactions from SimpleFIN with deduplication | SimpleFIN protocol v2 `/accounts` endpoint provides transactions with `id` field; INSERT OR IGNORE with dedup_hash fallback |
| SYNC-02 | App runs scheduled auto-sync twice daily | Croner library with cron expression `0 0 6,18 * * *` for 6AM/6PM |
| SYNC-03 | User can trigger manual sync via "Sync Now" button | tRPC `sync.trigger` mutation (backend only; UI is Phase 3) |
| SYNC-04 | App displays sync status showing last sync time and errors | tRPC `sync.status` query returning sync_log data (backend only; UI is Phase 3) |
| SYNC-05 | App logs sync failures server-side for debugging | sync_log table with error_message column, account context in error messages |
| ACCT-02 | App records daily balance snapshots per account | balance_snapshots table with UNIQUE(account_id, date), INSERT OR REPLACE for same-day re-syncs |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| croner | ^9.x | Cron job scheduling | Zero dependencies, TypeScript native, works in Node/Deno/Bun, supports 6-field cron with seconds |
| @trpc/server | ^11.x | Type-safe API layer | Industry standard for TypeScript-to-TypeScript RPC, Express adapter built-in |
| zod | ^3.x | Input validation for tRPC | Default validator for tRPC, runtime type checking |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | ^11.7.0 | SQLite driver | Already installed (Phase 1), synchronous API for INSERT OR IGNORE |
| node:crypto | built-in | SHA-256 hashing | Dedup hash generation, no external dependency needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| croner | node-cron | node-cron is more popular but croner has zero deps, better TypeScript support, and 6-field cron |
| native fetch | axios | axios adds dependency; native fetch is sufficient for simple GET with Basic Auth |
| zod | none | tRPC works without zod but loses input validation; zod is lightweight and standard |

**Installation:**
```bash
npm install croner @trpc/server zod --workspace=packages/server
```

## Architecture Patterns

### Recommended Project Structure
```
packages/server/src/sync/
├── simplefin-client.ts    # SimpleFIN HTTP client (real + mock interface)
├── simplefin-client.test.ts
├── simplefin-types.ts     # SimpleFIN API response types
├── sync-service.ts        # Sync orchestration, dedup, rate limiting
├── sync-service.test.ts
├── sync-scheduler.ts      # Croner-based scheduler
├── sync-scheduler.test.ts
├── rate-limiter.ts        # In-memory rate limit counter
├── rate-limiter.test.ts
├── trpc-router.ts         # tRPC sync procedures
├── trpc-router.test.ts
├── trpc.ts                # tRPC init (shared across future routers)
└── fixtures/
    └── simplefin-response.json  # Mock API response
```

### Pattern 1: Mock-Switchable Client Interface
**What:** Define a TypeScript interface for the SimpleFIN client, with real and mock implementations
**When to use:** Always — enables testing without live API calls
**Example:**
```typescript
// Source: SimpleFIN protocol v2 + project CONTEXT.md
interface SimpleFINClient {
  fetchAccounts(): Promise<AccountSet>;
  fetchTransactions(startDate?: number, endDate?: number): Promise<AccountSet>;
  fetchBalances(): Promise<AccountSet>;
}

function createSimpleFINClient(accessUrl: string): SimpleFINClient { /* real */ }
function createMockSimpleFINClient(): SimpleFINClient { /* fixture */ }

// Factory based on env
function getSimpleFINClient(): SimpleFINClient {
  if (process.env.SIMPLEFIN_MOCK === 'true') {
    return createMockSimpleFINClient();
  }
  return createSimpleFINClient(process.env.SIMPLEFIN_ACCESS_URL!);
}
```

### Pattern 2: INSERT OR IGNORE for Dedup
**What:** Use SQLite's INSERT OR IGNORE to silently skip duplicate transactions
**When to use:** Transaction insertion — both primary key (transactionId) and dedup_hash UNIQUE index handle conflicts
**Example:**
```typescript
const stmt = db.prepare(`
  INSERT OR IGNORE INTO transactions (id, account_id, date, amount, pending, payee, memo, dedup_hash)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
```

### Pattern 3: tRPC Context with Database
**What:** Pass database instance through tRPC context so procedures can access it
**When to use:** All tRPC procedures
**Example:**
```typescript
// Source: tRPC Express adapter docs
import { initTRPC } from '@trpc/server';
import type Database from 'better-sqlite3';

interface Context { db: Database.Database; }
const t = initTRPC.context<Context>().create();
export const router = t.router;
export const publicProcedure = t.procedure;
```

### Anti-Patterns to Avoid
- **Concurrent account syncing:** Race conditions on rate-limit counter. Process sequentially as decided.
- **Storing amounts as floats:** SimpleFIN returns numeric strings like "123.45". Always parse to cents immediately.
- **Forgetting to handle `errlist`:** SimpleFIN returns per-account errors in `errlist` even with 200 status. Must check this array.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling | setTimeout loops or custom timers | croner `Cron` class | Handles timezone, DST transitions, missed runs |
| Type-safe API | Express route handlers with manual types | @trpc/server with Express adapter | End-to-end type inference, input validation |
| Input validation | Manual type checks | zod schemas | Composable, runtime + type-level validation |
| SHA-256 hashing | Custom hash function | node:crypto `createHash` | Built-in, battle-tested, fast |

**Key insight:** The sync service itself is the only truly custom code. Everything else — scheduling, API layer, hashing, validation — has well-established solutions.

## Common Pitfalls

### Pitfall 1: SimpleFIN Amounts are Numeric Strings
**What goes wrong:** Treating `amount` as a number directly leads to floating-point errors
**Why it happens:** SimpleFIN returns `"amount": "-45.67"` as a string
**How to avoid:** Parse with `parseFloat()` then immediately convert via `toCents()`: `toCents(parseFloat(amount))`
**Warning signs:** Amounts off by 1 cent in database

### Pitfall 2: SimpleFIN Transaction ID May Not Be Stable
**What goes wrong:** Some institutions may change transaction IDs when transactions settle (pending to posted)
**Why it happens:** SimpleFIN relays what the bank provides; pending transactions may get new IDs
**How to avoid:** The dedup_hash fallback catches this — hash of accountId+date+amount+payee identifies the same transaction even if ID changes
**Warning signs:** Duplicate transactions appearing for the same purchase

### Pitfall 3: SimpleFIN errlist with 200 Status
**What goes wrong:** Assuming 200 means all accounts synced successfully
**Why it happens:** SimpleFIN returns 200 with partial data + errors in `errlist` for accounts that failed
**How to avoid:** Always check `response.errlist` and log errors per account; treat the sync as partial success
**Warning signs:** Missing accounts in sync results without any visible error

### Pitfall 4: Balance Snapshot Same-Day Conflicts
**What goes wrong:** Running sync twice on same day violates UNIQUE(account_id, date)
**Why it happens:** balance_snapshots has a unique constraint per account per day
**How to avoid:** Use `INSERT OR REPLACE` (not INSERT OR IGNORE) for balance snapshots — we want the latest balance
**Warning signs:** Second sync of the day throwing constraint violation errors

### Pitfall 5: Rate Limiter Reset Timing
**What goes wrong:** In-memory counter never resets if server runs continuously
**Why it happens:** No automatic daily reset mechanism
**How to avoid:** Store the counter date alongside the count; if current date differs from stored date, reset to 0
**Warning signs:** Rate limit hit even after midnight

## Code Examples

### SimpleFIN API Call with Basic Auth
```typescript
// Source: SimpleFIN protocol v2 specification
async function fetchAccounts(accessUrl: string): Promise<AccountSet> {
  const response = await fetch(`${accessUrl}/accounts`, {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (response.status === 403) {
    throw new Error('SimpleFIN access revoked or credentials invalid');
  }
  if (response.status === 402) {
    throw new Error('SimpleFIN payment required');
  }
  if (!response.ok) {
    throw new Error(`SimpleFIN API error: ${response.status}`);
  }

  return response.json();
}
```

Note: The Access URL already contains Basic Auth credentials embedded in the URL (e.g., `https://user:pass@bridge.simplefin.org/simplefin`). Native `fetch` handles this automatically.

### Dedup Hash Generation
```typescript
import { createHash } from 'node:crypto';

function generateDedupHash(accountId: string, date: string, amount: number, payee: string): string {
  const input = `${accountId}|${date}|${amount}|${payee}`;
  return createHash('sha256').update(input).digest('hex');
}
```

### Croner Twice-Daily Schedule
```typescript
// Source: Croner docs - 6-field cron expression
import { Cron } from 'croner';

// 6AM and 6PM every day (second minute hour day month weekday)
const syncJob = new Cron('0 0 6,18 * * *', async () => {
  await runSync();
});

// Stop on server shutdown
process.on('SIGTERM', () => syncJob.stop());
```

### tRPC Express Integration
```typescript
// Source: tRPC Express adapter docs
import * as trpcExpress from '@trpc/server/adapters/express';

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext: ({ req, res }) => ({ db }),
  }),
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-cron for scheduling | croner (zero deps, TS native) | 2023+ | Simpler install, better types |
| REST with manual types | tRPC for TS-to-TS APIs | 2022+ | End-to-end type safety without codegen |
| SimpleFIN v1 (errors array) | SimpleFIN v2 (errlist, connections) | 2026-03-19 | Must use v2 response shapes |

**Deprecated/outdated:**
- SimpleFIN v1 `errors` array replaced by structured `errlist` with error codes in v2
- SimpleFIN v1 `Organization` object replaced by flatter `Connection` object in v2

## Open Questions

1. **SimpleFIN Access URL format**
   - What we know: It's a URL with embedded Basic Auth credentials (user:pass in URL)
   - What's unclear: Exact subdomain/path structure for SimpleFIN Bridge vs direct institution servers
   - Recommendation: The client should work with any valid URL; mock mode bypasses this entirely

2. **Pending transaction handling**
   - What we know: SimpleFIN has `pending=1` query param and `pending` boolean on transactions
   - What's unclear: Whether pending transactions should be stored and how they transition to posted
   - Recommendation: Store pending transactions with `pending=1` flag; when they settle, the dedup_hash catches the posted version and the pending flag updates

## Sources

### Primary (HIGH confidence)
- SimpleFIN Protocol v2.0.0 specification (https://www.simplefin.org/protocol.html) - Full API spec, response shapes, auth flow
- Context7 /hexagon/croner - Cron expression syntax, TypeScript API, job control methods
- Context7 /trpc/trpc - Express adapter setup, router/procedure creation, context pattern

### Secondary (MEDIUM confidence)
- Project ARCHITECTURE.md and CONTEXT.md - Client API surface design, established patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via Context7/official docs
- Architecture: HIGH - Patterns follow established Phase 1 conventions and tRPC/croner docs
- Pitfalls: HIGH - SimpleFIN protocol spec documents edge cases; dedup strategy well-understood

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable domain, unlikely to change)
