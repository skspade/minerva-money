# Plan 46-03 Summary: Import Wizard Inline Account Creation

**Status:** Complete
**Completed:** 2026-03-25

## What Was Built

1. Added `CREATE_NEW_SENTINEL = '__CREATE_NEW__'` constant alongside existing `SKIP_SENTINEL`
2. Added "+ Create New Account" option to account mapping dropdown (after "Skip", before existing accounts)
3. Created `InlineAccountForm` component with name (pre-filled from CSV), institution, and type fields
4. Added inline account creation flow: select triggers form, form calls `trpc.accounts.create` mutation, on success auto-selects new account in dropdown
5. Updated `isAccountResolved` to reject `CREATE_NEW_SENTINEL` (blocks Continue while create is in progress)
6. Updated `filterSkippedAccounts` to also filter out `CREATE_NEW_SENTINEL`
7. Added local accounts state to merge newly created accounts into dropdown without refetch
8. Added background query invalidation for cache freshness

## Key Files

### Modified
- `packages/client/src/pages/ImportPage.tsx` — all changes in this single file: new sentinel, InlineAccountForm component, state management, PreviewStep props extension

## Test Results
- ImportPage.test.ts: 17/17 passed (existing helper function tests)

## Decisions
- Used `useQueryClient` for background invalidation of `accounts.list` after creation
- Only one inline form open at a time via `creatingAccountFor` state
- Type enum uses `'banking' | 'credit'` literal union for TypeScript safety with tRPC
- Cancel resets select to empty string (unresolved), not to previous value
