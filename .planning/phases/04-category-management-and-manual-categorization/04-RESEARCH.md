# Phase 4: Category Management and Manual Categorization - Research

**Researched:** 2026-03-22
**Domain:** Category CRUD, transaction categorization, transaction splits, manual entry
**Confidence:** HIGH

## Summary

Phase 4 adds category management (groups and categories CRUD with reordering), manual transaction categorization via a dropdown, transaction splitting across multiple categories, and manual transaction entry. The existing schema already has `category_groups` and `categories` tables with `sort_order` columns, so no migration is needed for basic category CRUD. A new `transaction_splits` table requires a migration (002).

The existing stack (tRPC v11, TanStack Query v5, Tailwind v4, better-sqlite3) handles everything needed. The only new dependency consideration is drag-and-drop for category reordering -- `@dnd-kit/core` is the standard React library for this. All other features (dropdowns, modals, forms) can be built with plain HTML elements and Tailwind styling, keeping the project simple.

**Primary recommendation:** Build the category service layer and tRPC router first (wave 1), then category management UI (wave 2), then transaction categorization and splits (wave 3), then manual entry (wave 4). Each wave has a clean dependency boundary.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Category groups and categories tables already exist in the schema with `id`, `name`, `sort_order`, and `group_id` foreign key (from 001-initial-schema.sql)
- `category_groups` uses INTEGER PRIMARY KEY AUTOINCREMENT, `categories` references `group_id` with ON DELETE CASCADE
- CRUD operations: create, rename, reorder (update sort_order), and delete for both category groups and categories (from success criteria 1)
- Deleting a category group cascades to all its categories; deleting a category sets `category_id` to NULL on affected transactions (from ON DELETE SET NULL constraint on transactions.category_id)
- tRPC procedures for category CRUD added as a `categories` sub-router on `appRouter` (from established tRPC router composition pattern)
- Service layer functions in a new `packages/server/src/categories/` directory (Claude's Decision: follows established feature-based directory pattern from sync/ and backup/)
- Reorder uses integer sort_order values with gap-based numbering (Claude's Decision: simple integer swaps avoid fractional ordering complexity; renumbering on reorder keeps values clean)
- Clicking a transaction row's category cell opens a dropdown/select to pick a category (from success criteria 2)
- Category dropdown groups options by category group for visual hierarchy
- Assigning a category calls a `transactions.updateCategory` tRPC mutation that sets `category_id` on the transaction row
- Use TanStack Query optimistic updates to reflect the category change immediately in the list (from success criteria 5)
- The transactions.list query must be updated to JOIN category name and group name for display
- Split data stored in a new `transaction_splits` table with columns: `id`, `transaction_id`, `category_id`, `amount` (INTEGER cents), `created_at`
- A new migration (002) creates the `transaction_splits` table with foreign keys to both transactions and categories
- When a transaction is split, its `category_id` is set to NULL to indicate it is split rather than singly categorized
- Split modal enforces that split amounts sum exactly to the transaction total before saving (from success criteria 3)
- All split amounts are integer cents, validated server-side (from INFR-04 constraint)
- Manual transactions use a generated UUID as the `id` (not from SimpleFIN)
- A `transactions.create` tRPC mutation inserts the new row; the `dedup_hash` is NULL for manual transactions
- Entry form validates: amount is non-zero, payee is non-empty, date is valid, account is selected
- After successful creation, invalidate the transactions query cache to show the new transaction
- New `categoriesRouter` with procedures: `groups.list`, `groups.create`, `groups.rename`, `groups.reorder`, `groups.delete`, `create`, `rename`, `reorder`, `delete`
- Extend `transactionsRouter` with: `updateCategory`, `createSplit`, `updateSplit`, `deleteSplit`, `create` (for manual entry)
- All mutations use the existing tRPC context with `db` access

### Claude's Discretion
- Exact drag-and-drop library choice for reordering (e.g., dnd-kit vs native HTML drag)
- Category dropdown component implementation details (custom vs native select)
- Split modal layout and input arrangement
- Manual transaction form layout (modal vs inline vs separate page section)
- Exact validation error message wording
- Whether category management page uses accordion or flat list for groups
- Internal naming of service functions and DAO methods

### Deferred Ideas (OUT OF SCOPE)
- Categorization rules engine and auto-categorization (Phase 5 -- CATG-02 through CATG-05)
- Transfer detection and exclusion from spending (Phase 6 -- CATG-07 through CATG-09)
- Budget allocations tied to categories (Phase 7 -- BUDG-02 through BUDG-06)
- Category spending totals and reports (Phase 9 -- REPT-01)
- Bulk categorization of multiple transactions at once (not in requirements -- single transaction categorization is sufficient for v1)
- Category color or icon customization (not in requirements)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUDG-01 | User can create and manage budget categories organized into category groups | Category CRUD service + tRPC router + management UI provides full group/category lifecycle |
| CATG-01 | User can manually assign a category to any transaction | Category picker dropdown on transaction row + `updateCategory` mutation with optimistic update |
| CATG-06 | User can split a single transaction across multiple categories | `transaction_splits` table (migration 002) + split CRUD mutations + split modal with sum validation |
| TXNR-01 | User can manually enter a transaction (amount, payee, date, category, account) | `transactions.create` mutation + entry form with validation + cache invalidation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @trpc/server | 11.x | Server procedures for category/transaction mutations | Already in project, established pattern |
| @trpc/client + @trpc/tanstack-react-query | 11.x | Client-side typed API calls | Already in project |
| @tanstack/react-query | 5.x | Data fetching, caching, optimistic updates | Already in project |
| better-sqlite3 | 11.x | SQLite database operations | Already in project |
| zod | 4.x | Input validation for tRPC procedures | Already in project |
| tailwindcss | 4.x | UI styling | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @dnd-kit/core | 6.x | Drag-and-drop for category reordering | Category management page reorder interactions |
| @dnd-kit/sortable | 10.x | Sortable list preset for dnd-kit | Simplifies sortable list implementation |
| crypto.randomUUID() | Built-in | UUID generation for manual transactions | Node.js built-in, no library needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @dnd-kit | Native HTML drag API | Native drag is simpler but has poor touch support and less polished UX; dnd-kit is the React standard |
| @dnd-kit | react-beautiful-dnd | Deprecated/unmaintained since 2024; dnd-kit is the active successor |
| Custom dropdown | Headless UI / Radix | Adds dependency; a simple `<select>` with `<optgroup>` handles grouped categories natively |

**Installation:**
```bash
npm install @dnd-kit/core @dnd-kit/sortable --workspace=@minerva/client
```

## Architecture Patterns

### Recommended Project Structure
```
packages/server/src/categories/
├── category-service.ts       # All category CRUD business logic
└── index.ts                  # Re-exports

packages/server/src/sync/trpc-router.ts  # Extended with categoriesRouter + transaction mutations
packages/server/migrations/002-transaction-splits.sql  # New migration

packages/client/src/pages/
├── CategoriesPage.tsx        # Category group/category management
└── TransactionsPage.tsx      # Extended with category picker + split modal

packages/client/src/components/
├── CategoryPicker.tsx        # Dropdown for selecting a category (used in transactions + manual entry)
├── SplitModal.tsx            # Modal for splitting a transaction across categories
└── ManualTransactionForm.tsx # Form for manual transaction entry
```

### Pattern 1: tRPC Router Composition
**What:** Add a `categoriesRouter` alongside existing `syncRouter`, `accountsRouter`, `transactionsRouter` in `trpc-router.ts`
**When to use:** All new server-side procedures for this phase
**Example:**
```typescript
const categoriesRouter = router({
  groups: router({
    list: publicProcedure.query(({ ctx }) => { ... }),
    create: publicProcedure.input(z.object({ name: z.string().min(1) })).mutation(({ ctx, input }) => { ... }),
  }),
  list: publicProcedure.input(z.object({ groupId: z.number() })).query(({ ctx, input }) => { ... }),
  create: publicProcedure.input(z.object({ groupId: z.number(), name: z.string().min(1) })).mutation(({ ctx, input }) => { ... }),
});

export const appRouter = router({
  sync: syncRouter,
  accounts: accountsRouter,
  transactions: transactionsRouter,
  categories: categoriesRouter,
});
```

### Pattern 2: Optimistic Updates with TanStack Query
**What:** Update the UI immediately on mutation, roll back on error
**When to use:** Category assignment on transaction rows (success criteria 5)
**Example:**
```typescript
const queryClient = useQueryClient();
const updateCategory = useMutation({
  mutationFn: (vars: { transactionId: string; categoryId: number }) =>
    trpc.transactions.updateCategory.mutate(vars),
  onMutate: async (vars) => {
    await queryClient.cancelQueries({ queryKey: trpc.transactions.list.queryKey() });
    const previous = queryClient.getQueryData(trpc.transactions.list.queryKey());
    queryClient.setQueryData(trpc.transactions.list.queryKey(), (old) =>
      old?.map(t => t.id === vars.transactionId ? { ...t, categoryId: vars.categoryId } : t)
    );
    return { previous };
  },
  onError: (_err, _vars, context) => {
    queryClient.setQueryData(trpc.transactions.list.queryKey(), context?.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: trpc.transactions.list.queryKey() });
  },
});
```

### Pattern 3: Gap-Based Sort Order
**What:** When reordering items, renumber all items in the group with sequential integers (0, 1, 2...)
**When to use:** Category and category group reorder operations
**Example:**
```typescript
function reorder(db: Database, table: string, parentColumn: string | null, parentId: number | null, orderedIds: number[]) {
  const stmt = db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`);
  const txn = db.transaction(() => {
    orderedIds.forEach((id, index) => stmt.run(index, id));
  });
  txn();
}
```

### Pattern 4: Native `<select>` with `<optgroup>` for Category Picker
**What:** Use HTML's built-in `<select>` + `<optgroup>` for grouped category selection
**When to use:** Transaction category assignment dropdown
**Why:** Zero dependencies, accessible by default, works on mobile. The grouped categories map directly to `<optgroup label="Group Name">`.
```html
<select>
  <option value="">Uncategorized</option>
  <optgroup label="Housing">
    <option value="1">Rent</option>
    <option value="2">Utilities</option>
  </optgroup>
  <optgroup label="Food">
    <option value="3">Groceries</option>
    <option value="4">Restaurants</option>
  </optgroup>
</select>
```

### Anti-Patterns to Avoid
- **Building a custom dropdown when `<select>` + `<optgroup>` works:** The native select handles keyboard navigation, accessibility, and mobile touch for free
- **Using fractional sort_order values:** Leads to precision issues over many reorders; sequential renumbering in a transaction is cleaner
- **Storing split amounts as floats:** All amounts must be INTEGER cents per INFR-04
- **Allowing both `category_id` and splits on the same transaction:** A transaction is either categorized OR split, never both

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop reordering | Custom mouse/touch event handlers | @dnd-kit/sortable | Touch support, keyboard accessibility, animation, collision detection |
| UUID generation | Custom ID function | crypto.randomUUID() | Built into Node.js and modern browsers, RFC 4122 compliant |
| Input validation | Manual if/else chains | Zod schemas in tRPC .input() | Already used in the project, type-safe, composable |

**Key insight:** The project already has all the infrastructure needed. This phase is about using existing patterns (tRPC routers, TanStack Query, Tailwind) to build new features, not introducing new architectural concepts.

## Common Pitfalls

### Pitfall 1: Split Amounts Not Summing to Transaction Total
**What goes wrong:** User creates splits that don't add up, leaving money unaccounted for
**Why it happens:** Rounding errors when splitting cents, or incomplete validation
**How to avoid:** Validate server-side that `SUM(split.amount) === transaction.amount` in absolute value. Reject the mutation if they don't match. Client-side, show remaining amount as user adds splits.
**Warning signs:** Off-by-one cent in split totals, negative remainder displayed

### Pitfall 2: Optimistic Update Shape Mismatch
**What goes wrong:** The optimistic update sets a different data shape than the server returns, causing a flash of incorrect data
**Why it happens:** The `transactions.list` query returns joined data (category name, group name) but the optimistic update only has the `categoryId`
**How to avoid:** When the `transactions.list` query returns category names, the optimistic update also needs to include category name and group name. Either: (a) pass the full category info from the dropdown to the mutation context, or (b) look up the category from a cached `categories.groups.list` query.
**Warning signs:** Category name flickers from correct to "undefined" and back after mutation settles

### Pitfall 3: Migration Version Collision
**What goes wrong:** The PRAGMA user_version check fails or migrations run out of order
**Why it happens:** The migration runner uses `PRAGMA user_version` as a sequential counter
**How to avoid:** Name the file `002-transaction-splits.sql` and verify the migration runner picks it up. The existing runner in `packages/server/src/db/migrate.ts` handles this.
**Warning signs:** "user_version mismatch" errors on startup

### Pitfall 4: ON DELETE CASCADE/SET NULL Side Effects
**What goes wrong:** Deleting a category group removes categories AND nullifies transaction category assignments silently
**Why it happens:** The schema constraints work correctly but the user may not expect the cascade
**How to avoid:** Show a confirmation dialog that explains impact: "This will delete N categories and uncategorize M transactions"
**Warning signs:** User deletes a group and transactions silently lose their categories

### Pitfall 5: Sort Order Gaps After Deletion
**What goes wrong:** After deleting a category, sort_order values have gaps (e.g., 0, 1, 3)
**Why it happens:** Deletion doesn't renumber remaining items
**How to avoid:** This is fine -- gaps in sort_order don't affect ordering. Only renumber during explicit reorder operations.
**Warning signs:** None -- this is a non-issue but may tempt unnecessary cleanup logic

## Code Examples

### Migration 002: Transaction Splits Table
```sql
CREATE TABLE transaction_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transaction_splits_transaction_id ON transaction_splits(transaction_id);
```

### Extended transactions.list Query
```sql
SELECT
  t.id, t.date, t.payee, t.memo, t.amount, t.account_id,
  a.name AS account_name,
  t.category_id,
  c.name AS category_name,
  cg.name AS group_name,
  (SELECT COUNT(*) FROM transaction_splits ts WHERE ts.transaction_id = t.id) AS split_count
FROM transactions t
JOIN accounts a ON t.account_id = a.id
LEFT JOIN categories c ON t.category_id = c.id
LEFT JOIN category_groups cg ON c.group_id = cg.id
ORDER BY t.date DESC, t.created_at DESC
```

### Category Service Functions
```typescript
// packages/server/src/categories/category-service.ts
export function listGroups(db: Database) {
  return db.prepare(`
    SELECT cg.id, cg.name, cg.sort_order,
      json_group_array(json_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order))
        FILTER (WHERE c.id IS NOT NULL) AS categories
    FROM category_groups cg
    LEFT JOIN categories c ON c.group_id = cg.id
    GROUP BY cg.id
    ORDER BY cg.sort_order ASC, cg.id ASC
  `).all();
}
```

### Manual Transaction Insert
```typescript
export function createManualTransaction(db: Database, input: {
  accountId: string; date: string; amount: number; payee: string;
  memo?: string; categoryId?: number;
}) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO transactions (id, account_id, date, amount, payee, memo, category_id, pending)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(id, input.accountId, input.date, input.amount, input.payee, input.memo ?? null, input.categoryId ?? null);
  return { id };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| react-beautiful-dnd | @dnd-kit | 2023 | react-beautiful-dnd is deprecated; dnd-kit is actively maintained |
| Custom select dropdowns | Native `<select>` + `<optgroup>` | Always | Simpler, accessible, no JS bundle cost |
| REST endpoints | tRPC procedures | Already in project | Type-safe end-to-end, no code generation |

## Open Questions

1. **dnd-kit version compatibility with React 19**
   - What we know: dnd-kit v6 supports React 16.8+. React 19 is in the project.
   - What's unclear: Whether @dnd-kit/core 6.x has any React 19-specific issues
   - Recommendation: Install and test. If issues arise, fall back to simple up/down arrow buttons for reordering (simpler, no dependency). Drag-to-reorder is a UX nicety, not a requirement -- the success criteria says "reorder" not "drag to reorder."

2. **Split deletion cascade behavior**
   - What we know: `ON DELETE CASCADE` on `transaction_splits.category_id` means deleting a category removes all splits referencing it
   - What's unclear: Should the remaining splits be adjusted, or should the entire split be undone?
   - Recommendation: When a category referenced by a split is deleted, delete that split row. If only one split remains, convert it back to a single-category assignment. If no splits remain, the transaction becomes uncategorized. Handle this in the delete-category service function.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `001-initial-schema.sql`, `trpc-router.ts`, `trpc.ts`, `TransactionsPage.tsx` -- direct code inspection
- better-sqlite3 API: transaction support, prepared statements -- already used in project
- tRPC v11: router composition, input validation with Zod -- already used in project
- TanStack Query v5: optimistic updates, cache invalidation -- already used in project

### Secondary (MEDIUM confidence)
- @dnd-kit documentation: sortable lists, React compatibility

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in the project except dnd-kit
- Architecture: HIGH - follows established project patterns exactly
- Pitfalls: HIGH - common patterns well understood, schema constraints are explicit in the migration

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable domain, no fast-moving dependencies)
