# Technology Stack

**Project:** Minerva Money v2.8 -- Sync Error Visibility
**Researched:** 2026-03-26
**Confidence:** HIGH

## Core Finding: Zero New Dependencies Required

Every capability needed for sync error visibility is already present in the current stack. This milestone adds a migration, extends an existing tRPC response, and builds UI with existing Tailwind utilities and lucide-react icons.

---

## Recommended Stack

### Core Technologies (All Existing -- No Changes)

| Technology | Version | Purpose | Integration Point |
|------------|---------|---------|-------------------|
| better-sqlite3 | ^11.7.0 | New `sync_warnings` table via migration 007 | `packages/server/migrations/007-sync-warnings.sql` |
| @trpc/server + zod | ^11.14.1 / ^4.3.6 | Extend `sync.status` response with warnings array | `packages/server/src/sync/trpc-router.ts` |
| @tanstack/react-query | ^5.95.0 | Consume extended sync.status response (auto-typed) | Client components already call `trpc.sync.status.queryOptions()` |
| tailwindcss | ^4.2.2 | Amber badges, CSS-only tooltips via `group-hover` | `SyncStatus.tsx`, `DashboardPage.tsx` |
| lucide-react | ^1.0.1 | `AlertTriangle` icon for warning indicator | Already used in 4 client files |

### What NOT to Add

| Library | Why Not |
|---------|---------|
| @radix-ui/react-tooltip | One tooltip does not justify a component library. Project convention: "all custom Tailwind components (no component library)". Tailwind `group-hover` achieves the same result. |
| @radix-ui/react-popover | Same reasoning. Simple hover dropdown built with Tailwind is adequate for showing 1-3 account warnings. |
| react-hot-toast / sonner | Sync warnings are persistent state, not ephemeral notifications. They belong in the sync status response and render inline until the underlying connection is fixed. |
| Any notification/alert library | A warning badge is 3 lines of JSX. The project has zero component library dependencies and should stay that way. |

---

## Integration Points

### 1. SQLite Migration (007-sync-warnings.sql)

**Pattern:** Numbered SQL file in `packages/server/migrations/`. The migration runner (`migrate.ts`) reads files sorted by name, applies each in a transaction, and sets `PRAGMA user_version` to the file number. Current user_version is 6 (from `006-account-source.sql`).

**Schema:**

```sql
CREATE TABLE sync_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_log_id INTEGER NOT NULL REFERENCES sync_log(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  account_name TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sync_warnings_sync_log_id ON sync_warnings(sync_log_id);
```

**Design rationale:**
- **`sync_log_id` FK:** Ties each warning to a specific sync run. Enables "get warnings for the latest sync" queries and CASCADE cleanup.
- **`account_id` nullable:** SimpleFIN errors may reference connection-level issues without a specific account ID. Also handles cases where the errored account does not yet exist in the `accounts` table (first-sync failure).
- **`account_name` denormalized:** Because `account_id` can be NULL or reference a non-existent account, the name must be stored directly. SimpleFIN's error objects include account identifying info.
- **`ON DELETE SET NULL` for account_id:** If an account is removed, the warning history remains readable via `account_name`.
- **`ON DELETE CASCADE` for sync_log_id:** When sync logs are eventually pruned, associated warnings clean up automatically.
- **Index on `sync_log_id`:** Primary query pattern is "get all warnings for sync log X".
- **No new column on `sync_log`:** The existing `status TEXT` column gains a `'partial'` value. TEXT columns in SQLite have no enum constraint -- no migration needed for this.

**Confidence:** HIGH -- follows exact conventions of migrations 001-006 (datetime defaults, TEXT timestamps, INTEGER PRIMARY KEY AUTOINCREMENT, foreign keys with ON DELETE).

### 2. Sync Service Changes (sync-service.ts)

**Current behavior:** `runSync()` collects errors in `result.errors: string[]` and writes a single `error_message` string to `sync_log`. Per-account errors from SimpleFIN's `errlist` are stringified but not persisted per-account.

**Required changes:**

1. After processing all accounts, write per-account warnings to `sync_warnings` table
2. Set `sync_log.status` based on outcome:
   - All accounts synced: `'success'` (unchanged)
   - API call failed entirely (catch block): `'error'` (unchanged)
   - Some accounts synced + some had errors: `'partial'` (NEW)
   - Zero accounts synced but API call succeeded: `'partial'` (the call worked but no data came through)

**SimpleFIN error data available** (from `simplefin-types.ts`):
```typescript
interface SimpleFINError {
  code: string;      // -> sync_warnings.error_code
  msg: string;       // -> sync_warnings.error_message
  conn_id?: string;  // connection identifier
  account_id?: string; // -> sync_warnings.account_id (if present)
}
```

The `data.errors` (or `data.errlist`) array is already iterated in `sync-service.ts` lines 38-42. Currently it only pushes string messages to `result.errors[]`. The change: also INSERT into `sync_warnings` for each error.

**Confidence:** HIGH -- straightforward extension of existing error handling logic with well-defined input types.

### 3. tRPC Response Extension (sync.status)

**Current response** (trpc-router.ts lines 80-119):
```typescript
{
  lastSync: { startedAt, completedAt, status, errorMessage, accountsSynced, transactionsAdded } | null,
  errorCount: number,
  accounts: { id, name, balance, last_synced, source }[],
}
```

**Extended response -- add `warnings` field:**
```typescript
{
  lastSync: { ... },     // unchanged
  errorCount: number,    // unchanged
  accounts: [...],       // unchanged
  warnings: {            // NEW -- only for latest sync
    accountId: string | null;
    accountName: string;
    errorCode: string | null;
    errorMessage: string;
  }[],
}
```

**Why additive-only:**
- Adding a field is backward-compatible (tRPC infers types; existing client code ignores new fields until updated)
- Empty array when no warnings -- existing UI paths unchanged
- No input schema changes
- TanStack Query picks up new field automatically on next refetch

**Query pattern:** JOIN `sync_warnings` to the latest `sync_log` entry. Only return warnings for the most recent sync (users care about current state, not history).

**Confidence:** HIGH -- tRPC return types are inferred. Adding a field requires zero codegen or schema registration.

### 4. UI Patterns (All Tailwind, No Libraries)

**Color convention already established in codebase:**
- Green (`text-green-600`): success, positive values
- Red (`text-red-600`): errors, negative values
- Amber/Yellow (`text-yellow-600`): warnings -- already used for "Local only" backup status (DashboardPage line 259)
- Gray: neutral states, manual badges

#### A. Dashboard "Partial" Badge

Follows the existing badge pattern from DashboardPage line 103 (Manual badge):

```tsx
<span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
  Partial
</span>
```

#### B. Dashboard Warning List

Renders inline in the existing Sync Status card (DashboardPage lines 182-267). Warnings display as a list below the status row, with each affected account name and error message. Includes a "Reconnect on SimpleFIN" link.

#### C. Navbar Warning Indicator (SyncStatus.tsx)

Use `AlertTriangle` from lucide-react (already a dependency, used in 4 files):

```tsx
import { AlertTriangle } from 'lucide-react';
```

#### D. Tooltip Pattern (CSS-only, no library)

**Recommended: Tailwind `group-hover` pattern**

```tsx
<div className="relative group">
  <AlertTriangle className="w-4 h-4 text-amber-400" />
  <div className="absolute right-0 top-full mt-1 hidden group-hover:block
    bg-gray-800 text-white text-xs rounded px-3 py-2 w-64 z-50 shadow-lg">
    {warnings.map(w => (
      <div key={w.accountName}>{w.accountName}: {w.errorMessage}</div>
    ))}
  </div>
</div>
```

**Why CSS-only:** Zero JS state, works immediately, sufficient for desktop navbar hover. The current codebase already uses native `title` attributes for simple tooltips (SyncStatus.tsx line 38). The `group-hover` pattern is a step up that allows styled multi-line content.

**Mobile consideration:** The desktop navbar is `hidden md:block` (Layout.tsx line 9). Mobile uses `BottomTabBar`. The tooltip only needs hover behavior on desktop. If mobile needs warning visibility, the dashboard card (always visible) serves that purpose.

**Confidence:** HIGH -- all patterns verified against existing codebase. Tailwind `group-hover` is a core utility available in all Tailwind versions.

### 5. SimpleFIN Reconnect Link

The dashboard warning card should include a link to the SimpleFIN Bridge portal:

```tsx
<a href="https://bridge.simplefin.org/"
   target="_blank"
   rel="noopener noreferrer"
   className="text-sm text-blue-600 hover:text-blue-800 underline">
  Reconnect on SimpleFIN
</a>
```

**Why:** When SimpleFIN reports account-level errors, the fix is to re-authenticate the bank connection on SimpleFIN's portal. Providing a direct link reduces friction. No OAuth or API integration needed.

**Confidence:** MEDIUM -- the SimpleFIN Bridge URL is `https://bridge.simplefin.org/` based on SimpleFIN documentation. Should be verified against current production.

---

## Alternatives Considered

| Decision | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Warning storage | New `sync_warnings` table | JSON column on `sync_log` | Separate table enables per-account queries, proper foreign keys, and indexing. `json_extract()` in SQLite is less clean and harder to type. |
| Partial status | `'partial'` string in existing `status` TEXT column | New `has_warnings` boolean column | Reusing the status column is simpler -- no migration for the column, and the UI already switches on status values (`success`/`error`/`running`). |
| Tooltip | CSS `group-hover` | Radix tooltip / Headless UI | Project convention is zero component libraries. CSS hover is sufficient for showing 1-3 account names in a desktop navbar. |
| Warning scope | Latest sync only | Rolling history with pagination | YAGNI. The user cares about current state. Historical warnings have no actionable value. Can add history view later if needed. |
| Warning display | Inline in dashboard card | Toast notifications | Warnings persist until the bank connection is fixed. Toasts disappear. The user needs to see warnings on every page load, not just when they fire. |

---

## File Changes Summary

| File | Change Type | Purpose |
|------|-------------|---------|
| `packages/server/migrations/007-sync-warnings.sql` | NEW | Create `sync_warnings` table + index |
| `packages/server/src/sync/sync-service.ts` | MODIFY | Write warnings to table, set `'partial'` status |
| `packages/server/src/sync/trpc-router.ts` | MODIFY | Add `warnings[]` to `sync.status` response |
| `packages/client/src/components/SyncStatus.tsx` | MODIFY | Amber `AlertTriangle` icon + group-hover tooltip for partial status |
| `packages/client/src/pages/DashboardPage.tsx` | MODIFY | Amber "Partial" badge, warning list, SimpleFIN reconnect link |
| `packages/server/src/sync/sync-service.test.ts` | MODIFY | Test partial status logic and warning insertion |
| `packages/server/src/sync/trpc-router.test.ts` | MODIFY | Test warnings in sync.status response |

---

## Installation

```bash
# Nothing to install. Zero new dependencies for this milestone.
```

---

## Sources

- Codebase: `packages/server/src/db/migrate.ts` -- migration runner pattern (user_version, numbered files, transactional apply) -- HIGH confidence
- Codebase: `packages/server/migrations/001-006` -- naming conventions, schema patterns -- HIGH confidence
- Codebase: `packages/server/src/sync/sync-service.ts` lines 38-42 -- current SimpleFIN error handling -- HIGH confidence
- Codebase: `packages/server/src/sync/simplefin-types.ts` -- `SimpleFINError` shape with `code`, `msg`, `account_id` -- HIGH confidence
- Codebase: `packages/server/src/sync/trpc-router.ts` lines 80-119 -- current `sync.status` response shape -- HIGH confidence
- Codebase: `packages/client/src/components/SyncStatus.tsx` -- current navbar sync display, native `title` tooltip usage -- HIGH confidence
- Codebase: `packages/client/src/components/Layout.tsx` -- navbar structure, `hidden md:block` responsive pattern -- HIGH confidence
- Codebase: `packages/client/src/pages/DashboardPage.tsx` -- sync status card, amber color usage, badge patterns -- HIGH confidence
- Codebase: lucide-react usage in 4 client files -- confirms availability without new install -- HIGH confidence

---
*Stack research for: Minerva Money v2.8 Sync Error Visibility*
*Researched: 2026-03-26*
