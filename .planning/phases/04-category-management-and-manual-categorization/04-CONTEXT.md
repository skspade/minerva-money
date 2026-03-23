# Phase 4: Category Management and Manual Categorization - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users can organize spending into categories, assign categories to transactions by hand, split transactions across multiple categories, and enter manual transactions. This phase delivers: category groups and categories CRUD with reordering, a category picker on transaction rows, a split transaction modal with per-split amount validation, and a manual transaction entry form. Category assignments update the transaction list immediately via optimistic UI without full page reload.

</domain>

<decisions>
## Implementation Decisions

### Category and Category Group CRUD
- Category groups and categories tables already exist in the schema with `id`, `name`, `sort_order`, and `group_id` foreign key (from 001-initial-schema.sql)
- `category_groups` uses INTEGER PRIMARY KEY AUTOINCREMENT, `categories` references `group_id` with ON DELETE CASCADE
- CRUD operations: create, rename, reorder (update sort_order), and delete for both category groups and categories (from success criteria 1)
- Deleting a category group cascades to all its categories; deleting a category sets `category_id` to NULL on affected transactions (from ON DELETE SET NULL constraint on transactions.category_id)
- tRPC procedures for category CRUD added as a `categories` sub-router on `appRouter` (from established tRPC router composition pattern)
- Service layer functions in a new `packages/server/src/categories/` directory (Claude's Decision: follows established feature-based directory pattern from sync/ and backup/)
- Reorder uses integer sort_order values with gap-based numbering (Claude's Decision: simple integer swaps avoid fractional ordering complexity; renumbering on reorder keeps values clean)

### Manual Transaction Categorization
- Clicking a transaction row's category cell opens a dropdown/select to pick a category (from success criteria 2)
- Category dropdown groups options by category group for visual hierarchy (Claude's Decision: mirrors the group/category structure and helps users find categories quickly)
- Assigning a category calls a `transactions.updateCategory` tRPC mutation that sets `category_id` on the transaction row
- Use TanStack Query optimistic updates to reflect the category change immediately in the list (from success criteria 5)
- The transactions.list query must be updated to JOIN category name and group name for display (Claude's Decision: the current query already selects category_id; extending to JOIN categories and category_groups provides display-ready data)

### Transaction Splits
- A transaction can be split across multiple categories with custom amounts that sum to the transaction total (from success criteria 3 and CATG-06)
- Split data stored in a new `transaction_splits` table with columns: `id`, `transaction_id`, `category_id`, `amount` (INTEGER cents), `created_at` (Claude's Decision: separate table is the standard relational approach for one-to-many splits; keeps the transactions table clean)
- A new migration (002) creates the `transaction_splits` table with foreign keys to both transactions and categories (Claude's Decision: schema addition requires a migration file following the established PRAGMA user_version pattern)
- When a transaction is split, its `category_id` is set to NULL to indicate it is split rather than singly categorized (Claude's Decision: avoids ambiguity -- a transaction is either categorized or split, never both)
- Split modal enforces that split amounts sum exactly to the transaction total before saving (from success criteria 3)
- All split amounts are integer cents, validated server-side (from INFR-04 constraint)
- The transactions.list query detects splits and returns them alongside the transaction data (Claude's Decision: the client needs to know whether a transaction is split to display "Split" badge or individual split details)

### Manual Transaction Entry
- User can manually enter a transaction with amount, payee, date, category, and account (from success criteria 4 and TXNR-01)
- Manual transactions use a generated UUID as the `id` (not from SimpleFIN) (Claude's Decision: UUIDs distinguish manual entries from synced transactions which use SimpleFIN transactionIds)
- A `transactions.create` tRPC mutation inserts the new row; the `dedup_hash` is NULL for manual transactions (Claude's Decision: manual transactions have no SimpleFIN source to deduplicate against)
- Entry form validates: amount is non-zero, payee is non-empty, date is valid, account is selected (Claude's Decision: minimal validation matching the required fields in TXNR-01)
- After successful creation, invalidate the transactions query cache to show the new transaction (from established TanStack Query invalidation pattern)
- Manual transaction form is accessible from the transactions page (Claude's Decision: keeps the entry point close to where transactions are viewed, avoiding unnecessary navigation)

### Category Management UI
- Dedicated categories page or section for managing groups and categories (from ROADMAP plan 04-02)
- Inline rename: click category or group name to edit in place (from ROADMAP plan 04-02)
- Drag-to-reorder within groups and across groups (from ROADMAP plan 04-02)
- Delete with confirmation dialog to prevent accidental deletion (from ROADMAP plan 04-02)
- Add a "Categories" route to the app router and navigation (Claude's Decision: categories need their own page since CRUD management is a distinct workflow from transaction viewing)

### tRPC Router Structure
- New `categoriesRouter` with procedures: `groups.list`, `groups.create`, `groups.rename`, `groups.reorder`, `groups.delete`, `create`, `rename`, `reorder`, `delete` (Claude's Decision: flat procedure naming within the router keeps the API surface scannable)
- Extend `transactionsRouter` with: `updateCategory`, `createSplit`, `updateSplit`, `deleteSplit`, `create` (for manual entry) (Claude's Decision: transaction mutations belong on the existing transactions router)
- All mutations use the existing tRPC context with `db` access (from established pattern in trpc.ts)

### Claude's Discretion
- Exact drag-and-drop library choice for reordering (e.g., dnd-kit vs native HTML drag)
- Category dropdown component implementation details (custom vs native select)
- Split modal layout and input arrangement
- Manual transaction form layout (modal vs inline vs separate page section)
- Exact validation error message wording
- Whether category management page uses accordion or flat list for groups
- Internal naming of service functions and DAO methods

</decisions>

<specifics>
## Specific Ideas

- The `category_groups` table has `sort_order INTEGER NOT NULL DEFAULT 0` and `categories` has the same -- reorder operations update these values
- `transactions.category_id` has `ON DELETE SET NULL` so deleting a category gracefully uncategorizes affected transactions
- The existing `TransactionsPage.tsx` currently hardcodes "Uncategorized" text in the category column -- this becomes the real category display
- The `transactions.list` tRPC query already selects `t.category_id` -- extend the SQL JOIN to include `c.name as category_name` and `cg.name as group_name` via LEFT JOINs on categories and category_groups
- The `formatCurrency()` helper in `packages/client/src/lib/format.ts` handles cents-to-dollars display -- reuse for split amounts
- The app uses React Router with a `Layout` wrapper and `Outlet` -- add a `/categories` route alongside `/accounts` and `/transactions`
- The existing tRPC context type (`Context` in trpc.ts) provides `db` which is sufficient for all category operations -- no context extension needed

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `appRouter` in `packages/server/src/sync/trpc-router.ts`: extend with new `categories` sub-router and additional `transactions` mutations
- `router` and `publicProcedure` from `packages/server/src/sync/trpc.ts`: tRPC primitives for building new procedures
- `formatCurrency()` in `packages/client/src/lib/format.ts`: cents-to-currency formatting for split amounts and manual entry display
- `useTRPC()` hook in `packages/client/src/trpc.ts`: typed tRPC client hook for all new queries and mutations
- `TransactionsPage.tsx`: existing transactions table that needs category display and click-to-categorize interaction added
- `Layout.tsx`: app layout with navigation -- add Categories link
- `App.tsx`: React Router routes -- add `/categories` route

### Established Patterns
- tRPC router composition: sub-routers nested under `appRouter` via `router({ sync: syncRouter, accounts: accountsRouter, transactions: transactionsRouter })` -- add `categories: categoriesRouter`
- Feature-based server directory structure: `packages/server/src/sync/`, `packages/server/src/backup/`, `packages/server/src/db/` -- create `packages/server/src/categories/`
- TanStack Query for data fetching with `useQuery(trpc.X.queryOptions())` pattern on the client
- Tailwind CSS utility classes for all styling (no component library)
- Optimistic updates via TanStack Query mutation callbacks -- not yet used but the established cache invalidation pattern (from sync trigger) extends naturally

### Integration Points
- `packages/server/src/sync/trpc-router.ts`: the `appRouter` gains a `categories` sub-router and `transactionsRouter` gains mutation procedures
- `packages/server/migrations/`: new `002-transaction-splits.sql` migration for the splits table
- `packages/client/src/app.tsx`: add `/categories` route
- `packages/client/src/components/Layout.tsx`: add Categories navigation link
- `packages/client/src/pages/TransactionsPage.tsx`: replace hardcoded "Uncategorized" with category picker and split indicator

</code_context>

<deferred>
## Deferred Ideas

- Categorization rules engine and auto-categorization (Phase 5 -- CATG-02 through CATG-05)
- Transfer detection and exclusion from spending (Phase 6 -- CATG-07 through CATG-09)
- Budget allocations tied to categories (Phase 7 -- BUDG-02 through BUDG-06)
- Category spending totals and reports (Phase 9 -- REPT-01)
- Bulk categorization of multiple transactions at once (not in requirements -- single transaction categorization is sufficient for v1)
- Category color or icon customization (not in requirements)

</deferred>

---

*Phase: 04-category-management-and-manual-categorization*
*Context gathered: 2026-03-22 via auto-context*
