# Phase 3: Accounts and Transactions UI - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users can see their accounts, balances, and full transaction history in the browser, and control sync from the UI. This phase delivers: the React app shell with tRPC client and TanStack Query wiring, an accounts page with balances grouped by type (investment accounts as balance-only), a transactions page with sortable columns, filtering by date/payee/amount/category, live search by payee or memo, and sync status controls including a "Sync Now" button and last-sync indicator with error display.

</domain>

<decisions>
## Implementation Decisions

### React App Shell and Routing
- React with Tailwind CSS for custom components (from PROJECT.md constraints)
- tRPC client connected to the Express backend via `/trpc` proxy already configured in Vite (from existing `vite.config.ts` proxy)
- TanStack Query as the data-fetching and cache layer (from PROJECT.md constraints -- "tRPC + TanStack Query")
- React Router for client-side navigation between accounts and transactions pages (Claude's Decision: simplest mainstream router for a multi-page SPA with no SSR requirement)
- Single persistent layout with a sidebar or top navigation bar containing links to Accounts, Transactions, and a sync status indicator (Claude's Decision: persistent nav ensures sync status is always visible regardless of current page)
- Vite config updated to include the React plugin for JSX support (Claude's Decision: required for React JSX transformation in Vite)

### Accounts Page
- Account list grouped by type: banking accounts first, then investment accounts (from ACCT-01 and ACCT-03)
- Investment accounts show balance only with no clickable drill-down to transactions (from success criteria 1)
- All balances displayed as formatted currency strings converted from integer cents (from INFR-04 -- money stored as integer cents)
- Each banking account shows name, institution, current balance, and last synced time (from ACCT-01 and sync.status tRPC response)
- Use a simple card or list layout for accounts, one card per account (Claude's Decision: cards provide clear visual separation per account without overengineering a table for a small account count)

### Transactions Page
- Table layout with columns: date, payee, amount, account, and category (from success criteria 2)
- Category column shows empty/uncategorized placeholder until Phase 4 adds categorization (from ROADMAP plan 03-03)
- Client-side filtering by date range, payee, amount, and category without page reload (from success criteria 3 and ACCT-04)
- Date range filter using two date inputs (start and end) (Claude's Decision: native HTML date inputs are sufficient for a single-user app; avoids adding a date picker library)
- Payee/memo search box filters as the user types with debounced input (from success criteria 4 and ACCT-05)
- Default sort by date descending, with clickable column headers to change sort column and direction (Claude's Decision: date-descending is the most natural default for financial transactions)
- Amounts formatted as currency with negative values for debits (Claude's Decision: standard accounting convention; negative amounts are already stored as negative integer cents)
- Fetch all transactions from the server and filter client-side (Claude's Decision: SQLite with a single user means the full transaction set is manageable in memory; avoids server-side pagination complexity for v1)

### tRPC Procedures for Accounts and Transactions
- Add `accounts.list` query returning all accounts with balance, type, institution, and last synced time (Claude's Decision: the existing sync.status query returns minimal account data; a dedicated accounts query supports the accounts page layout)
- Add `transactions.list` query returning all transactions with joined account name (Claude's Decision: transactions need account name for display in the account column)
- Extend the existing `appRouter` in `trpc-router.ts` with new account and transaction routers (from established pattern -- tRPC router composition)
- Service layer pattern: tRPC routers call data access queries (from ARCHITECTURE.md four-layer architecture)

### Sync Controls
- "Sync Now" button triggers the existing `sync.trigger` tRPC mutation (from SYNC-03 and success criteria 6)
- Sync status indicator displays last sync time and error messages in plain language (from SYNC-04 and success criteria 5)
- Status indicator uses the existing `sync.status` tRPC query (from Phase 2 implementation)
- After sync completes, invalidate TanStack Query cache for accounts and transactions to refresh data (Claude's Decision: TanStack Query cache invalidation is the standard pattern for post-mutation data refresh)
- Sync button shows a loading/spinner state while sync is in progress (Claude's Decision: prevents double-clicks and provides user feedback during the async operation)
- Sync status visible in the app layout so it persists across page navigation (Claude's Decision: matches success criteria -- sync status should always be accessible)

### Styling and Layout
- Tailwind CSS utility classes for all styling, no component library (from PROJECT.md constraints -- "custom components")
- Clean, minimal design appropriate for a personal finance tool (Claude's Decision: information density matters more than visual flair for a budgeting app)
- Responsive layout that works on desktop and tablet screen sizes (Claude's Decision: PROJECT.md says "web-only, accessed from any device on the network" which implies varying screen sizes)
- Loading skeleton or spinner states for initial data fetches (Claude's Decision: prevents layout shift and provides feedback while tRPC queries resolve)
- Error states displayed inline when tRPC queries fail (Claude's Decision: user needs to know when data cannot be loaded)

### Claude's Discretion
- Exact Tailwind color palette and spacing scale choices
- Whether navigation is a sidebar or top bar
- Exact debounce delay for search input (150-300ms range)
- Internal component file structure (flat vs nested directories)
- Whether to use a formatting utility or inline cents-to-dollars conversion
- Exact loading indicator style (skeleton, spinner, or progress bar)
- Column width proportions in the transactions table

</decisions>

<specifics>
## Specific Ideas

- The client package currently has a bare `main.ts` with no React -- this phase bootstraps the full React app from scratch
- The Vite proxy for `/trpc` is already configured in `packages/client/vite.config.ts`, pointing to `http://localhost:3001`
- The existing `sync.status` tRPC query already returns: `lastSync` (with startedAt, completedAt, status, errorMessage, accountsSynced, transactionsAdded), `errorCount`, and an `accounts` array (id, name, balance, last_synced)
- The existing `sync.trigger` tRPC mutation returns a `SyncResult` with `accountsSynced`, `transactionsAdded`, and `errors` array
- The `AppRouter` type is already exported from both `trpc-router.ts` and `index.ts` for client-side type inference
- Account type field in the database is a TEXT column -- investment accounts are identifiable by type value (set during SimpleFIN normalization)
- The transactions table has `payee`, `memo`, `date`, `amount`, `account_id`, and `category_id` columns; category_id will be NULL until Phase 4
- Three institutions in fixtures: Discover (banking + HELOC), Fidelity (investments), Consumers CU (banking)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `appRouter` and `AppRouter` type in `packages/server/src/sync/trpc-router.ts`: the tRPC router to extend with accounts and transactions procedures. `AppRouter` is the type the client uses for end-to-end type safety.
- `router` and `publicProcedure` from `packages/server/src/sync/trpc.ts`: tRPC initialization with Context type (db, rateLimiter, client). New routers use the same primitives.
- `Cents` type and `toCents()` in `packages/shared/src/types.ts`: branded type for money values. The client can import this for type-safe currency formatting.
- `sync.status` and `sync.trigger` procedures: already implemented and tested. The UI consumes these directly.
- Vite proxy configuration in `packages/client/vite.config.ts`: `/trpc` already proxied to the Express backend on port 3001.

### Established Patterns
- tRPC router composition: `syncRouter` is nested under `appRouter` via `router({ sync: syncRouter })`. New account/transaction routers follow the same nesting pattern.
- tRPC context provides `db`, `rateLimiter`, and `client`. Account and transaction queries only need `db`.
- Feature-based directory structure on server: `packages/server/src/sync/` contains all sync-related files. New account/transaction queries can be colocated or in separate feature directories.
- Express server exports `app` for testability; tRPC middleware is mounted at `/trpc`.
- The client package has React and TanStack Query listed as zero dependencies -- these need to be installed.

### Integration Points
- `packages/server/src/index.ts`: Express entry point where `appRouter` is mounted. The appRouter import path does not change, but the router itself gains new sub-routers.
- `packages/server/src/sync/trpc-router.ts`: the `appRouter` definition. New account and transaction routers are added here.
- `packages/server/src/sync/trpc.ts`: the tRPC context type. May need extension if new routers require additional context (unlikely for read-only queries).
- `packages/client/src/main.ts`: currently bare; becomes the React app entry point with createRoot, tRPC client, and QueryClientProvider.
- `packages/client/vite.config.ts`: needs the React Vite plugin added for JSX support.
- `packages/client/package.json`: needs React, React DOM, TanStack Query, tRPC client, and React Router as dependencies.

</code_context>

<deferred>
## Deferred Ideas

- Category assignment and display (Phase 4 -- CATG-01; category column renders as empty for now)
- Transaction splits across categories (Phase 4 -- CATG-06)
- Manual transaction entry (Phase 4 -- TXNR-01)
- Transfer detection and exclusion from reports (Phase 6)
- Dashboard landing page with spending categories and trends (Phase 9 -- REPT-01, REPT-02)
- Server-side pagination or virtual scrolling for large transaction sets (deferred unless performance becomes an issue; single-user app with reasonable transaction volume)
- Transaction detail view or expandable rows (not in success criteria; table columns are sufficient for Phase 3)

</deferred>

---

*Phase: 03-accounts-and-transactions-ui*
*Context gathered: 2026-03-22 via auto-context*
