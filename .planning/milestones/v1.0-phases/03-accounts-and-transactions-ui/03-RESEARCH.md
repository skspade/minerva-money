# Phase 3: Accounts and Transactions UI - Research

**Researched:** 2026-03-22
**Domain:** React SPA with tRPC + TanStack Query data fetching
**Confidence:** HIGH

## Summary

Phase 3 bootstraps the React frontend from a bare `main.ts` into a full SPA with tRPC-powered data fetching, client-side routing, and Tailwind styling. The existing server already exposes `sync.status` and `sync.trigger` tRPC procedures on a v11 `@trpc/server` instance, with a Vite proxy at `/trpc` already configured. The client needs React, tRPC client v11, TanStack Query v5, React Router v7, and Tailwind CSS v4.

The key integration pattern is tRPC v11's `@trpc/tanstack-react-query` package which provides `createTRPCContext()` to generate a typed `TRPCProvider` and `useTRPC` hook. Combined with TanStack Query's `useQuery`/`useMutation` and query invalidation, this gives end-to-end type-safe data fetching with cache management. React Router v7 in library mode (BrowserRouter) handles client-side navigation with no SSR complexity.

**Primary recommendation:** Use tRPC v11's `createTRPCContext` + `@trpc/tanstack-react-query` for the React integration, React Router v7 BrowserRouter for routing, and Tailwind CSS v4 via `@tailwindcss/vite` plugin.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- React with Tailwind CSS for custom components
- tRPC client connected to the Express backend via `/trpc` proxy already configured in Vite
- TanStack Query as the data-fetching and cache layer
- React Router for client-side navigation between accounts and transactions pages
- Single persistent layout with navigation bar containing links to Accounts, Transactions, and a sync status indicator
- Vite config updated to include the React plugin for JSX support
- Account list grouped by type: banking accounts first, then investment accounts
- Investment accounts show balance only with no clickable drill-down to transactions
- All balances displayed as formatted currency strings converted from integer cents
- Each banking account shows name, institution, current balance, and last synced time
- Table layout with columns: date, payee, amount, account, and category
- Category column shows empty/uncategorized placeholder until Phase 4
- Client-side filtering by date range, payee, amount, and category without page reload
- Date range filter using two date inputs (start and end)
- Payee/memo search box filters as the user types with debounced input
- Default sort by date descending, with clickable column headers to change sort column and direction
- Amounts formatted as currency with negative values for debits
- Fetch all transactions from the server and filter client-side
- Add `accounts.list` query returning all accounts with balance, type, institution, and last synced time
- Add `transactions.list` query returning all transactions with joined account name
- Extend the existing `appRouter` with new account and transaction routers
- Service layer pattern: tRPC routers call data access queries
- "Sync Now" button triggers the existing `sync.trigger` tRPC mutation
- Sync status indicator displays last sync time and error messages in plain language
- After sync completes, invalidate TanStack Query cache for accounts and transactions
- Sync button shows a loading/spinner state while sync is in progress
- Sync status visible in the app layout so it persists across page navigation
- Tailwind CSS utility classes for all styling, no component library
- Loading skeleton or spinner states for initial data fetches
- Error states displayed inline when tRPC queries fail

### Claude's Discretion
- Exact Tailwind color palette and spacing scale choices
- Whether navigation is a sidebar or top bar
- Exact debounce delay for search input (150-300ms range)
- Internal component file structure (flat vs nested directories)
- Whether to use a formatting utility or inline cents-to-dollars conversion
- Exact loading indicator style (skeleton, spinner, or progress bar)
- Column width proportions in the transactions table

### Deferred Ideas (OUT OF SCOPE)
- Category assignment and display (Phase 4)
- Transaction splits across categories (Phase 4)
- Manual transaction entry (Phase 4)
- Transfer detection and exclusion from reports (Phase 6)
- Dashboard landing page with spending categories and trends (Phase 9)
- Server-side pagination or virtual scrolling
- Transaction detail view or expandable rows
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ACCT-01 | User can view all linked accounts with current balances | Accounts page with `accounts.list` tRPC query, currency formatting from cents |
| ACCT-03 | App displays investment accounts as balance-only for net worth | Account type field filtering, no transaction drill-down link for investment type |
| ACCT-04 | User can view transaction list with filtering by date, payee, amount, and category | Transactions page with client-side filtering, TanStack Query for data fetching |
| ACCT-05 | User can search transactions by payee or memo text | Debounced search input filtering client-side transaction array |
| SYNC-03 | User can trigger a manual sync via "Sync Now" button | `sync.trigger` mutation with TanStack Query `useMutation` and cache invalidation |
| SYNC-04 | App displays sync status indicator showing last sync time and errors | `sync.status` query in persistent layout component |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | ^19.0 | UI framework | Current stable, required by project constraints |
| react-dom | ^19.0 | DOM rendering | Required by React |
| @trpc/client | ^11.14 | tRPC client for type-safe API calls | Matches server `@trpc/server` v11 |
| @trpc/tanstack-react-query | ^11.14 | React integration for tRPC with TanStack Query | Official tRPC v11 React bindings using `createTRPCContext` |
| @tanstack/react-query | ^5.90 | Server state management and caching | Project constraint; pairs with tRPC |
| react-router | ^7.9 | Client-side routing | Current stable; library mode with BrowserRouter |
| tailwindcss | ^4.0 | Utility-first CSS | Project constraint |
| @tailwindcss/vite | ^4.0 | Tailwind Vite plugin | Official Tailwind v4 Vite integration |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vitejs/plugin-react | ^4.3 | React JSX transform in Vite | Required for .tsx files in Vite |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-router BrowserRouter | TanStack Router | More features but unnecessary complexity for 3 routes |
| Native date inputs | date-fns + date picker lib | Native inputs sufficient for single-user; avoids dependency |
| Inline cents formatting | currency.js library | Simple division by 100 + toLocaleString is sufficient |

**Installation (client package):**
```bash
npm install react react-dom @trpc/client @trpc/tanstack-react-query @tanstack/react-query react-router tailwindcss @tailwindcss/vite
npm install -D @vitejs/plugin-react @types/react @types/react-dom
```

## Architecture Patterns

### Recommended Client Structure
```
packages/client/src/
├── main.tsx              # React root, providers (tRPC, QueryClient, Router)
├── app.tsx               # BrowserRouter, Routes, Layout
├── trpc.ts               # createTRPCContext + useTRPC export
├── components/
│   ├── Layout.tsx        # Persistent nav + sync status + <Outlet />
│   ├── SyncStatus.tsx    # Sync indicator (last sync, errors)
│   └── SyncButton.tsx    # Sync Now button with loading state
├── pages/
│   ├── AccountsPage.tsx  # Account list grouped by type
│   └── TransactionsPage.tsx # Table with filters and search
├── lib/
│   └── format.ts         # Currency formatting (cents to display string)
└── styles/
    └── app.css           # @import "tailwindcss"
```

### Pattern 1: tRPC v11 React Integration with createTRPCContext
**What:** tRPC v11 uses `createTRPCContext` from `@trpc/tanstack-react-query` to create a `TRPCProvider` and `useTRPC` hook. Components use `useTRPC().sync.status.useQuery()` for type-safe queries.
**When to use:** All tRPC data fetching in React components.
**Example:**
```typescript
// Source: Context7 - trpc.io/docs/client/tanstack-react-query/setup
// trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@minerva/server';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { TRPCProvider } from './trpc';

function App() {
  const queryClient = new QueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: '/trpc' })],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <Router />
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

### Pattern 2: Query Invalidation After Sync
**What:** After `sync.trigger` mutation succeeds, invalidate accounts and transactions queries so they refetch automatically.
**When to use:** Sync Now button.
**Example:**
```typescript
// Source: Context7 - TanStack Query invalidations-from-mutations
import { useTRPC } from '../trpc';
import { useMutation, useQueryClient } from '@tanstack/react-query';

function SyncButton() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const sync = useMutation(trpc.sync.trigger.mutationOptions({
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.accounts.list.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.transactions.list.queryKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.sync.status.queryKey() }),
      ]);
    },
  }));

  return (
    <button onClick={() => sync.mutate()} disabled={sync.isPending}>
      {sync.isPending ? 'Syncing...' : 'Sync Now'}
    </button>
  );
}
```

### Pattern 3: React Router v7 Library Mode
**What:** BrowserRouter with `<Routes>` and `<Route>` for simple client-side navigation. Layout component uses `<Outlet />` for nested routes.
**When to use:** All page routing.
**Example:**
```typescript
// Source: Context7 - reactrouter.com/start/declarative/routing
import { BrowserRouter, Routes, Route } from 'react-router';
import Layout from './components/Layout';
import AccountsPage from './pages/AccountsPage';
import TransactionsPage from './pages/TransactionsPage';

function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<AccountsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

### Anti-Patterns to Avoid
- **Fetching inside useEffect:** Use tRPC + TanStack Query hooks, never raw fetch in useEffect
- **Prop-drilling tRPC client:** Use the `useTRPC()` hook from createTRPCContext, not prop passing
- **Manual cache management:** Use query invalidation, not manual setQueryData after mutations
- **Tailwind @apply everywhere:** Use utility classes directly; @apply defeats the purpose

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API client | Custom fetch wrapper | tRPC client + httpBatchLink | End-to-end type safety, batching, error handling |
| Server state cache | useState + useEffect | TanStack Query | Stale-while-revalidate, refetch on focus, cache invalidation |
| Currency formatting | Manual string building | `(cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })` | Handles negatives, thousands separators, decimal places correctly |
| Debounce | Custom setTimeout logic | Simple inline debounce with useRef + setTimeout | Only need one debounced input; no library needed for this |

**Key insight:** The tRPC + TanStack Query combination handles all data fetching complexity. Every API call is type-checked at build time, cached automatically, and invalidated declaratively.

## Common Pitfalls

### Pitfall 1: tRPC Version Mismatch
**What goes wrong:** Client @trpc/client version doesn't match server @trpc/server version, causing runtime type errors or missing features.
**Why it happens:** npm installs latest by default; server is pinned at ^11.14.1.
**How to avoid:** Pin `@trpc/client` and `@trpc/tanstack-react-query` to same major.minor as server (`^11.14`).
**Warning signs:** TypeScript errors about missing properties on tRPC hooks.

### Pitfall 2: React Router v7 Import Path
**What goes wrong:** Importing from `react-router-dom` instead of `react-router` (v7 consolidated packages).
**Why it happens:** Most tutorials/examples still reference v6 patterns with `react-router-dom`.
**How to avoid:** Import everything from `react-router` (not `react-router-dom`). In v7, there is only one package.
**Warning signs:** Module not found errors for `react-router-dom`.

### Pitfall 3: Tailwind CSS v4 Config Approach
**What goes wrong:** Creating a `tailwind.config.js` file (v3 pattern) instead of using the Vite plugin.
**Why it happens:** Most existing tutorials describe v3 setup.
**How to avoid:** Use `@tailwindcss/vite` plugin in vite.config.ts and `@import "tailwindcss"` in CSS. No config file needed for v4.
**Warning signs:** Tailwind classes not being applied despite correct class names.

### Pitfall 4: Forgetting Vite React Plugin
**What goes wrong:** JSX/TSX files fail to compile.
**Why it happens:** Vite doesn't transform JSX by default; needs `@vitejs/plugin-react`.
**How to avoid:** Add `react()` plugin to vite.config.ts alongside the tailwind plugin.
**Warning signs:** `Unexpected token <` errors in .tsx files.

### Pitfall 5: Integer Cents Display
**What goes wrong:** Displaying raw integer cents (e.g., "154300" instead of "$1,543.00").
**Why it happens:** Database stores amounts as integer cents (INFR-04); forgetting to convert on display.
**How to avoid:** Create a single `formatCurrency(cents: number)` utility and use it everywhere.
**Warning signs:** Dollar amounts that look like thousands of dollars.

### Pitfall 6: Client TypeScript Path Resolution
**What goes wrong:** Import `AppRouter` from server package fails at runtime.
**Why it happens:** The client needs to reference the server's type via workspace package reference, but only needs the TYPE (not runtime import).
**How to avoid:** Use `import type { AppRouter } from '@minerva/server'` — the `type` keyword ensures it's erased at runtime. The workspace reference in tsconfig handles type resolution.
**Warning signs:** Vite bundling the server code into the client.

## Code Examples

### Currency Formatting Utility
```typescript
// packages/client/src/lib/format.ts
export function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}
```

### Debounced Search Input
```typescript
// Inline debounce pattern — no library needed
import { useState, useRef, useCallback } from 'react';

function useDebounce<T>(initialValue: T, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const setValue = useCallback((value: T) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedValue(value), delay);
  }, [delay]);

  return [debouncedValue, setValue] as const;
}
```

### Client-Side Column Sorting
```typescript
type SortDirection = 'asc' | 'desc';
type SortColumn = 'date' | 'payee' | 'amount' | 'account';

function sortTransactions(
  transactions: Transaction[],
  column: SortColumn,
  direction: SortDirection,
) {
  return [...transactions].sort((a, b) => {
    const aVal = a[column];
    const bVal = b[column];
    const cmp = typeof aVal === 'string'
      ? aVal.localeCompare(bVal as string)
      : (aVal as number) - (bVal as number);
    return direction === 'asc' ? cmp : -cmp;
  });
}
```

### Vite Config with React + Tailwind
```typescript
// packages/client/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/trpc': 'http://localhost:3001',
    },
    fs: {
      allow: ['..'],
    },
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@trpc/react-query` (v10) | `@trpc/tanstack-react-query` + `createTRPCContext` (v11) | tRPC v11 (2024) | New hook pattern: `useTRPC().router.procedure.useQuery()` |
| `react-router-dom` v6 | `react-router` v7 (single package) | React Router v7 (2024) | All imports from `react-router`, no separate `-dom` package |
| `tailwind.config.js` (v3) | `@tailwindcss/vite` plugin + `@import "tailwindcss"` (v4) | Tailwind v4 (2025) | No config file needed; Vite plugin handles everything |
| `createTRPCReact` | `createTRPCContext` | tRPC v11 | Returns `{ TRPCProvider, useTRPC }` instead of hook object |

**Deprecated/outdated:**
- `@trpc/react-query`: Replaced by `@trpc/tanstack-react-query` in v11
- `react-router-dom`: Merged into `react-router` in v7
- `tailwind.config.js`: Not needed in Tailwind v4 with Vite plugin

## Open Questions

1. **TypeScript project references for client importing server types**
   - What we know: The client tsconfig already references `../shared`. It needs access to `AppRouter` type from server.
   - What's unclear: Whether the workspace package reference `@minerva/server` resolves types correctly without building server first.
   - Recommendation: Use `import type { AppRouter } from '../../server/src/sync/trpc-router.js'` as a direct path if workspace resolution fails. Test during implementation.

## Sources

### Primary (HIGH confidence)
- Context7 /websites/trpc_io - tRPC v11 React client setup, createTRPCContext, httpBatchLink
- Context7 /tanstack/query v5.90.3 - QueryClientProvider, useQuery, useMutation, invalidateQueries
- Context7 /websites/reactrouter - React Router v7 BrowserRouter, Routes, Route
- tailwindcss.com/docs/installation/using-vite - Tailwind v4 Vite plugin setup

### Secondary (MEDIUM confidence)
- Existing codebase analysis: trpc-router.ts (AppRouter type), trpc.ts (Context type), vite.config.ts (proxy), index.ts (Express mount)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via Context7 official docs
- Architecture: HIGH - tRPC v11 + TanStack Query integration pattern well-documented
- Pitfalls: HIGH - Version migration pitfalls verified against current docs

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable ecosystem, 30 days)
