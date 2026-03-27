# Phase 50: Dashboard Warning UI - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

User sees per-account sync errors on the dashboard with actionable next steps. This phase modifies the Sync Status card in `DashboardPage.tsx` to show an amber "Partial" badge when the latest sync status is `partial`, list each affected account by name with a simplified error message, and display a SimpleFIN reconnect link when connection errors exist. No server changes -- purely client-side React/Tailwind updates consuming the `warnings` array already returned by `sync.status` (Phase 49).

</domain>

<decisions>
## Implementation Decisions

### Status Badge (DASH-01)
- When `syncStatus.lastSync.status === 'partial'`, render an amber badge next to the status value reading "Partial"
- Badge uses amber/yellow Tailwind styling (`bg-amber-100 text-amber-700`) consistent with the existing manual account badge pattern (`bg-gray-100 text-gray-500` pill in the accounts card)
- The existing ternary for status color (`success` -> green, else -> red) is extended to a three-way: `success` -> green, `partial` -> amber, `error`/other -> red
- The status text "partial" is displayed as capitalized "Partial" for readability (Claude's Decision: consistent with how "success" and "error" are already rendered as plain text)

### Per-Account Error List (DASH-02)
- When `syncStatus.warnings` has entries, render a warning section below the existing sync stats rows
- Each warning is a compact row showing `accountName` and a simplified `message` string
- Styling: amber background container (`bg-amber-50 border border-amber-200 rounded`) with amber text, visually distinct from the existing red error box (`bg-red-50`)
- Account names rendered in medium font weight, messages in normal weight for visual hierarchy (Claude's Decision: differentiates the "what" from the "why" at a glance)

### SimpleFIN Reconnect Link (DASH-03)
- When any warning has an `errorCode` indicating a connection problem, display a link to `https://bridge.simplefin.org/simplefin/my-connections` to reconnect
- Connection error codes to match: codes containing `"auth"`, `"connection"`, or `"institution"` (case-insensitive) (Claude's Decision: SimpleFIN error codes are not formally documented but these patterns cover authentication failures, connection drops, and institution-level issues which are the actionable reconnect scenarios)
- Link renders as an anchor tag with `target="_blank"` and `rel="noopener noreferrer"`, styled as a subtle amber link below the warning list
- Link text: "Reconnect at SimpleFIN" with an external link indicator (Claude's Decision: clear call-to-action that sets expectation of leaving the app)

### No-Warning State (DASH-04)
- When `syncStatus.warnings` is an empty array, the sync card renders exactly as before -- no amber section, no reconnect link, no badge change
- The existing card structure, spacing, and content remain identical for `success` and `error` states
- No conditional wrapper or empty container rendered -- the warning section is simply absent via `{warnings.length > 0 && ...}` pattern (Claude's Decision: avoids layout shift and empty DOM nodes)

### Warning Section Placement
- The warning section renders between the existing sync stats (last sync time, status, accounts synced, transactions added) and the existing error message box (`syncStatus.lastSync.errorMessage`)  (Claude's Decision: warnings are less severe than full errors, so they appear before the red error box but after the stats)
- The reconnect link renders at the bottom of the warning section, after the account list

### Claude's Discretion
- Exact Tailwind spacing classes between warning items (py-1, space-y-1, etc.)
- Whether to truncate long error messages or let them wrap naturally
- Whether to show `occurrence_count` from the warning data (not required by DASH-02)
- Internal component extraction -- whether to extract the warning section into a helper component or keep it inline in DashboardPage

</decisions>

<specifics>
## Specific Ideas

- The `sync.status` response already returns `warnings` as an array of `{ accountId, accountName, errorCode, message, lastSeen }` (implemented in Phase 49, line 128-134 of trpc-router.ts)
- The SimpleFIN bridge connection management URL is `https://bridge.simplefin.org/simplefin/my-connections` -- this is the user-facing page for re-authorizing bank connections
- The current sync card status display (line 214-218 of DashboardPage.tsx) only handles `success` and a catch-all red; `partial` needs to be added as a third case
- The existing "Manual" badge pattern on account names (line 103-105) provides a reference for pill badge styling
- There are only ~10 accounts across 3 institutions, so the warning list will be short (typically 1-3 entries)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/client/src/pages/DashboardPage.tsx`: The sync status card (lines 182-267) is the sole modification target. It already queries `sync.status` via TanStack Query and has access to the `warnings` array via type inference from Phase 49.
- `packages/client/src/components/SyncStatus.tsx`: Navbar sync status component -- reference for how status strings are handled, but NOT modified in this phase (that's Phase 51).

### Established Patterns
- Status color ternary: `syncStatus.lastSync.status === 'success' ? 'text-green-600' : 'text-red-600'` on line 214-215 -- extend to three-way
- Error display box: `bg-red-50 rounded text-sm text-red-600` container for error messages (lines 229-231) -- the amber warning section follows this pattern with amber colors
- Badge pill: `inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500` used for "Manual" labels (lines 103-105)
- Conditional rendering: `{condition && <JSX />}` pattern used throughout the component for optional sections

### Integration Points
- `syncStatus` variable (line 52): Already contains the `warnings` array from Phase 49's tRPC extension -- no new queries needed
- `syncStatus.lastSync.status` (line 214): Status field that now includes `'partial'` as a possible value from Phase 48
- No new imports, hooks, or data fetching required -- all data is already available in the component

</code_context>

<deferred>
## Deferred Ideas

- Navbar amber warning indicator -- Phase 51 (independent, depends on Phase 49)
- Agent tool updates to include warnings in get_sync_status -- Phase 52
- Per-account staleness indicator (STALE-01) -- deferred future requirement
- Warning dismiss/acknowledge button -- no requirement, occurrence_count provides context
- Animated badge or attention-grabbing pulse -- unnecessary for single-user app checked periodically

</deferred>

---

*Phase: 50-dashboard-warning-ui*
*Context gathered: 2026-03-26 via auto-context*
