# Architecture Research

**Domain:** Sync error visibility — Minerva Money v2.8
**Researched:** 2026-03-26
**Confidence:** HIGH (all findings from direct codebase inspection)

## System Overview

```
SimpleFIN API
       |
       v
sync-service.ts ──write──> sync_warnings table (NEW)
       |                          |
       v                          v
  sync_log table         tRPC sync.status (MODIFIED)
  (status: success/               |
   partial/error)         +-------+-------+
                          |               |
                          v               v
                   SyncStatus.tsx   DashboardPage.tsx
                   (navbar amber)  (warning details)
```

Changes span three layers (database, service/API, client) but touch only six files plus one new migration. No new packages, no new dependencies, no new endpoints.

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `migrations/007-sync-warnings.sql` | New table for per-account error persistence | **NEW** |
| `sync-service.ts` `runSync()` | Persist warnings to DB, determine 'partial' status | **MODIFY** |
| `trpc-router.ts` `syncRouter.status` | Query active warnings, extend response shape | **MODIFY** |
| `SyncStatus.tsx` | Navbar amber indicator for partial sync | **MODIFY** |
| `DashboardPage.tsx` | Sync Status card: amber badge, warning list, reconnect link | **MODIFY** |
| `query-tools.ts` `get_sync_status` | Include active warnings in agent response, fix column names | **MODIFY** |

## New Database Table

Migration `007-sync-warnings.sql`:

```sql
CREATE TABLE sync_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_log_id INTEGER NOT NULL REFERENCES sync_log(id) ON DELETE CASCADE,
  account_id TEXT,
  account_name TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sync_warnings_sync_log_id ON sync_warnings(sync_log_id);
```

**Design decisions:**
- `account_id` is nullable -- some SimpleFIN errors are connection-level, not tied to a specific account
- `account_name` is denormalized for display because the account may not exist in the `accounts` table if sync failed before the upsert ran
- Foreign key to `sync_log` with CASCADE so old warnings auto-clean with old log entries
- No UNIQUE constraint on account_id -- append-only model; "active" warnings are those from the latest sync_log entry
- Index on `sync_log_id` for the active-warnings join query

## Architectural Patterns

### Pattern 1: Additive tRPC Response Extension

**What:** Add `warnings[]` field to existing `sync.status` response rather than creating a new endpoint.
**When to use:** New data is conceptually part of the same resource.
**Trade-offs:** Slightly larger response vs. zero additional client plumbing. The warnings array is trivially small (max 6 accounts in this app).

Current response shape:
```typescript
{
  lastSync: { startedAt, completedAt, status, errorMessage, accountsSynced, transactionsAdded } | null,
  errorCount: number,
  accounts: { id, name, balance, last_synced, source }[]
}
```

Extended response (additive, non-breaking):
```typescript
{
  lastSync: { ... } | null,  // status now includes 'partial'
  errorCount: number,
  accounts: [...],
  warnings: {                 // NEW field
    accountId: string | null,
    accountName: string | null,
    errorCode: string,
    errorMessage: string,
    createdAt: string
  }[]
}
```

This works because every consumer of `sync.status` already invalidates on sync completion (`SyncButton.onSuccess` at line 11, `DashboardPage.syncMut.onSuccess` at line 35), so warnings refresh automatically with zero new wiring.

### Pattern 2: Latest-Sync-Log Join for Active Warnings

**What:** Query active warnings by joining to the most recent sync_log entry rather than maintaining a mutable "active" flag.
**When to use:** Append-only log tables where you need "current state."
**Trade-offs:** Slightly more complex query vs. no cleanup/state-management logic.

```sql
SELECT w.account_id, w.account_name, w.error_code, w.error_message, w.created_at
FROM sync_warnings w
WHERE w.sync_log_id = (SELECT id FROM sync_log ORDER BY id DESC LIMIT 1)
```

Each sync writes its own warning rows linked to its sync_log_id. The latest sync's warnings are the active ones. No "clear old warnings" logic needed.

### Pattern 3: Tri-State Status Enum

**What:** Extend sync_log.status from `success | error` to `success | partial | error`.
**When to use:** A process can succeed partially (API call worked, but some accounts had errors).
**Trade-offs:** Client must handle three states instead of two. Worth it because it maps directly to three visual states (green/amber/red).

Determination logic:
```typescript
// After processing all accounts:
if (result.accountsSynced === 0 && result.errors.length > 0) {
  finalStatus = 'error';      // complete failure
} else if (result.errors.length > 0) {
  finalStatus = 'partial';    // some accounts synced, some had errors
} else {
  finalStatus = 'success';    // clean sync
}
```

Note: The existing catch block (line 76-84 of sync-service.ts) handles API-level failures (network down, auth revoked) and already sets status to 'error'. The 'partial' logic only applies within the try block.

## Data Flow

### Write Path (Sync Time)

```
SimpleFIN fetchAccounts()
    |
    v
response.errors[] ──> INSERT sync_warnings (per error, with sync_log_id)
    |
    v
for each account:
    |-- success ──> upsert account, insert transactions
    |-- failure ──> push to result.errors
    v
determine status: success / partial / error
    |
    v
UPDATE sync_log SET status = ?
```

**Existing code touch points in sync-service.ts:**
- Lines 38-42: Already iterates `data.errors` and pushes to `result.errors[]` -- add INSERT here
- Lines 56-59: Per-account catch block already pushes to `result.errors[]` -- these are processing errors, not SimpleFIN errors, but should also become warnings
- Line 64-66: Currently hardcodes `status = 'success'` -- change to conditional status

### Read Path (Client Polling)

```
SyncStatus.tsx / DashboardPage.tsx
    |  (TanStack Query: 30s refetch + onSuccess invalidation)
    v
tRPC sync.status
    |
    v
SELECT from sync_log (latest entry)
SELECT from sync_warnings WHERE sync_log_id = latest
    |
    v
{ lastSync: { status: 'partial', ... }, warnings: [...] }
    |
    v
Client renders:
  - 'success' ──> green badge
  - 'partial' ──> amber badge + warning count/list
  - 'error'   ──> red badge + error message
```

### Cache Invalidation (Already Wired)

Both `SyncButton` (line 11-13) and `DashboardPage` (line 35) sync mutations already invalidate `sync.status.queryKey()` on success. SyncStatus polls at 30s intervals (line 23). No new invalidation wiring needed.

## Detailed File Changes

### 1. `packages/server/migrations/007-sync-warnings.sql` (NEW)

Create table and index as specified above. The migration runner reads `migrations/*.sql` sorted numerically and applies any file with a version number above `PRAGMA user_version`.

### 2. `packages/server/src/sync/sync-service.ts` (MODIFY)

**Current behavior:** Lines 38-42 log SimpleFIN errors to `result.errors[]` string array but never persist them. Line 64 sets status to `'success'` unconditionally when the try block completes.

**Changes:**
- After the `errList` loop (line 42): INSERT each SimpleFIN error into `sync_warnings` table with `syncLogId`
- Resolve `account_name` by looking up from `data.accounts` array (SimpleFIN response includes account data even when errors exist for some accounts)
- Per-account catch block (line 56-59): also INSERT a warning for processing failures
- Before the sync_log UPDATE (line 64): determine `finalStatus` based on `result.errors.length` and `result.accountsSynced`
- Update sync_log with `finalStatus` instead of hardcoded `'success'`

```typescript
// Pseudo-change after data = await client.fetchAccounts():
const insertWarning = db.prepare(
  `INSERT INTO sync_warnings (sync_log_id, account_id, account_name, error_code, error_message)
   VALUES (?, ?, ?, ?, ?)`
);

const errList = data.errors ?? data.errlist ?? [];
for (const err of errList) {
  const accountName = err.account_id
    ? data.accounts.find(a => a.id === err.account_id)?.name ?? err.account_id
    : null;
  insertWarning.run(syncLogId, err.account_id ?? null, accountName, err.code, err.msg);
  result.errors.push(`SimpleFIN error [${err.code}]: ${err.msg}`);
}

// When updating sync_log:
const finalStatus = result.errors.length > 0 && result.accountsSynced > 0
  ? 'partial' : 'success';
db.prepare(
  `UPDATE sync_log SET status = ?, completed_at = datetime('now'), accounts_synced = ?, transactions_added = ? WHERE id = ?`
).run(finalStatus, result.accountsSynced, result.transactionsAdded, syncLogId);
```

### 3. `packages/server/src/sync/trpc-router.ts` — syncRouter.status (MODIFY)

**Current:** Lines 80-119. Queries sync_log and accounts table.

**Changes:** Add query for `sync_warnings` joined to latest sync_log. Map rows to camelCase. Add `warnings` field to return object.

```typescript
// Add after existing queries (around line 105):
const warnings = lastSync ? (ctx.db.prepare(`
  SELECT account_id, account_name, error_code, error_message, created_at
  FROM sync_warnings WHERE sync_log_id = ?
`).all(lastSync.id) as {
  account_id: string | null; account_name: string | null;
  error_code: string; error_message: string; created_at: string;
}[]).map(w => ({
  accountId: w.account_id,
  accountName: w.account_name,
  errorCode: w.error_code,
  errorMessage: w.error_message,
  createdAt: w.created_at,
})) : [];

// Add to return object:
return { lastSync: ..., errorCount, accounts, warnings };
```

### 4. `packages/client/src/components/SyncStatus.tsx` (MODIFY)

**Current:** Lines 32-49. Three branches: 'running', 'error', default (shows last sync time). Located in navbar (Layout.tsx line 98).

**Changes:** Add branch for `status === 'partial'` between 'running' and 'error':

```typescript
if (status.lastSync.status === 'partial') {
  const count = status.warnings?.length ?? 0;
  const names = status.warnings?.map(w => w.accountName ?? 'Unknown').join(', ');
  return (
    <span className="text-sm text-amber-400" title={`Issues: ${names}`}>
      Partial sync ({count} warning{count !== 1 ? 's' : ''})
    </span>
  );
}
```

### 5. `packages/client/src/pages/DashboardPage.tsx` (MODIFY)

**Current:** Lines 213-219. Status display is a ternary: green for 'success', red otherwise.

**Changes:**
- Add amber 'partial' to the status ternary (line 214-216)
- Below existing status details, conditionally render a warnings section when `syncStatus.warnings.length > 0`
- Each warning: account name, error message, amber background
- SimpleFIN reconnect link at bottom: `https://bridge.simplefin.org/`

```typescript
// Status badge (modify existing ternary):
<span className={`text-sm font-medium ${
  syncStatus.lastSync.status === 'success' ? 'text-green-600' :
  syncStatus.lastSync.status === 'partial' ? 'text-amber-600' :
  'text-red-600'
}`}>
  {syncStatus.lastSync.status}
</span>

// Warning list (new, after existing status details):
{syncStatus.warnings?.length > 0 && (
  <div className="mt-3 space-y-1">
    {syncStatus.warnings.map((w, i) => (
      <div key={i} className="p-2 bg-amber-50 rounded text-sm text-amber-700">
        <span className="font-medium">{w.accountName ?? 'Connection'}</span>: {w.errorMessage}
      </div>
    ))}
    <a href="https://bridge.simplefin.org/" target="_blank" rel="noopener noreferrer"
       className="text-sm text-blue-600 hover:text-blue-800">
      Reconnect on SimpleFIN
    </a>
  </div>
)}
```

### 6. `packages/server/src/agent/tools/query-tools.ts` (MODIFY)

**Current:** Lines 256-258. Queries sync_log with wrong column names (`transactions_updated`, `error` instead of actual `error_message`; no `transactions_updated` column exists).

**Changes:**
- Fix column names to match actual schema: `error_message` not `error`, remove `transactions_updated`
- Add second query for active warnings from `sync_warnings`
- Return combined result

```typescript
tool(
  'get_sync_status',
  'Get sync status: last sync time, result, warnings, and any errors.',
  {},
  async () => {
    try {
      const rows = db.prepare(
        'SELECT started_at, completed_at, status, accounts_synced, transactions_added, error_message FROM sync_log ORDER BY started_at DESC LIMIT 5'
      ).all();
      const latestId = rows.length > 0 ? (rows[0] as any).id : null;
      const warnings = latestId ? db.prepare(
        'SELECT account_name, error_code, error_message FROM sync_warnings WHERE sync_log_id = ?'
      ).all(latestId) : [];
      return jsonResult({ recentSyncs: rows, activeWarnings: warnings });
    } catch (error) {
      return errorResult(error);
    }
  },
),
```

## Anti-Patterns

### Anti-Pattern 1: Separate Warnings Endpoint

**What people do:** Create `sync.warnings` as a new tRPC procedure.
**Why it's wrong:** Forces two client requests for one conceptual resource. Doubles cache invalidation keys. Warnings are tiny data.
**Do this instead:** Extend `sync.status` response with `warnings[]`.

### Anti-Pattern 2: Upsert-by-Account Warning Table

**What people do:** UNIQUE(account_id) constraint, upsert on each sync, explicit DELETE for resolved accounts.
**Why it's wrong:** Loses history. Requires cleanup logic that can drift out of sync.
**Do this instead:** Append-only rows linked to sync_log_id. "Active" = latest sync's warnings.

### Anti-Pattern 3: Client-Side Error String Parsing

**What people do:** Return raw error strings like "SimpleFIN error [AUTH_FAILED]: ..." and parse account names/codes in the client.
**Why it's wrong:** Fragile. Format changes break UI.
**Do this instead:** Structured objects `{ accountId, accountName, errorCode, errorMessage }` from the server.

### Anti-Pattern 4: Notification System

**What people do:** Build toast notifications, badge counters, or persistent alerts for sync warnings.
**Why it's wrong:** Over-engineering for a single-user app with 3 institutions. PROJECT.md explicitly scopes out external alerts.
**Do this instead:** Inline indicators in existing components (navbar + dashboard card).

### Anti-Pattern 5: Polling at Different Intervals for Warnings

**What people do:** Add a separate, faster polling interval for warnings.
**Why it's wrong:** Warnings only change when a sync runs (twice daily or manual trigger). The existing 30-second poll on `sync.status` is already sufficient.
**Do this instead:** Ride on existing `sync.status` refetchInterval and onSuccess invalidation.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| SimpleFIN API | `errors[]` array in fetchAccounts response | Errors have `code`, `msg`, optional `account_id` and `conn_id`. Already parsed in sync-service.ts lines 38-42 but not persisted. |
| SimpleFIN Dashboard | Static link `https://bridge.simplefin.org/` | User reconnects institutions there. Display-only, no API integration. |

### Internal Boundaries

| Boundary | Communication | Change Needed |
|----------|---------------|---------------|
| sync-service -> sync_warnings | Direct better-sqlite3 INSERT | New writes in runSync() |
| tRPC router -> sync_warnings | Direct better-sqlite3 SELECT | New query in syncRouter.status |
| SyncStatus -> tRPC | TanStack Query (existing) | Handle new 'partial' status + warnings array |
| DashboardPage -> tRPC | TanStack Query (existing) | Handle new 'partial' status + render warnings |
| Agent -> sync_warnings | Direct better-sqlite3 SELECT | New query in get_sync_status tool |

## Suggested Build Order

Strict dependency chain, bottom-up:

| Phase | File | Depends On | Parallelizable? |
|-------|------|------------|-----------------|
| 1 | `007-sync-warnings.sql` | Nothing | -- |
| 2 | `sync-service.ts` | Phase 1 (table must exist) | -- |
| 3 | `trpc-router.ts` syncRouter.status | Phase 2 (warnings populated) | -- |
| 4 | `query-tools.ts` get_sync_status | Phase 1 (table exists) | Yes, with 5-6 |
| 5 | `SyncStatus.tsx` | Phase 3 (response shape) | Yes, with 4, 6 |
| 6 | `DashboardPage.tsx` | Phase 3 (response shape) | Yes, with 4-5 |

**Phase ordering rationale:**
- Phases 1-3 are strictly sequential: table -> write path -> read path
- Phases 4, 5, 6 all depend only on the response shape being finalized (phase 3) and are independent of each other
- Phase 6 (DashboardPage) is the most complex UI change but has no dependency on phases 4-5

## Sources

- Direct inspection of `packages/server/src/sync/sync-service.ts` (write path, error handling, sync_log status logic)
- Direct inspection of `packages/server/src/sync/trpc-router.ts` (syncRouter.status current response shape, lines 80-119)
- Direct inspection of `packages/server/src/sync/simplefin-types.ts` (SimpleFINError interface: code, msg, account_id, conn_id)
- Direct inspection of `packages/server/migrations/001-initial-schema.sql` (sync_log table schema)
- Direct inspection of `packages/client/src/components/SyncStatus.tsx` (current status rendering)
- Direct inspection of `packages/client/src/components/SyncButton.tsx` (cache invalidation on sync)
- Direct inspection of `packages/client/src/components/Layout.tsx` (navbar structure, SyncStatus placement)
- Direct inspection of `packages/client/src/pages/DashboardPage.tsx` (sync status card rendering, lines 182-267)
- Direct inspection of `packages/server/src/agent/tools/query-tools.ts` (get_sync_status tool, lines 250-264)
- Direct inspection of `packages/server/src/sync/fixtures/simplefin-response.json` (error structure)
- `.planning/PROJECT.md` v2.8 milestone requirements

---
*Architecture research for: Minerva Money v2.8 — Sync Error Visibility*
*Researched: 2026-03-26*
