---
phase: 50-dashboard-warning-ui
plan: 01
status: complete
started: "2026-03-26"
completed: "2026-03-26"
---

# Plan 50-01: Dashboard Warning UI — Summary

## What Was Built

Added sync warning UI to the dashboard sync status card in DashboardPage.tsx:

1. **Three-way status color**: Extended the status display from two-way (green/red) to three-way (green for success, amber for partial, red for error). Status text is now capitalized for display consistency.

2. **Amber "Partial" badge**: When sync status is 'partial', an amber pill badge appears next to the status text, matching the existing "Manual" badge pattern.

3. **Per-account warning list**: When `syncStatus.warnings` has entries, an amber-styled section (`bg-amber-50 border border-amber-200`) appears between the stats rows and the error message box. Each warning shows account name (medium weight) and message.

4. **SimpleFIN reconnect link**: When any warning has an errorCode matching `auth|connection|institution` (case-insensitive), a "Reconnect at SimpleFIN" link appears at the bottom of the warning section, linking to `https://bridge.simplefin.org/simplefin/my-connections` with `target="_blank"`.

5. **No-warning state**: When warnings array is empty, no additional DOM elements are rendered — the card looks identical to before.

## Key Files

### Modified
- `packages/client/src/pages/DashboardPage.tsx` — Added warning UI (35 lines added, 4 lines modified)

## Decisions Made
- Kept warning section inline rather than extracting a separate component (per CONTEXT.md discretion — only ~30 lines)
- Used `&#8599;` (arrow) character for external link indicator rather than an SVG icon
- Let long error messages wrap naturally rather than truncating
- Did not show `occurrence_count` (not required by DASH-02)

## Self-Check: PASSED
- [x] TypeScript compilation passes
- [x] Full build succeeds
- [x] Three-way status color implemented
- [x] Amber badge appears for 'partial' status
- [x] Warning list renders from syncStatus.warnings
- [x] Reconnect link shows for connection error codes
- [x] No DOM changes when warnings empty
