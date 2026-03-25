# Plan 46-02 Summary: Dashboard and AccountsPage Manual Account Distinction

**Status:** Complete
**Completed:** 2026-03-25

## What Was Built

1. Added "Manual" pill badge to manual accounts on DashboardPage (inline after account name)
2. Added "Manual" pill badge to manual accounts on AccountsPage (inline after institution)
3. Changed "Last synced" to "Last imported" for manual accounts on AccountsPage
4. Updated AccountsPage empty state message to mention both SimpleFIN and CSV import

## Key Files

### Modified
- `packages/client/src/pages/DashboardPage.tsx` — added Manual badge in account rows when `a.source === 'manual'`
- `packages/client/src/pages/AccountsPage.tsx` — added Manual badge, conditional "Last imported"/"Last synced" label, updated empty state text

## Notes
- DASH-03/DASH-04 (net worth and reports) required no code changes — manual accounts are already included because queries don't filter by source
- DASH-05 (Sync Now button) required no changes — the button is global, not per-account; SimpleFIN sync naturally ignores manual accounts
- Badge style: `bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full` — matches existing row count badge pattern
