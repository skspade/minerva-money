# Phase 5: Categorization Rules Engine - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users can define rules that categorize transactions automatically -- retroactively and going forward -- with deterministic conflict resolution. This phase delivers: a rules engine service with specificity scoring and conflict resolution (most-specific wins, ties to newer), retroactive application with a preview-before-apply workflow, auto-categorization of newly synced transactions on import, a rules management UI (create/edit/delete with merchant/amount/memo conditions), and transaction detail showing which rule won and why.

</domain>

<decisions>
## Implementation Decisions

### Rules Data Model
- The `categorization_rules` table already exists in the schema with columns: `id`, `name`, `merchant_pattern`, `amount_min`, `amount_max`, `memo_pattern`, `category_id`, `specificity_score`, `created_at`, `updated_at` (from 001-initial-schema.sql)
- `merchant_pattern` supports both exact and contains matching (from CATG-02 success criteria -- "exact or contains")
- A `match_type` column is needed to distinguish exact vs contains matching on merchant_pattern (Claude's Decision: the existing schema has no match_type column; a new migration adds it with default 'contains' since contains is the more common use case)
- `amount_min` and `amount_max` are INTEGER cents, nullable -- NULL means no amount constraint on that bound (from schema definition and INFR-04 integer cents constraint)
- `memo_pattern` is a contains-match text pattern, nullable -- NULL means no memo constraint (Claude's Decision: contains-match is sufficient for memo filtering; regex would add complexity without clear user benefit)
- Rules require at least one condition to be non-null (merchant, amount range, or memo) (Claude's Decision: a rule with no conditions would match everything, which is never the user's intent)

### Specificity Scoring Algorithm
- Most-specific-rule-wins conflict resolution (from PROJECT.md Key Decisions table)
- Ties broken by newer rule winning (from CATG-05 and PROJECT.md Key Decisions)
- Specificity score is computed at rule creation/update time and stored in the `specificity_score` column (from existing schema column)
- Scoring formula: each non-null condition adds points -- merchant exact match scores higher than contains, amount range scores based on having one or both bounds, memo pattern adds points (Claude's Decision: pre-computed score avoids recalculating on every transaction evaluation; simple additive scoring is deterministic and debuggable)
- Suggested point values: merchant exact = 3, merchant contains = 2, amount range (both bounds) = 2, amount range (one bound) = 1, memo pattern = 1 (Claude's Decision: exact merchant match is the strongest signal; two-bound amount range is more specific than one-bound; these weights produce intuitive ordering)
- When scores tie, the rule with the higher `id` (newer `created_at`) wins (from CATG-05)

### Rule Evaluation Engine
- A `evaluateRules(db, transaction)` function returns the winning rule (or null) for a single transaction (Claude's Decision: single-transaction evaluation is composable -- works for both sync-time and retroactive scenarios)
- Rules are loaded once and cached in memory per evaluation batch, sorted by specificity_score DESC, id DESC (Claude's Decision: avoids N+1 queries when processing multiple transactions; sort order ensures first match is the winner)
- Matching logic: for each rule, check all non-null conditions against the transaction -- all conditions must match (AND logic) (Claude's Decision: AND logic is standard for multi-condition rules; OR logic would require a fundamentally different UX)
- Merchant contains matching is case-insensitive (Claude's Decision: merchant names vary in capitalization across providers; case-insensitive matching reduces user frustration)

### Auto-Categorization on Import
- After sync inserts new transactions, the rules engine runs on all newly added transactions (from CATG-04)
- Integration point: the `syncAccount` function in `sync-service.ts` currently inserts transactions with `category_id` implicitly NULL; after insert, call the rules engine to categorize new rows (Claude's Decision: post-insert hook keeps the sync service's insert logic clean and the rules engine decoupled)
- Only uncategorized transactions (category_id IS NULL and no splits) are evaluated -- manually categorized transactions are not overridden (Claude's Decision: user manual categorization should always take precedence over automated rules)
- Store the winning rule ID on the transaction for audit trail (Claude's Decision: the transaction detail needs to show "categorized by rule X"; a `rule_id` column on transactions tracks this; new migration adds it)

### Retroactive Application with Preview
- Before applying a rule retroactively, a preview query shows all existing transactions that would be recategorized (from success criteria 2)
- Preview returns: transaction list with current category and proposed new category (Claude's Decision: showing both current and proposed state lets the user assess the impact before confirming)
- Preview only includes uncategorized transactions and transactions not manually overridden (Claude's Decision: consistent with auto-categorization policy -- manual assignments are sacred)
- Confirming retroactive application updates all matching transactions' `category_id` and sets `rule_id` in a single database transaction (from success criteria 3 -- "immediately")
- The preview is a read-only query; confirmation is a separate mutation (Claude's Decision: two-step workflow prevents accidental bulk recategorization)

### Rules Management UI
- Rules list page showing all rules with name, conditions summary, target category, and match count (Claude's Decision: match count gives users confidence in rule effectiveness)
- Create/edit form with fields: rule name, merchant pattern (with exact/contains toggle), amount min, amount max, memo text, and target category picker (from success criteria 1 and CATG-02)
- After creating a rule, immediately show the retroactive preview with a "Apply to existing transactions" button (from success criteria 2)
- Delete rule confirmation dialog (Claude's Decision: prevents accidental deletion; deleting a rule does not uncategorize previously matched transactions)
- Add a "Rules" route to the app navigation (Claude's Decision: rules are a distinct workflow from categories or transactions, warranting their own page)

### Transaction Detail -- Rule Attribution
- Transaction detail (or row expansion) shows which rule categorized it, if any (from success criteria 5 -- "transaction detail shows which rule won")
- Display the rule name and a brief explanation of why it matched (e.g., "Matched merchant contains 'Amazon'") (from success criteria 5)
- User can manually override a rule-assigned category; this clears the `rule_id` to mark it as manual (Claude's Decision: overriding a rule should be explicit and prevent the rule from re-categorizing on future evaluations of that transaction)

### tRPC Router Structure
- New `rulesRouter` with procedures: `list`, `create`, `update`, `delete`, `preview` (retroactive preview), `apply` (retroactive apply) (Claude's Decision: maps directly to the required workflows -- CRUD plus the preview/apply pair)
- Extend `transactionsRouter` to include `rule_id` and rule name in the `list` query response (Claude's Decision: the transactions list needs rule attribution data without requiring a separate query)
- Service layer functions in a new `packages/server/src/rules/` directory (Claude's Decision: follows established feature-based directory pattern from sync/, backup/, categories/)

### Database Migration
- New migration (003) adds: `match_type TEXT NOT NULL DEFAULT 'contains'` column to `categorization_rules`, and `rule_id INTEGER REFERENCES categorization_rules(id) ON DELETE SET NULL` column to `transactions` (Claude's Decision: match_type enables exact vs contains distinction; rule_id on transactions enables audit trail; ON DELETE SET NULL keeps transactions categorized even if the rule is later deleted)

### Testing Strategy
- TDD for the rules engine service: specificity scoring, rule matching, conflict resolution, retroactive preview and apply (Claude's Decision: the scoring and conflict resolution logic is the core algorithmic complexity and must be thoroughly tested)
- Test cases for: single rule match, multiple rule conflict resolution, tie-breaking by newer rule, no match returns null, manual override not overwritten
- Vitest, consistent with all prior phases (established pattern)

### Claude's Discretion
- Internal naming of rules service functions and helper utilities
- Exact specificity score point values (guidance provided but planner can adjust)
- Rules list page layout details (table vs cards)
- Whether rule edit reuses the create form or has its own component
- Exact wording of rule match explanations in transaction detail
- How the retroactive preview is displayed (modal vs inline vs separate page)

</decisions>

<specifics>
## Specific Ideas

- The `categorization_rules` table already has `specificity_score INTEGER NOT NULL DEFAULT 0` -- the score is computed by the service layer and written on create/update
- The `transactions` table INSERT in `sync-service.ts` (line 112-115) uses `INSERT OR IGNORE` -- the rules engine hook should run after this loop, operating on only the rows where `info.changes > 0`
- The `syncAccount` function returns the count of added transactions; the rules engine can accept the list of newly added transaction IDs to scope its evaluation
- The existing `updateTransactionCategory` in `category-service.ts` clears splits when setting a category -- the rules engine should use a similar approach but also set `rule_id`
- Amount values in rules (`amount_min`, `amount_max`) and transactions (`amount`) are both integer cents -- comparison is direct with no conversion needed
- The `CategoryPicker` component already exists and can be reused in the rule create/edit form for selecting the target category

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `categorization_rules` table: already in schema with all needed columns except `match_type` (added via migration 003)
- `updateTransactionCategory()` in `packages/server/src/categories/category-service.ts`: pattern for updating category_id and clearing splits -- extend or parallel for rule-based categorization
- `CategoryPicker` component in `packages/client/src/components/CategoryPicker.tsx`: reuse in rule create/edit form for target category selection
- `listGroupsWithCategories()` in `category-service.ts`: provides grouped category data for the category picker
- `formatCurrency()` in `packages/client/src/lib/format.ts`: use for displaying amount range conditions in rule summaries
- `appRouter` in `packages/server/src/sync/trpc-router.ts`: extend with `rules` sub-router
- `router` and `publicProcedure` from `packages/server/src/sync/trpc.ts`: tRPC primitives for new procedures

### Established Patterns
- Feature-based server directory: `packages/server/src/sync/`, `packages/server/src/backup/`, `packages/server/src/categories/` -- create `packages/server/src/rules/`
- tRPC router composition: sub-routers nested under `appRouter` via `router({ sync, accounts, transactions, categories })` -- add `rules: rulesRouter`
- Service functions accept `db: Database.Database` as first parameter (from category-service.ts pattern)
- Migrations use sequential numbering: `001-initial-schema.sql`, `002-transaction-splits.sql` -- next is `003-rules-engine.sql`
- TanStack Query with `useQuery(trpc.X.queryOptions())` for data fetching on the client
- Optimistic updates and cache invalidation via `queryClient.invalidateQueries()` after mutations

### Integration Points
- `packages/server/src/sync/sync-service.ts`: the `syncAccount` function (line 92-135) must call the rules engine after inserting new transactions to auto-categorize them
- `packages/server/src/sync/trpc-router.ts`: the `appRouter` gains a `rules` sub-router; `transactions.list` query extended to include `rule_id` and rule name
- `packages/server/migrations/`: new `003-rules-engine.sql` migration
- `packages/client/src/app.tsx`: add `/rules` route
- `packages/client/src/components/Layout.tsx`: add Rules navigation link
- `packages/client/src/pages/TransactionsPage.tsx`: add rule attribution display to transaction rows or detail view

</code_context>

<deferred>
## Deferred Ideas

- Transfer detection and exclusion from spending (Phase 6 -- CATG-07 through CATG-09)
- Budget allocations tied to categories (Phase 7 -- BUDG-02 through BUDG-06)
- Category spending totals and reports (Phase 9 -- REPT-01)
- Rule import/export functionality (not in requirements)
- Regex-based pattern matching for merchant or memo (not in requirements; contains matching is sufficient for v1)
- Rule testing/dry-run against a single transaction (not in requirements; retroactive preview covers the validation need)
- Rule priority manual ordering (explicitly rejected by PROJECT.md -- specificity-based is the chosen approach)

</deferred>

---

*Phase: 05-categorization-rules-engine*
*Context gathered: 2026-03-22 via auto-context*
