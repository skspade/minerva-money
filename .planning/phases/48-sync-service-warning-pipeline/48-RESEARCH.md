# Phase 48: Sync Service Warning Pipeline - Research

**Researched:** 2026-03-26
**Domain:** Sync service modification (SQLite, better-sqlite3, existing service patterns)
**Confidence:** HIGH

## Summary

Phase 48 modifies `sync-service.ts` to persist per-account warnings from SimpleFIN errors into the `sync_warnings` table (created in Phase 47), determine partial/success/error sync_log status, auto-clear warnings for recovered accounts, map connection-level errors to accounts, and clean up stale `running` entries.

The existing `runSync` function is well-structured with clear hook points: error iteration (lines 38-42), per-account processing (lines 44-61), and status update (lines 63-66). All changes stay within this single function plus potentially a helper. No new dependencies are needed -- this is purely service-layer logic using existing `better-sqlite3` patterns already in the codebase.

**Primary recommendation:** Implement as targeted modifications to `runSync` with a helper function for warning persistence, keeping the existing error flow intact while adding warning writes and status logic.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Warning writes use UPSERT: `INSERT INTO sync_warnings ... ON CONFLICT(account_id) DO UPDATE SET sync_log_id, error_code, message, last_seen, occurrence_count+1`
- `account_name` resolved from SimpleFIN `accounts` array, falling back to `account_id` string
- Warning writes happen after processing all accounts but before updating sync_log status
- `partial` status when: API succeeded, at least one account synced, AND at least one warning written
- `success` when: API succeeded and zero warnings exist
- `error` when: `fetchAccounts()` throws (unchanged)
- Auto-clear: `DELETE FROM sync_warnings WHERE account_id NOT IN (error set)` scoped to accounts in the response
- Only delete warnings for accounts that appeared in response AND had no errors
- Connection-level errors (`conn_id` but no `account_id`) mapped via `rawAccount.conn_id` in response
- If connection error matches zero accounts, write single warning with `account_id = conn_id`
- Stale cleanup: UPDATE existing `running` entries to `error` with message before creating new entry
- Per-account processing errors use `error_code = 'sync_error'`

### Claude's Discretion
- Exact ordering of warning writes vs auto-clear within sync flow
- Whether to extract warning logic into separate helper function or keep inline
- Variable naming for intermediate collections
- Whether to wrap warning writes in db.transaction or separate statements

### Deferred Ideas (OUT OF SCOPE)
- tRPC response extension (Phase 49)
- Dashboard UI (Phase 50)
- Navbar warning indicator (Phase 51)
- Agent tool updates (Phase 52)
- Warning pruning/retention policy
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SYNC-01 | Write per-account warnings to sync_warnings when SimpleFIN returns errors | UPSERT pattern on sync_warnings table; hook into existing error iteration loop at lines 38-42 and per-account catch at lines 57-60 |
| SYNC-02 | Set sync_log status to 'partial' when some accounts have errors but API succeeded | Conditional status logic replacing hardcoded 'success' at line 64-66; SQLite TEXT column accepts new value |
| SYNC-03 | Auto-clear warnings for accounts that sync successfully | DELETE scoped to accounts in response that had no errors; runs after warning writes |
| SYNC-04 | Map connection-level SimpleFIN errors to correct accounts | Match `err.conn_id` against `rawAccount.conn_id` in `data.accounts` array |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | SQLite access | Already used throughout codebase |
| vitest | (existing) | Test framework | Already used for all tests |

### Supporting
No new libraries needed. All implementation uses existing project dependencies.

## Architecture Patterns

### Recommended Flow Within `runSync`

```
1. Stale cleanup (UPDATE running -> error)
2. Create sync_log entry (status = 'running')
3. fetchAccounts()
4. Parse SimpleFIN errors -> build errorAccountIds set + write warnings
5. Process each account (existing loop)
   - On catch: add to errorAccountIds + write warning with 'sync_error'
6. Auto-clear: DELETE warnings for accounts in response NOT in errorAccountIds
7. Determine status: error set empty -> 'success', else (accountsSynced > 0) -> 'partial', else -> 'error'
8. UPDATE sync_log with final status
```

### Pattern: Warning Helper Function

```typescript
function writeWarning(
  db: Database.Database,
  syncLogId: number | bigint,
  accountId: string,
  accountName: string,
  errorCode: string,
  message: string,
): void {
  db.prepare(`
    INSERT INTO sync_warnings (sync_log_id, account_id, account_name, error_code, message)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      sync_log_id = excluded.sync_log_id,
      error_code = excluded.error_code,
      message = excluded.message,
      last_seen = datetime('now'),
      occurrence_count = occurrence_count + 1
  `).run(syncLogId, accountId, accountName, errorCode, message);
}
```

### Pattern: Connection Error Mapping

```typescript
// Build account lookup from response
const accountsByConnId = new Map<string, SimpleFINAccount[]>();
for (const acct of data.accounts) {
  const list = accountsByConnId.get(acct.conn_id) ?? [];
  list.push(acct);
  accountsByConnId.set(acct.conn_id, list);
}

// For connection-level errors (conn_id but no account_id)
if (err.conn_id && !err.account_id) {
  const connAccounts = accountsByConnId.get(err.conn_id) ?? [];
  if (connAccounts.length === 0) {
    // Edge case: connection failed before returning accounts
    writeWarning(db, syncLogId, err.conn_id, err.conn_id, err.code, err.msg);
  } else {
    for (const acct of connAccounts) {
      writeWarning(db, syncLogId, acct.id, acct.name, err.code, err.msg);
    }
  }
}
```

### Pattern: Auto-Clear

```typescript
// Only clear warnings for accounts that were in this response AND had no errors
const responseAccountIds = new Set(data.accounts.map(a => a.id));
const accountsToClear = [...responseAccountIds].filter(id => !errorAccountIds.has(id));

if (accountsToClear.length > 0) {
  const placeholders = accountsToClear.map(() => '?').join(',');
  db.prepare(`DELETE FROM sync_warnings WHERE account_id IN (${placeholders})`).run(...accountsToClear);
}
```

### Anti-Patterns to Avoid
- **Deleting ALL warnings unconditionally:** Would clear warnings for accounts not in the current response
- **Using db.transaction for warning writes:** Not needed since each UPSERT is independent and idempotent; the sync_log update at the end is the authoritative status
- **Throwing from warning writes:** Warning persistence failures should not abort the sync

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL parameterization | String concatenation | `db.prepare().run()` | SQL injection prevention, already used everywhere |
| UPSERT logic | Manual SELECT+INSERT/UPDATE | SQLite `ON CONFLICT` clause | Atomic, race-free, already used for accounts |

## Common Pitfalls

### Pitfall 1: Forgetting to Scope Auto-Clear to Response Accounts
**What goes wrong:** Clearing all warnings not in the error set removes warnings for accounts that weren't in the SimpleFIN response at all
**Why it happens:** Natural to think "clear everything that's not errored"
**How to avoid:** Filter to `responseAccountIds` first, then exclude `errorAccountIds`
**Warning signs:** Warnings disappear for accounts that SimpleFIN didn't return

### Pitfall 2: Status Logic Off-By-One
**What goes wrong:** Status set to 'partial' when there are errors but zero successful accounts (should be handled differently) or 'success' when there are warnings from the error list
**Why it happens:** Multiple sources of errors (SimpleFIN errlist + per-account catch)
**How to avoid:** Track errorAccountIds as a Set across both error sources; status is 'partial' only if accountsSynced > 0 AND errorAccountIds.size > 0
**Warning signs:** sync_log shows 'success' when SimpleFIN reported errors

### Pitfall 3: Stale Cleanup Timing
**What goes wrong:** Stale cleanup runs after new sync_log entry is created, accidentally marking the new entry as stale
**Why it happens:** Order of operations error
**How to avoid:** Run stale cleanup BEFORE inserting the new 'running' entry
**Warning signs:** Every sync immediately gets marked as 'error'

### Pitfall 4: SQLite Placeholder Limit
**What goes wrong:** Too many accounts in the IN clause
**Why it happens:** SQLite has a max variables limit (default 999)
**How to avoid:** For typical SimpleFIN responses (< 50 accounts), this is not a concern. If needed, batch.
**Warning signs:** SQLite error about too many SQL variables

## Code Examples

### Existing Error Iteration (to be enhanced)
```typescript
// Current code (lines 38-42 of sync-service.ts)
const errList = data.errors ?? data.errlist ?? [];
for (const err of errList) {
  const msg = `SimpleFIN error [${err.code}]: ${err.msg}${err.account_id ? ` (account: ${err.account_id})` : ''}`;
  result.errors.push(msg);
}
```

### Existing Per-Account Error Handling (to be enhanced)
```typescript
// Current code (lines 57-60 of sync-service.ts)
catch (err) {
  const msg = `Sync failed for account ${rawAccount.name} (${rawAccount.id}): ${err instanceof Error ? err.message : String(err)}`;
  result.errors.push(msg);
}
```

### Test Pattern: Custom Client with Errors
```typescript
const clientWithErrors = {
  async fetchAccounts(): Promise<SimpleFINAccountSet> {
    return {
      errors: [
        { code: 'auth.required', msg: 'Reauthentication needed', account_id: 'ACC-001' }
      ],
      accounts: [
        { id: 'ACC-001', name: 'Checking', conn_id: 'CONN-1', currency: 'USD', balance: '1000.00', 'balance-date': Date.now() / 1000, transactions: [], org: { name: 'Test Bank' } },
        { id: 'ACC-002', name: 'Savings', conn_id: 'CONN-1', currency: 'USD', balance: '5000.00', 'balance-date': Date.now() / 1000, transactions: [], org: { name: 'Test Bank' } },
      ],
    };
  },
  async fetchTransactions() { return this.fetchAccounts(); },
  async fetchBalances() { return this.fetchAccounts(); },
};
```

## State of the Art

No changes to technology stack. All patterns are established in the existing codebase.

## Open Questions

None. The CONTEXT.md provides comprehensive locked decisions covering all implementation details. The existing codebase has clear hook points for all modifications.

## Sources

### Primary (HIGH confidence)
- `packages/server/src/sync/sync-service.ts` — existing sync flow, hook points identified
- `packages/server/src/sync/simplefin-types.ts` — SimpleFINError, SimpleFINAccount, SimpleFINAccountSet interfaces
- `packages/server/migrations/007-sync-warnings.sql` — target table schema
- `packages/server/src/sync/sync-service.test.ts` — existing test patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all existing
- Architecture: HIGH — clear modification points in existing code
- Pitfalls: HIGH — straightforward SQL operations with well-defined edge cases

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable internal codebase)
