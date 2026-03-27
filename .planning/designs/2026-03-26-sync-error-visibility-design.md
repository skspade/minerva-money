# Sync Error Visibility — Design

**Date:** 2026-03-26
**Approach:** Sync Warnings Table + Partial Status

## Database Schema

New migration adds `sync_warnings` table and updates `sync_log.status` to support `'partial'`.

```sql
CREATE TABLE sync_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_log_id INTEGER NOT NULL REFERENCES sync_log(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sync_warnings_sync_log_id ON sync_warnings(sync_log_id);
```

No schema change needed for `sync_log.status` — it's a TEXT column, so `'partial'` just works. The three valid values become: `'running'`, `'success'`, `'partial'`, `'error'`.

## Sync Service Changes

In `sync-service.ts`, after collecting per-account errors:

1. **Insert warnings into `sync_warnings`** — after the account loop, for each entry in `result.errors`, insert a row with the sync_log_id, account_id, account_name, and message.

2. **Set status to `'partial'`** — if `result.errors.length > 0` but the sync didn't throw (i.e., the API call worked), update `sync_log.status` to `'partial'` instead of `'success'`. The `error_message` column stays null (it's reserved for catastrophic failures).

3. **Parse SimpleFIN error list** — SimpleFIN errors from `data.errors`/`data.errlist` include `account_id` field. Map these to account names from the fetched accounts. For rate-limit and per-account sync failures, the account info is already available in the loop.

4. **Return warnings in SyncResult** — add `warnings: Array<{accountId, accountName, message}>` to the `SyncResult` type so callers (scheduler, tRPC) can log them.

## tRPC API Changes

Update `sync.status` query in `packages/server/src/sync/trpc-router.ts`:

1. **Extend the response shape** — add `warnings` array to the status response:
   ```ts
   warnings: Array<{ accountId: string; accountName: string; message: string }>
   ```

2. **Query warnings on status fetch** — when fetching the latest sync_log entry, also query `sync_warnings` for that sync_log_id. Return them in the response.

3. **Status field** — already returns `status` as a string, so `'partial'` works without type changes. Client code that checks `status === 'success'` will need updates.

No new endpoints needed — the existing `sync.status` query carries the warnings alongside the status.

## Dashboard UI Changes

Update the Sync Status card in `DashboardPage.tsx`:

1. **Amber "Partial" badge** — when `status === 'partial'`, show an amber/yellow badge (alongside existing green for success, red for error). Use `bg-amber-100 text-amber-700`.

2. **Account warnings list** — below the status badge, when warnings exist, show each warning as a row:
   ```
   ⚠ Consumers Credit Union (IL) — Connection needs attention
   ```
   Account name in semibold, simplified message after the dash.

3. **SimpleFIN link** — below the warnings list, show a link:
   ```
   Reconnect at bridge.simplefin.org →
   ```
   Links to `https://bridge.simplefin.org` with `target="_blank"`.

4. **Message simplification** — strip the "Please try again." suffix and other boilerplate from SimpleFIN error messages. Keep the actionable part (e.g., "Connection may need attention" or "The answer or answers were not provided in time").

5. **When no warnings** — the card looks the same as today for `success` and `error` states.

## Navbar SyncStatus Changes

Update `SyncStatus.tsx` in the navbar:

1. **Warning indicator** — when the latest sync status is `'partial'`, show an amber dot or warning icon next to the sync time text:
   ```
   ⚠ Synced 5 min ago
   ```
   The ⚠ is amber-colored. Existing "Sync error" red text stays for `'error'` status.

2. **Tooltip on hover** — show a tooltip with the count of affected accounts:
   ```
   1 account needs attention
   ```
   No full error details in the navbar — that's the dashboard's job.

3. **States summary:**
   - `running` → "Syncing..." (unchanged)
   - `success` → "Synced 5 min ago" (unchanged)
   - `partial` → "⚠ Synced 5 min ago" (amber warning)
   - `error` → "Sync error" (red, unchanged)
