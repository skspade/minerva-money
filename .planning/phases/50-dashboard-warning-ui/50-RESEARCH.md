# Phase 50: Dashboard Warning UI - Research

**Researched:** 2026-03-26
**Domain:** React/Tailwind client-side UI modification
**Confidence:** HIGH

## Summary

Phase 50 is a purely client-side modification to `DashboardPage.tsx`. The `sync.status` tRPC endpoint already returns a `warnings` array (Phase 49) with `{ accountId, accountName, errorCode, message, lastSeen }` per entry, and the `lastSync.status` field already includes `'partial'` as a value (Phase 48). No new dependencies, hooks, queries, or server changes are needed.

The work consists of three additions to the existing Sync Status card: (1) extending the two-way status color ternary to three-way (green/amber/red), (2) rendering a warning list when `warnings.length > 0`, and (3) showing a SimpleFIN reconnect link when connection-type errors are present.

**Primary recommendation:** Modify `DashboardPage.tsx` inline -- the changes are small enough (~40 lines) that extracting a separate component is unnecessary.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **DASH-01 Badge**: Amber badge (`bg-amber-100 text-amber-700`) next to status when `partial`, three-way color: success->green, partial->amber, error->red
- **DASH-02 Error List**: Warning section below sync stats, amber container (`bg-amber-50 border border-amber-200 rounded`), account names in medium weight, messages in normal weight
- **DASH-03 Reconnect Link**: Match error codes containing "auth", "connection", or "institution" (case-insensitive); link to `https://bridge.simplefin.org/simplefin/my-connections`; anchor with `target="_blank" rel="noopener noreferrer"`; text "Reconnect at SimpleFIN"
- **DASH-04 No Regression**: When warnings empty, card renders identically to before; use `{warnings.length > 0 && ...}` pattern
- **Placement**: Warning section between sync stats and error message box; reconnect link at bottom of warning section

### Claude's Discretion
- Exact Tailwind spacing classes between warning items
- Whether to truncate long error messages or let them wrap
- Whether to show occurrence_count
- Whether to extract warning section into a helper component

### Deferred Ideas (OUT OF SCOPE)
- Navbar amber warning indicator (Phase 51)
- Agent tool updates (Phase 52)
- Per-account staleness indicator (STALE-01)
- Warning dismiss/acknowledge button
- Animated badge or attention-grabbing pulse
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | Dashboard sync card shows amber "Partial" badge when sync status is 'partial' | Extend existing ternary on line 214-215 of DashboardPage.tsx to three-way; add pill badge matching "Manual" badge pattern on lines 103-105 |
| DASH-02 | Dashboard displays per-account error list with account name and simplified error message | `syncStatus.warnings` array already available from TanStack Query; render conditionally with `{warnings.length > 0 && ...}` |
| DASH-03 | Dashboard shows SimpleFIN reconnect link when connection errors exist | Filter warnings by errorCode containing "auth", "connection", or "institution"; render anchor to SimpleFIN bridge URL |
| DASH-04 | Dashboard sync card displays cleanly when no warnings exist (no visual regression) | Use conditional rendering pattern; no wrapper elements when warnings array is empty |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19 | Component rendering | Already in use throughout client |
| Tailwind CSS | 4 | Utility-first styling | Already in use throughout client |
| TanStack Query | 5 | Server state management | Already provides `syncStatus` data |

### Supporting
No additional libraries needed. All data is already available via the existing `sync.status` query.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline JSX | Extract `<SyncWarnings>` component | Overkill for ~30 lines; keep inline per CONTEXT.md discretion |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Current Sync Card Structure (lines 182-267)
```
<div> (card container)
  <div> (header: "Sync Status" + "Sync Now" button)
  {loading state}
  {no-sync state}
  {sync-data state}
    <div> (stats rows: last sync, status, accounts synced, transactions added)
    {errorMessage && <div> (red error box)}
    {syncMut.isError && <div> (red mutation error box)}
  <div> (backup section, border-t separator)
```

### Modified Structure (after Phase 50)
```
<div> (card container)
  <div> (header: "Sync Status" + "Sync Now" button)
  {loading state}
  {no-sync state}
  {sync-data state}
    <div> (stats rows: last sync, status + amber badge, accounts synced, transactions added)
    {warnings.length > 0 && <div> (amber warning section)      ← NEW
      {warnings.map(...) per-account rows}                      ← NEW
      {hasConnectionErrors && <a> reconnect link}               ← NEW
    }                                                           ← NEW
    {errorMessage && <div> (red error box)}
    {syncMut.isError && <div> (red mutation error box)}
  <div> (backup section, border-t separator)
```

### Pattern: Three-Way Status Color
```typescript
// Current (line 214-215):
syncStatus.lastSync.status === 'success' ? 'text-green-600' : 'text-red-600'

// After:
syncStatus.lastSync.status === 'success' ? 'text-green-600' :
syncStatus.lastSync.status === 'partial' ? 'text-amber-600' : 'text-red-600'
```

### Pattern: Amber Badge (matching existing Manual badge)
```typescript
// Existing Manual badge (lines 103-105):
<span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
  Manual
</span>

// Amber Partial badge:
<span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
  Partial
</span>
```

### Pattern: Connection Error Detection
```typescript
const hasConnectionErrors = syncStatus.warnings.some(w =>
  /auth|connection|institution/i.test(w.errorCode)
);
```

### Anti-Patterns to Avoid
- **Wrapping in empty container**: Don't render an empty `<div>` when warnings are absent -- use `{condition && <JSX>}` not `<div>{condition ? <JSX> : null}</div>`
- **New data fetching**: Don't create a separate query for warnings -- they're already in `syncStatus.warnings`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Status color logic | Switch statement or lookup table | Ternary chain | Consistent with existing pattern, only 3 values |

## Common Pitfalls

### Pitfall 1: Capitalization of Status Text
**What goes wrong:** Displaying raw "partial" string from API
**Why it happens:** Status stored as lowercase in DB
**How to avoid:** Capitalize display: use CSS `capitalize` class or template literal
**Warning signs:** Status shows as lowercase "partial" vs "Partial"

### Pitfall 2: Layout Shift When Warnings Appear
**What goes wrong:** Card height jumps when warnings section appears/disappears
**Why it happens:** Conditional rendering adds content
**How to avoid:** This is acceptable -- the card already changes height based on error state. No fix needed.

### Pitfall 3: Missing rel Attribute on External Link
**What goes wrong:** Security risk with `target="_blank"` without `rel="noopener noreferrer"`
**Why it happens:** Easy to forget
**How to avoid:** Always pair `target="_blank"` with `rel="noopener noreferrer"`

## Code Examples

### Warning Section (verified pattern from codebase)
```typescript
// Placed between stats rows and errorMessage box
{syncStatus.warnings.length > 0 && (
  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded">
    <div className="space-y-1">
      {syncStatus.warnings.map(w => (
        <div key={w.accountId} className="flex justify-between text-sm">
          <span className="font-medium text-amber-800">{w.accountName}</span>
          <span className="text-amber-700">{w.message}</span>
        </div>
      ))}
    </div>
    {hasConnectionErrors && (
      <a
        href="https://bridge.simplefin.org/simplefin/my-connections"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-sm text-amber-700 underline hover:text-amber-900"
      >
        Reconnect at SimpleFIN ↗
      </a>
    )}
  </div>
)}
```

## State of the Art

No version changes or deprecations relevant. React 19 and Tailwind 4 are the current versions already in use.

## Open Questions

None -- all decisions are locked in CONTEXT.md and all required data is already available from Phase 49.

## Sources

### Primary (HIGH confidence)
- `packages/client/src/pages/DashboardPage.tsx` -- current sync card implementation (lines 182-267)
- `packages/server/src/sync/trpc-router.ts` -- warnings response shape (lines 107-134)
- `.planning/phases/50-dashboard-warning-ui/50-CONTEXT.md` -- locked user decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, existing codebase patterns
- Architecture: HIGH - modifying 1 file with well-documented existing structure
- Pitfalls: HIGH - straightforward UI change with minimal risk

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable, no external dependencies)
