---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/client/src/pages/DashboardPage.tsx
autonomous: true
requirements: [QUICK-2]
must_haves:
  truths:
    - "User can click a Sync Now button on the Dashboard"
    - "Button shows loading state while sync is in progress"
    - "Dashboard data refreshes after sync completes"
    - "Rate limit errors display a clear message to the user"
  artifacts:
    - path: "packages/client/src/pages/DashboardPage.tsx"
      provides: "Sync Now button in Sync Status card"
  key_links:
    - from: "packages/client/src/pages/DashboardPage.tsx"
      to: "sync.trigger tRPC mutation"
      via: "useMutation with trpc.sync.trigger.mutationOptions"
      pattern: "useMutation.*sync\\.trigger"
---

<objective>
Add a "Sync Now" button to the Dashboard's Sync Status card that triggers a manual sync (which already includes backup) via the existing `sync.trigger` tRPC mutation.

Purpose: Let the user manually sync and backup at any time without waiting for the scheduled cron job.
Output: Updated DashboardPage.tsx with working sync button.
</objective>

<execution_context>
@/Users/seanspade/.claude/get-shit-done/workflows/execute-plan.md
@/Users/seanspade/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/client/src/pages/DashboardPage.tsx
@packages/server/src/sync/trpc-router.ts (sync.trigger mutation already exists, includes backup)
</context>

<interfaces>
<!-- Existing tRPC patterns used in this project (from CategoriesPage.tsx): -->

```typescript
// Mutation pattern:
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../trpc';

const trpc = useTRPC();
const queryClient = useQueryClient();
const someMut = useMutation(trpc.some.endpoint.mutationOptions({ onSuccess: () => { ... } }));
// Call: someMut.mutate()
// State: someMut.isPending, someMut.isError, someMut.error
```

<!-- sync.trigger returns the sync result object. sync.status query provides lastSync data. -->
<!-- sync.trigger already calls createBackup() on success (see sync-service.ts line 68). -->
</interfaces>

<tasks>

<task type="auto">
  <name>Task 1: Add Sync Now button to Dashboard Sync Status card</name>
  <files>packages/client/src/pages/DashboardPage.tsx</files>
  <action>
Modify DashboardPage.tsx to add a manual sync button:

1. Add `useMutation` and `useQueryClient` to the `@tanstack/react-query` import (already imports `useQuery`).

2. Inside `DashboardPage`, create:
   - `const queryClient = useQueryClient();`
   - A sync mutation using the project's established pattern:
     ```
     const syncMut = useMutation(trpc.sync.trigger.mutationOptions({
       onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: trpc.sync.status.queryKey() });
         queryClient.invalidateQueries({ queryKey: trpc.accounts.list.queryKey() });
       },
     }));
     ```

3. In the Sync Status card (the last card in the grid, around line 163), add a "Sync Now" button in the card header area, next to the "Sync Status" heading. Use the same header layout pattern as the other cards (`flex items-center justify-between`).

4. Button specs:
   - Text: "Sync Now" when idle, "Syncing..." when `syncMut.isPending`
   - Disabled when `syncMut.isPending`
   - Style: `text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed` (matches the "View all" link style used in other cards)
   - onClick: `() => syncMut.mutate()`

5. Below the sync status details (after the error message block around line 196), add an error display for the mutation itself:
   ```
   {syncMut.isError && (
     <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-600">
       {syncMut.error.message}
     </div>
   )}
   ```

Do NOT add a separate backup button -- the existing sync.trigger mutation already runs backup after a successful sync.
  </action>
  <verify>
    <automated>cd /Users/seanspade/Documents/Source/minerva-money && npm run build 2>&1 | tail -5</automated>
  </verify>
  <done>Dashboard Sync Status card has a "Sync Now" button that calls sync.trigger, shows loading state while syncing, invalidates queries on success, and displays errors inline. Build passes with no type errors.</done>
</task>

</tasks>

<verification>
- `npm run build` completes without errors
- DashboardPage.tsx imports useMutation and useQueryClient
- sync.trigger mutation is wired with onSuccess invalidation
- Button is disabled during pending state
</verification>

<success_criteria>
User can click "Sync Now" on the Dashboard, see a loading indicator, and have all dashboard data refresh when sync completes. Rate limit or other errors appear inline in the Sync Status card.
</success_criteria>

<output>
After completion, create `.planning/quick/2-add-a-ui-button-to-trigger-manual-sync-a/2-SUMMARY.md`
</output>
