# Phase 51: Navbar Warning Indicator - Research

**Researched:** 2026-03-26
**Domain:** React component UI (SyncStatus.tsx)
**Confidence:** HIGH

## Summary

Phase 51 is a purely client-side modification to a single 50-line React component (`SyncStatus.tsx`). The existing `sync.status` tRPC endpoint already returns a `warnings` array (added in Phase 49) and the component already queries it with 30-second auto-refetch. The work is adding a new conditional branch for `status === 'partial'` that renders an amber indicator with a `title` tooltip listing affected accounts.

No new libraries, no server changes, no new API calls. The Phase 50 dashboard already established the amber color palette (`text-amber-600`, `bg-amber-100`) for sync warnings.

**Primary recommendation:** Add a single `if (status.lastSync.status === 'partial')` branch to SyncStatus.tsx that renders an amber dot + sync time text with a `title` attribute showing affected account names from the existing `warnings` array.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- When `status.lastSync.status === 'partial'`, render an amber visual indicator alongside the existing "Last synced: X ago" text
- Indicator styled with `text-amber-400` to match amber theme on dark navbar
- Existing sync time text remains visible (additive, not replacement)
- `partial` status added as a new branch in the existing status-handling chain
- Hovering over the SyncStatus component when `partial` reveals a tooltip with count and names of affected accounts
- Tooltip content format: "N account(s) with sync issues: Account1, Account2"
- Use native HTML `title` attribute for tooltip (matches existing error state pattern)
- Account names from `status.warnings` array, mapped to `w.accountName`, joined with comma
- Empty warnings array fallback: "Some accounts had sync issues"
- When status is `success`, component renders exactly as before
- All changes contained within `SyncStatus.tsx` — no new component files
- No new imports needed

### Claude's Discretion
- Exact amber indicator visual (dot, circle, icon, or styled text prefix)
- Exact Tailwind classes for the indicator element
- Whether to wrap the partial-state return in an additional container element or keep existing span structure
- Spacing between amber indicator and sync time text

### Deferred Ideas (OUT OF SCOPE)
- Agent tool updates — Phase 52
- Click-to-navigate from navbar indicator to dashboard
- Custom tooltip component
- Animated pulse effect
- Per-account staleness indicator (STALE-01)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NAV-01 | Navbar SyncStatus shows amber warning indicator when latest sync is 'partial' | New `if` branch in SyncStatus.tsx renders amber dot + text when `status.lastSync.status === 'partial'` |
| NAV-02 | Navbar warning indicator includes tooltip showing count and names of affected accounts | `title` attribute on the partial-state span using `status.warnings` array data |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19 | Component rendering | Already in use |
| TanStack Query | 5 | Data fetching (useQuery) | Already in use |
| Tailwind CSS | 4 | Styling | Already in use |

No new libraries required. All tools already present in the project.

## Architecture Patterns

### Existing SyncStatus Branch Pattern
The component uses early-return conditional rendering:

```typescript
// Line 26: null guard
if (!status) return null;

// Line 28: no sync history
if (!status.lastSync) return <span>Never synced</span>;

// Line 32: currently syncing
if (status.lastSync.status === 'running') return <span className="text-blue-300">Syncing...</span>;

// Line 36: error state (uses title attribute for tooltip)
if (status.lastSync.status === 'error') return (
  <span className="text-red-400" title={errorMessage}>Sync error: {errorMessage}</span>
);

// Line 44: default success
return <span className="text-gray-400">Last synced: {time}</span>;
```

The new `partial` branch slots between the `error` check and the default `success` return.

### Title Attribute Tooltip Pattern
Already established in the error state (line 38):
```typescript
<span className="text-sm text-red-400" title={status.lastSync.errorMessage ?? undefined}>
```

The partial state follows this exact pattern with warning account names.

### Amber Color Palette (from Phase 50)
Dashboard uses: `text-amber-600`, `bg-amber-100`, `text-amber-700`
Navbar needs lighter amber for dark background: `text-amber-400`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tooltip | Custom tooltip component | Native `title` attribute | Matches existing pattern, single use case |
| Warning icon | SVG icon component | Unicode dot or inline element | Minimal visual indicator, no icon library needed |

## Common Pitfalls

### Pitfall 1: Forgetting the Empty Warnings Array
**What goes wrong:** `status.warnings` could be empty even when status is `partial` (race condition)
**Why it happens:** Status and warnings may update at slightly different times
**How to avoid:** Check `warnings.length > 0` before building account list, fallback to generic message
**Warning signs:** Tooltip shows "0 account(s) with sync issues: " with trailing separator

### Pitfall 2: Branch Order Matters
**What goes wrong:** Placing `partial` check after the default return means it never executes
**Why it happens:** The default case at line 44 has no condition guard — it catches everything
**How to avoid:** Place `partial` check BEFORE the default success return, AFTER the error check

### Pitfall 3: Text Contrast on Dark Navbar
**What goes wrong:** Using `text-amber-600` (dashboard palette) on dark navbar = poor contrast
**Why it happens:** Dashboard has white background, navbar has dark background
**How to avoid:** Use `text-amber-400` for navbar (lighter shade for dark backgrounds)

## Code Examples

### sync.status Response Shape (from tRPC router)
```typescript
{
  lastSync: {
    startedAt: string;
    completedAt: string | null;
    status: string;  // 'success' | 'partial' | 'error' | 'running'
    errorMessage: string | null;
    accountsSynced: number;
    transactionsAdded: number;
  } | null;
  errorCount: number;
  accounts: Array<{ id: string; name: string; balance: number; lastSynced: string | null; source: string }>;
  warnings: Array<{
    accountId: string;
    accountName: string;
    errorCode: string;
    message: string;
    lastSeen: string;
  }>;
}
```

### Partial Branch Implementation Pattern
```typescript
if (status.lastSync.status === 'partial') {
  const syncTime = status.lastSync.completedAt || status.lastSync.startedAt;
  const warningCount = status.warnings.length;
  const tooltip = warningCount > 0
    ? `${warningCount} account(s) with sync issues: ${status.warnings.map(w => w.accountName).join(', ')}`
    : 'Some accounts had sync issues';

  return (
    <span className="text-sm text-amber-400" title={tooltip}>
      {/* amber dot indicator */} Last synced: {formatRelativeTime(syncTime)}
    </span>
  );
}
```

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `packages/client/src/components/SyncStatus.tsx` (50 lines)
- Codebase inspection: `packages/server/src/sync/trpc-router.ts` (sync.status endpoint, lines 80-136)
- Phase 50 implementation: `packages/client/src/pages/DashboardPage.tsx` (amber color palette)
- Phase 49 implementation: warnings array in sync.status response

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all existing
- Architecture: HIGH - follows established component pattern exactly
- Pitfalls: HIGH - identified from direct code inspection

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable codebase patterns)
