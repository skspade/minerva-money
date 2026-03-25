# Phase 45: Account CRUD Service and Import Integration - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users can create, update, and delete manual accounts via the tRPC API, with balances automatically computed from transactions. This phase builds the account CRUD service layer and tRPC mutations, enforces the manual-only guard on all mutations, computes balance from transaction sums, and integrates balance recalculation into the existing CSV import pipeline. No UI changes, no agent tools -- those are Phase 46.

</domain>

<decisions>
## Implementation Decisions

### Service Architecture
- New service file at `packages/server/src/accounts/accounts-service.ts` with functions: `createAccount`, `updateAccount`, `deleteAccount`, `recalculateBalance` (from design doc)
- New directory `packages/server/src/accounts/` following the established module-per-feature pattern (e.g., `sync/`, `import/`, `categories/`, `rules/`)
- All service functions accept `db: Database.Database` as first parameter, matching the established dependency injection pattern
- Service functions are pure business logic -- tRPC router delegates to them (from PROJECT.md key decision: "design tRPC API with future MCP/CLI exposure in mind")

### Account Creation (CRUD-01)
- `createAccount(db, { name, institution, type })` generates `manual_${crypto.randomUUID()}` ID, inserts with `source = 'manual'`, balance 0
- Type defaults to `'banking'` if not provided (from design doc)
- Returns the full account object after creation (from design doc)
- Use `crypto.randomUUID()` from `node:crypto` for UUID generation (Claude's Decision: already used in import-service.ts -- no new dependency needed)

### Account Update (CRUD-02)
- `updateAccount(db, id, { name?, institution?, type? })` updates only provided fields for manual accounts
- Rejects updates to SimpleFIN accounts by checking `source = 'manual'` before allowing modification (from REQUIREMENTS.md CRUD-04)
- Throw TRPCError with `FORBIDDEN` code when attempting to modify a SimpleFIN account (Claude's Decision: FORBIDDEN semantics match "you cannot do this" better than BAD_REQUEST)

### Account Deletion (CRUD-03)
- `deleteAccount(db, id)` deletes a manual account within a SQLite transaction
- Rejects deletion of SimpleFIN accounts with same `source` guard (from REQUIREMENTS.md CRUD-04)
- Cascade behavior: transactions already have `ON DELETE CASCADE` via the foreign key in schema -- related splits, transfer_links, and balance_snapshots also cascade (from initial schema)
- Clean up budget allocations referencing deleted transactions is handled automatically by the cascade chain (Claude's Decision: schema FK cascades handle this -- no manual cleanup needed since transactions.category_id ON DELETE SET NULL and budget_allocations reference categories not transactions)

### Balance Computation (CRUD-05)
- `recalculateBalance(db, accountId)` runs `SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_id = ?` and updates the accounts.balance column
- Also records a balance snapshot for today's date using `INSERT OR REPLACE INTO balance_snapshots` -- same pattern as `syncAccount` in sync-service.ts
- Balance is integer cents -- no conversion needed since transaction amounts are already stored as cents (from PROJECT.md key decision: "integer cents for all money")
- Update `last_synced` to current timestamp on recalculation to reuse it as "last imported" timestamp (from design doc: "last_synced column is reused: for manual accounts it stores the last CSV import timestamp")

### Import Integration (IMPORT-04)
- After `executeImport()` completes its transaction, call `recalculateBalance()` for every manual account that received transactions
- Identify manual accounts by checking `source = 'manual'` for each account ID in the accountMappings values
- The recalculation runs inside the same SQLite transaction as the import to ensure atomicity (from success criteria 5)
- No changes to parsing, dedup, or categorization logic -- manual account transactions go through the same pipeline (from design doc)

### tRPC Router Mutations
- Add `accounts.create`, `accounts.update`, `accounts.delete` mutations to the existing `accountsRouter` in `trpc-router.ts` (from design doc)
- Input validation via Zod schemas: `name: z.string().min(1)`, `institution: z.string().min(1)`, `type: z.string().default('banking')` (Claude's Decision: min(1) prevents empty strings, consistent with existing category/rule input validation)
- Type field validated against allowed values: `'banking'`, `'credit'`, `'investment'` (Claude's Decision: matches existing account types from SimpleFIN; investment is included per design but balance-only -- manual investment accounts are explicitly out of scope per REQUIREMENTS.md)
- Actually restrict manual account types to `'banking'` and `'credit'` only -- manual investment accounts are out of scope (from REQUIREMENTS.md out of scope: "Manual investment accounts")

### Error Handling
- SimpleFIN account guard: throw `TRPCError({ code: 'FORBIDDEN' })` with message explaining that synced accounts cannot be modified (from REQUIREMENTS.md CRUD-04)
- Account not found: throw `TRPCError({ code: 'NOT_FOUND' })` (Claude's Decision: standard tRPC error code for missing resources)
- Duplicate account name: no uniqueness constraint -- multiple accounts can share names, consistent with SimpleFIN behavior (Claude's Decision: SimpleFIN accounts can have duplicate names across institutions so this is consistent)

### Test Coverage
- Unit tests in `packages/server/src/accounts/accounts-service.test.ts` using in-memory SQLite with migrations applied (Claude's Decision: follows established test pattern in sync-service.test.ts and import-service.test.ts)
- Test create: verify account created with correct fields, `source = 'manual'`, `manual_` prefix ID
- Test update: verify fields updated, verify SimpleFIN account rejection
- Test delete: verify account and transactions removed via cascade
- Test recalculateBalance: verify balance equals sum of transaction amounts in cents
- Test import integration: verify recalculateBalance called after executeImport for manual accounts
- Test balance snapshot: verify snapshot recorded on recalculation

### Claude's Discretion
- Exact error message wording for SimpleFIN guard rejections
- Whether to export TypeScript types for create/update input objects or use inline Zod inference
- Internal ordering of validation checks within service functions
- Test fixture data (account names, amounts, dates)

</decisions>

<specifics>
## Specific Ideas

- The `simplefin_id` column remains NULL for manual accounts -- no changes needed to that column
- The `syncAccount` function's upsert uses `ON CONFLICT(id) DO UPDATE SET name, balance, last_synced, updated_at` -- it will not overwrite `source` or `institution` for manual accounts even if somehow called (defense-in-depth from Phase 44's sync safety)
- The existing `ON DELETE CASCADE` on `transactions.account_id` foreign key means deleting an account automatically removes all its transactions, which in turn cascades to `transaction_splits`, `transfer_links`, and `balance_snapshots` via their own FK cascades
- The import service's `executeImport` function already runs in a `db.transaction()` block -- recalculateBalance must run inside that same transaction to satisfy success criteria 5 (atomicity)
- Balance snapshots use `INSERT OR REPLACE INTO balance_snapshots` with `UNIQUE(account_id, date)` -- same-day recalculations safely overwrite

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/import/import-service.ts`: `executeImport()` function at line 352 -- the integration point for post-import balance recalculation; already runs in a `db.transaction()` block
- `packages/server/src/sync/sync-service.ts`: `syncAccount()` at line 89 -- balance snapshot pattern (`INSERT OR REPLACE INTO balance_snapshots`) to replicate in `recalculateBalance`
- `packages/server/src/sync/trpc-router.ts`: `accountsRouter` at line 153 -- currently has only `list` query; new CRUD mutations get added here
- `packages/server/src/sync/simplefin-client.ts`: `generateDedupHash()` -- used by import service for transaction dedup; no changes needed

### Established Patterns
- Service functions accept `db: Database.Database` as first parameter -- consistent dependency injection across all service modules
- tRPC router imports service functions and delegates; input validated via Zod schemas
- All money values as integer cents -- `SUM(amount)` returns cents directly
- Tests use in-memory SQLite databases with fresh migrations per test (established in sync-service.test.ts, import-service.test.ts)
- camelCase in tRPC responses mapped from snake_case DB columns (e.g., `last_synced` -> `lastSynced`)

### Integration Points
- `packages/server/src/sync/trpc-router.ts` line 153: `accountsRouter` needs `create`, `update`, `delete` mutations added
- `packages/server/src/import/import-service.ts` line 371: Inside the `db.transaction()` block, after transfer detection (line 437), add recalculateBalance calls for manual accounts
- `packages/server/src/import/import-router.ts`: May need to pass through the account source info or the import service can look it up internally
- `packages/server/migrations/006-account-source.sql`: Phase 44's migration already exists -- no schema changes in this phase

</code_context>

<deferred>
## Deferred Ideas

- Inline account creation UI in import wizard -- Phase 46 (IMPORT-01, IMPORT-02, IMPORT-03)
- Dashboard visual distinction for manual accounts -- Phase 46 (DASH-01 through DASH-05)
- Agent `create_account` tool and `list_accounts` source field -- Phase 46 (AGENT-01 through AGENT-03)
- AccountsPage edit/delete UI -- future milestone (REQUIREMENTS.md ACCTUI-01)
- Manual investment accounts -- explicitly out of scope (REQUIREMENTS.md)
- Opening balance pattern for accounts without CSV history -- future milestone (REQUIREMENTS.md ACCTUI-02)
- HELOC/loan account type expansion -- future milestone (REQUIREMENTS.md FMT-02)

</deferred>

---

*Phase: 45-account-crud-service-and-import-integration*
*Context gathered: 2026-03-25 via auto-context*
