# Phase 51: Navbar Warning Indicator - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

User is alerted to sync problems from any page without navigating to the dashboard. This phase modifies the existing `SyncStatus` navbar component to show an amber warning indicator when the latest sync status is `partial`, and adds a hover tooltip listing the count and names of affected accounts. No server changes -- purely client-side updates to `SyncStatus.tsx`, consuming the `warnings` array already returned by `sync.status` (Phase 49).

</domain>

<decisions>
## Implementation Decisions

### Amber Warning Indicator (NAV-01)
- When `status.lastSync.status === 'partial'`, render an amber visual indicator alongside the existing "Last synced: X ago" text
- Indicator is a small amber dot or icon preceding the sync text, styled with `text-amber-400` to match the amber theme established in Phase 50's dashboard warning UI
- The existing text remains visible ("Last synced: X ago") so the user still knows when the last sync happened -- the amber indicator is additive, not a replacement (Claude's Decision: preserving sync time info is more useful than replacing it with a "Partial" label, which the dashboard already shows)
- The `partial` status case is added as a new branch in the existing status-handling chain (after `running`, after `error`, before the default `success` fallback)

### Hover Tooltip (NAV-02)
- Hovering over the SyncStatus component when status is `partial` reveals a tooltip showing affected account count and names
- Tooltip content format: "N account(s) with sync issues: Account1, Account2" (Claude's Decision: compact single-line format suits a navbar tooltip without requiring a multi-line popover)
- Use the native HTML `title` attribute on the wrapper element for the tooltip (Claude's Decision: matches the existing pattern in SyncStatus where the error state already uses `title` attribute on the span for the error message; avoids introducing a custom tooltip component for a single use case)
- Account names are sourced from `status.warnings` array -- map to `w.accountName` and join with comma separator
- When `warnings` array is empty despite `partial` status (edge case), tooltip falls back to "Some accounts had sync issues" (Claude's Decision: defensive handling for race condition between status and warnings data)

### No-Warning State
- When status is `success` (no warnings), the component renders exactly as before -- no amber indicator, no tooltip changes
- The existing `running`, `error`, and `null` state branches remain unchanged

### Component Structure
- All changes are contained within `SyncStatus.tsx` -- no new component files (Claude's Decision: the tooltip is a title attribute and the indicator is a small inline element; does not warrant component extraction)
- No new imports needed -- the component already has access to the full `sync.status` response including the `warnings` array from Phase 49

### Claude's Discretion
- Exact amber indicator visual (dot, circle, icon, or styled text prefix)
- Exact Tailwind classes for the indicator element
- Whether to wrap the partial-state return in an additional container element or keep the existing span structure
- Spacing between the amber indicator and the sync time text

</decisions>

<specifics>
## Specific Ideas

- The `sync.status` response already includes `warnings` as an array of `{ accountId, accountName, errorCode, message, lastSeen }` (Phase 49)
- The SyncStatus component already queries `sync.status` with a 30-second refetch interval (line 22-24), so warnings data is already available without additional queries
- The existing error state (line 36-42) uses `title` attribute for hover detail -- the partial state tooltip follows this same pattern
- The navbar renders SyncStatus in a flex container with gap-3 alongside the SyncButton (Layout.tsx line 97-100)
- There are only ~10 accounts across 3 institutions, so the tooltip account list will be short (typically 1-3 names)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/client/src/components/SyncStatus.tsx`: The sole modification target. 50-line component with status-based conditional rendering and 30s auto-refetch. Already has access to the full `sync.status` response including `warnings` array.
- `packages/client/src/pages/DashboardPage.tsx` lines 236-258: Phase 50's amber warning section provides the established amber color palette (`text-amber-600`, `bg-amber-100`, `text-amber-700`) for consistency.

### Established Patterns
- Status branching: SyncStatus uses early returns for each status (`running` -> blue, `error` -> red with title tooltip, default -> gray). The `partial` case slots in as a new branch.
- Title attribute tooltips: The error state at line 38 uses `title={status.lastSync.errorMessage}` for hover detail -- the same pattern applies for partial warnings.
- Amber color scheme: Phase 50 established `text-amber-600`/`bg-amber-100`/`text-amber-700` for sync warning UI. The navbar indicator should use amber-400 for the dark navbar background (lighter amber for contrast against dark gray).
- Inline span rendering: All SyncStatus return branches render a single `<span>` with `text-sm` -- the partial branch follows this convention.

### Integration Points
- `packages/client/src/components/Layout.tsx` line 98: Renders `<SyncStatus />` in the navbar -- no changes needed in Layout
- `packages/client/src/components/SyncStatus.tsx` line 21-24: The `status` variable from `useQuery` already includes `warnings` via tRPC type inference from Phase 49
- No new data fetching, hooks, imports, or component registrations required

</code_context>

<deferred>
## Deferred Ideas

- Agent tool updates to include warnings in get_sync_status -- Phase 52
- Click-to-navigate from navbar indicator to dashboard sync card (not required by NAV-01/NAV-02)
- Custom tooltip component with richer formatting (native title attribute sufficient for account list)
- Animated pulse or attention-grabbing effect on the amber indicator (unnecessary for single-user app)
- Per-account staleness indicator (STALE-01) -- deferred future requirement

</deferred>

---

*Phase: 51-navbar-warning-indicator*
*Context gathered: 2026-03-26 via auto-context*
