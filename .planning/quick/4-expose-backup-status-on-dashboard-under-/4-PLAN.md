---
phase: quick-4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/server/src/sync/trpc-router.ts
  - packages/client/src/pages/DashboardPage.tsx
autonomous: true
must_haves:
  truths:
    - "Dashboard sync status card shows last backup time"
    - "Dashboard sync status card shows backup size"
    - "Dashboard sync status card shows whether backup is to iCloud or local"
  artifacts:
    - path: "packages/server/src/sync/trpc-router.ts"
      provides: "backup.status tRPC query"
      contains: "backupRouter"
    - path: "packages/client/src/pages/DashboardPage.tsx"
      provides: "Backup status display in sync card"
      contains: "backupStatus"
  key_links:
    - from: "packages/client/src/pages/DashboardPage.tsx"
      to: "trpc.backup.status"
      via: "useQuery hook"
      pattern: "trpc\\.backup\\.status"
---

<objective>
Add backup status information to the dashboard's Sync Status card. Currently the card only shows sync info (last sync time, status, accounts/transactions). Add a section below the sync details showing the most recent backup: when it happened, file size, and whether it went to iCloud or local storage.

Purpose: Give visibility into backup health without navigating elsewhere.
Output: Updated tRPC router with backup.status query, updated DashboardPage with backup info.
</objective>

<execution_context>
@/Users/seanspade/.claude/get-shit-done/workflows/execute-plan.md
@/Users/seanspade/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/server/src/backup/backup.ts — resolveBackupDir() returns {dir, isCloud}, backup files named minerva_YYYYMMDD_HHMMSS.db
@packages/server/src/sync/trpc-router.ts — syncRouter has status query at lines 76-115, appRouter at line 446
@packages/client/src/pages/DashboardPage.tsx — Sync Status card at lines 170-228

<interfaces>
From packages/server/src/backup/backup.ts:
```typescript
export interface BackupResult {
  path: string;
  timestamp: string;
  sizeBytes: number;
  integrityOk: boolean;
  isCloudBackup: boolean;
}

export function resolveBackupDir(homeDir?: string): { dir: string; isCloud: boolean };
```

From packages/server/src/sync/trpc-router.ts:
```typescript
// syncRouter.status returns:
{
  lastSync: { startedAt, completedAt, status, errorMessage, accountsSynced, transactionsAdded } | null,
  errorCount: number,
  accounts: { id, name, balance, last_synced, source }[],
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add backup.status tRPC query</name>
  <files>packages/server/src/sync/trpc-router.ts</files>
  <action>
Add a `backupRouter` to trpc-router.ts with a `status` query that reads the latest backup file from the backup directory.

1. Import `resolveBackupDir` from `../backup/backup.js` and `fs` from `node:fs` and `path` from `node:path`
2. Create `backupRouter` with a `status` query (no input needed):
   - Call `resolveBackupDir()` to get `{dir, isCloud}`
   - If dir does not exist, return `{ lastBackup: null }`
   - Read directory contents, filter to files matching `minerva_` prefix and `.db` extension (exclude `minerva_latest.db`)
   - Sort by filename descending (filenames contain timestamps so lexicographic sort works)
   - For the most recent file, `fs.statSync` to get size and mtime
   - Return `{ lastBackup: { filename, timestamp: stat.mtime.toISOString(), sizeBytes: stat.size, isCloud } }` or `{ lastBackup: null }` if no backups found
3. Add `backup: backupRouter` to the `appRouter` object (after `sync:`)

Do NOT import or use `createBackup` — this is read-only, just checking what's on disk.
  </action>
  <verify>
    <automated>cd /Users/seanspade/Documents/Source/minerva-money && npx tsc --noEmit --project packages/server/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>backup.status query exists in appRouter, returns latest backup metadata from disk</done>
</task>

<task type="auto">
  <name>Task 2: Display backup status in dashboard sync card</name>
  <files>packages/client/src/pages/DashboardPage.tsx</files>
  <action>
Add backup status display to the existing "Sync Status" card on the dashboard, below the existing sync details.

1. Add a `useQuery` call for `trpc.backup.status.queryOptions()` (similar pattern to the existing `syncStatus` query)
2. Inside the Sync Status card (the last card in the grid, lines 170-228), after the sync details section and before the closing div, add a backup section:
   - Add a thin `border-t border-gray-200 pt-2 mt-2` divider (matching the style used in the accounts card total divider)
   - Show header text "Backup" in `text-xs text-gray-400 uppercase mb-1` (matching account type headers)
   - If `backupStatus?.lastBackup` exists, show:
     - "Last backup" with the timestamp formatted via `new Date(lastBackup.timestamp).toLocaleString()` — same pattern as sync timestamp
     - "Size" with the size formatted in MB: `(lastBackup.sizeBytes / 1024 / 1024).toFixed(1) + ' MB'`
     - "Storage" showing "iCloud" (in green text-green-600) or "Local only" (in yellow text-yellow-600) based on `lastBackup.isCloud`
   - If no lastBackup, show "No backups found" in `text-gray-500 text-sm`
3. Also invalidate `trpc.backup.status.queryKey()` in the syncMut onSuccess callback so backup info refreshes after a manual sync (since sync triggers backup)

Use the same flex justify-between layout pattern as the existing sync status rows. Each row: left label in `text-sm text-gray-600`, right value in `text-sm` (optionally `font-medium`).
  </action>
  <verify>
    <automated>cd /Users/seanspade/Documents/Source/minerva-money && npx tsc --noEmit --project packages/client/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>Dashboard sync status card shows backup timestamp, size in MB, and iCloud/local storage indicator below sync details</done>
</task>

</tasks>

<verification>
1. `npm run build` succeeds without errors
2. Run dev server (`npm run dev`) and visit dashboard — sync status card shows backup section with last backup time, size, and storage type
</verification>

<success_criteria>
- Dashboard sync status card displays last backup time, file size, and cloud/local indicator
- Backup info refreshes when user triggers manual sync
- TypeScript compiles cleanly for both server and client
</success_criteria>

<output>
After completion, create `.planning/quick/4-expose-backup-status-on-dashboard-under-/4-SUMMARY.md`
</output>
