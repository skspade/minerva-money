# Phase 6: Transfer Detection - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Internal transfers between accounts are identified, confirmed, and excluded from spending totals so reports reflect only real spending. This phase delivers: a transfer detection service that finds candidate pairs by matching offsetting amounts across accounts within a date window, a UI for reviewing suggested pairs and confirming/dismissing them, manual linking of any two transactions as a transfer, unlinking confirmed transfers, and exclusion of confirmed transfers from all spending queries.

</domain>

<decisions>
## Implementation Decisions

### Transfer Detection Algorithm
- A candidate transfer pair is two transactions on different accounts where one amount is the negative of the other (equal absolute value, opposite signs) within a configurable date window (from CATG-07 and success criteria 1)
- Date window defaults to 3 calendar days (Claude's Decision: bank processing typically takes 1-2 business days; 3 calendar days covers weekends without being too loose)
- Only unlinked transactions are considered as candidates -- already-confirmed transfers are excluded from future detection runs (Claude's Decision: prevents duplicate suggestions and keeps the candidate list clean)
- Pending transactions are excluded from candidate detection (Claude's Decision: pending transactions may be reversed or adjusted; waiting for settlement avoids false matches)
- Detection runs after each sync completes, generating candidate pairs for newly added transactions (from success criteria 1 -- "after a sync")
- Candidate pairs are stored in the `transfer_links` table with `confirmed = 0` (from existing schema)

### Transfer Links Data Model
- The `transfer_links` table already exists in the schema with `id`, `transaction_a_id`, `transaction_b_id`, `confirmed` (INTEGER 0/1), `created_at`, and a UNIQUE constraint on `(transaction_a_id, transaction_b_id)` (from 001-initial-schema.sql)
- `confirmed = 0` means suggested/candidate, `confirmed = 1` means user-confirmed (from schema design)
- Both transaction foreign keys use ON DELETE CASCADE so deleting a transaction removes its transfer link (from schema)
- Canonical ordering: `transaction_a_id` is always the earlier date (or lower ID if same date) to prevent duplicate pairs with swapped order (Claude's Decision: enforcing a canonical order with the existing UNIQUE constraint prevents the same pair from being inserted twice in either direction)

### Confirming and Unlinking Transfers
- User can confirm a suggested transfer pair with one click, setting `confirmed = 1` (from success criteria 2)
- User can dismiss a suggested pair, deleting the row from `transfer_links` (Claude's Decision: dismissed suggestions should not reappear; deleting the candidate row and relying on a dismissed_pairs tracking approach would add complexity -- instead, set a `dismissed` status)
- Dismissed suggestions use `confirmed = -1` to distinguish from unconfirmed candidates (0) and confirmed transfers (1) (Claude's Decision: reuses the existing integer column without schema change; -1 means "user rejected this suggestion" and prevents re-suggestion)
- User can unlink a confirmed transfer by deleting the `transfer_links` row, restoring both transactions to normal spending (from success criteria 5)
- User can manually link any two transactions as a transfer pair by selecting them, which inserts a `confirmed = 1` row directly (from success criteria 3)

### Spending Report Exclusion
- All spending queries filter out transactions that are part of a confirmed transfer link (from CATG-09 and success criteria 4)
- The `transactions.list` query adds a `isTransfer` boolean field indicating whether the transaction is part of a confirmed transfer (Claude's Decision: the UI needs to visually distinguish transfer transactions from normal spending without a separate query)
- Exclusion is implemented via a LEFT JOIN on `transfer_links` where `confirmed = 1` and checking both `transaction_a_id` and `transaction_b_id` columns (Claude's Decision: a transaction could be in either column of the link; checking both ensures complete coverage)
- Future budget and reporting phases will use the same exclusion pattern when computing category spending totals (from CATG-09)

### Transfer Detection Service
- Service layer functions in a new `packages/server/src/transfers/` directory (Claude's Decision: follows established feature-based directory pattern from sync/, categories/, rules/)
- Core functions: `detectTransferCandidates(db, transactionIds)` for post-sync detection, `confirmTransfer(db, linkId)`, `dismissTransfer(db, linkId)`, `unlinkTransfer(db, linkId)`, `manuallyLinkTransfer(db, txnAId, txnBId)`, `listTransferCandidates(db)`, `listConfirmedTransfers(db)` (Claude's Decision: maps to each user action and system trigger from the success criteria)
- Service functions accept `db: Database.Database` as first parameter (from established pattern in category-service.ts and rules-service.ts)

### Post-Sync Hook Integration
- After sync inserts new transactions and runs the rules engine, the transfer detection service scans new transactions for candidate pairs (from success criteria 1)
- Integration point: add `detectTransferCandidates(db, newTransactionIds)` call in `syncAccount` after `categorizeNewTransactions` (Claude's Decision: transfer detection is logically the last step -- categorization happens first, then transfer flagging)
- Detection only matches new transactions against all existing unlinked transactions on other accounts (Claude's Decision: avoids O(n^2) full-table scans on every sync; only new transactions need matching)

### tRPC Router Structure
- New `transfersRouter` with procedures: `candidates.list`, `confirmed.list`, `confirm`, `dismiss`, `unlink`, `manualLink` (Claude's Decision: separates read queries from mutations; maps to UI workflows)
- Add `transfersRouter` to `appRouter` as `transfers: transfersRouter` (from established tRPC router composition pattern)
- Extend `transactions.list` to include transfer status (confirmed transfer flag and linked transaction ID) (Claude's Decision: the transaction list needs inline transfer indicators without requiring a separate query)

### Transfer Management UI
- A "Transfers" section accessible from the navigation showing suggested and confirmed transfers (Claude's Decision: transfers need their own page since reviewing suggestions is a distinct workflow from transaction viewing)
- Suggested transfers displayed as paired transaction cards showing both sides with a "Confirm" and "Dismiss" button (Claude's Decision: showing both transactions side-by-side makes it obvious what is being linked)
- Confirmed transfers list with an "Unlink" action on each pair (from success criteria 5)
- Manual link flow: user selects two transactions from a filtered list and links them (from success criteria 3)
- Transfer transactions in the main transaction list show a visual indicator (e.g., transfer icon or "Transfer" badge) (Claude's Decision: users need to see at a glance which transactions are transfers when browsing the transaction list)

### Testing Strategy
- TDD for the transfer detection service: candidate matching, date window filtering, canonical ordering, confirm/dismiss/unlink operations (Claude's Decision: the matching algorithm is the core logic and must be thoroughly tested)
- Test cases for: exact amount match across accounts, same-account transactions rejected, date window boundary, duplicate pair prevention, dismissed pairs not re-suggested, manual linking
- Vitest, consistent with all prior phases (established pattern)

### Claude's Discretion
- Exact layout of the transfer candidates review page (cards vs table)
- Manual link modal design and transaction search/filter within it
- Transfer indicator styling in the transaction list (icon vs badge vs text label)
- Whether confirmed transfers section is on the same page as candidates or a separate tab
- Internal naming of service functions and helper utilities
- Whether detection runs synchronously within the sync transaction or as a post-sync step

</decisions>

<specifics>
## Specific Ideas

- The `transfer_links` table already exists in `001-initial-schema.sql` with the exact schema needed: `transaction_a_id`, `transaction_b_id`, `confirmed`, and a UNIQUE constraint -- no new migration required for the base table
- Transaction amounts are INTEGER cents with sign: negative for debits, positive for credits -- a transfer from checking to savings appears as -$500 (debit) and +$500 (credit), so the matching condition is `t1.amount = -t2.amount` and `t1.account_id != t2.account_id`
- The `syncAccount` function in `sync-service.ts` already collects `newTransactionIds` (line 113, 127) -- the transfer detection hook can use this same array
- The `transactions.list` query in `trpc-router.ts` (line 169-183) already JOINs accounts, categories, and rules -- extend with a LEFT JOIN on `transfer_links` to add transfer status
- The `formatCurrency()` helper in `packages/client/src/lib/format.ts` handles cents-to-dollars display for transfer amount display
- Credit card payments are explicitly called out in PROJECT.md Out of Scope as transfers between accounts -- this detection will correctly catch those as transfer pairs

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `transfer_links` table: already in schema with all columns needed for candidate and confirmed transfer pairs
- `appRouter` in `packages/server/src/sync/trpc-router.ts`: extend with `transfers` sub-router
- `router` and `publicProcedure` from `packages/server/src/sync/trpc.ts`: tRPC primitives for new procedures
- `formatCurrency()` in `packages/client/src/lib/format.ts`: cents-to-currency formatting for transfer amount display
- `useTRPC()` hook in `packages/client/src/trpc.ts`: typed tRPC client hook for transfer queries and mutations
- `Layout.tsx`: app layout with navigation -- add Transfers link
- `App.tsx`: React Router routes -- add `/transfers` route
- `TransactionsPage.tsx`: needs transfer indicator added to transaction rows

### Established Patterns
- Feature-based server directory structure: `packages/server/src/sync/`, `packages/server/src/categories/`, `packages/server/src/rules/` -- create `packages/server/src/transfers/`
- tRPC router composition: sub-routers nested under `appRouter` via `router({ sync, accounts, transactions, categories, rules })` -- add `transfers: transfersRouter`
- Service functions accept `db: Database.Database` as first parameter (from category-service.ts and rules-service.ts)
- Post-sync hooks in `syncAccount`: rules engine already called after transaction insert (line 132-134) -- transfer detection follows the same pattern
- TanStack Query with `useQuery(trpc.X.queryOptions())` for data fetching on the client
- Optimistic updates and cache invalidation via `queryClient.invalidateQueries()` after mutations

### Integration Points
- `packages/server/src/sync/sync-service.ts`: the `syncAccount` function must call transfer detection after rules engine categorization
- `packages/server/src/sync/trpc-router.ts`: the `appRouter` gains a `transfers` sub-router; `transactions.list` query extended to include transfer status
- `packages/client/src/app.tsx`: add `/transfers` route
- `packages/client/src/components/Layout.tsx`: add Transfers navigation link
- `packages/client/src/pages/TransactionsPage.tsx`: add transfer indicator to transaction rows

</code_context>

<deferred>
## Deferred Ideas

- Budget engine integration with transfer exclusion (Phase 7 -- BUDG-02 through BUDG-06 will inherit the exclusion pattern)
- Category spending reports with transfer exclusion (Phase 9 -- REPT-01 will filter confirmed transfers)
- Auto-confirmation of transfer pairs based on historical patterns (not in requirements; manual confirmation keeps users in control)
- Transfer pair amount tolerance for fee-adjusted transfers (not in requirements; exact-match is sufficient for internal account transfers)
- Recurring transfer detection and templates (not in requirements; each transfer pair is evaluated independently)

</deferred>

---

*Phase: 06-transfer-detection*
*Context gathered: 2026-03-22 via auto-context*
