# Project Research Summary

**Project:** Minerva Money v2.7 — Manual Accounts & CSV Import Integration
**Domain:** Manual account CRUD + CSV import integration in an existing personal budgeting app with SimpleFIN auto-sync
**Researched:** 2026-03-25
**Confidence:** HIGH

## Executive Summary

Minerva Money v2.7 adds manual account management to a mature single-user budgeting app. The research is unusually high-confidence because this milestone extends an existing, well-understood codebase: all four research areas converged on findings derived directly from code inspection rather than speculation. No new dependencies are required. The recommended approach is a strict layered build — migration first, then service, then router, then import integration, then client, then agent — with every downstream consumer able to assume the schema change is in place before they run.

The key architectural insight is that the existing module-per-feature pattern (categories, rules, budget, etc.) maps cleanly onto a new `src/accounts/` module. All business logic lives in service functions called identically by the tRPC router and the agent tools. The only substantial complexity is the inline account creation form inside the import wizard, which requires careful local state management and TanStack Query cache invalidation, but follows precedents already established in the codebase.

The most serious risks cluster around the schema migration phase, not the feature work. Manual accounts silently contaminate three existing system paths the moment they appear in the database: the SimpleFIN sync rate-limit check iterates all accounts, the sync upsert has no source guard in its DO UPDATE clause, and the `accounts.list` query does not yet include the `source` column. All three must be fixed in the same phase as the migration itself. Balance staleness is the other critical risk: `recalculateBalance()` must execute inside the same SQLite transaction as any insert that modifies a manual account's transactions.

## Key Findings

### Recommended Stack

All required capabilities exist in the current stack. Zero new npm packages are needed. `node:crypto` `randomUUID()` (already used in two files) generates `manual_<uuid>` IDs. The existing migration runner applies `006-manual-accounts.sql` automatically. The existing tRPC + Zod pattern handles new mutations. The existing TanStack Query pattern handles cache invalidation.

Full details: `.planning/research/STACK.md`

**Core technologies:**
- `node:crypto` `randomUUID()`: Account ID generation — already in use in two files, zero cost, collision-resistant `manual_` prefix
- `better-sqlite3` `ALTER TABLE ADD COLUMN`: Schema migration via `006-manual-accounts.sql` — safe, non-destructive, handled by existing migration runner
- `better-sqlite3` `SUM(amount)`: Balance recalculation — single indexed query, no performance concern at personal finance scale
- tRPC mutations + Zod: `accounts.create`, `accounts.update`, `accounts.delete` — identical pattern to existing `categories.create`
- `useState` (React): Inline account creation form — three controlled fields, no form library needed or warranted

### Expected Features

The design doc is the authoritative specification. Every v2.7 feature maps cleanly to low or medium complexity. No table-stakes features require architectural invention.

Full details: `.planning/research/FEATURES.md`

**Must have (table stakes):**
- DB migration: `source TEXT NOT NULL DEFAULT 'simplefin'` column — required by every downstream feature
- Account CRUD service (`createAccount`, `updateAccount`, `deleteAccount`, `recalculateBalance`) — foundation of the milestone
- tRPC mutations: `accounts.create`, `accounts.update`, `accounts.delete` — API surface for UI and agent
- Post-import balance recalculation — without this, manual account balances are permanently stale after every CSV import
- `source` field in `accounts.list` tRPC response — required by visual distinction, agent tools, and import wizard
- Visual distinction on AccountsPage: "Manual" badge, "Last imported" label, no Sync Now button for manual accounts

**Should have (differentiators):**
- Inline account creation during CSV import wizard — eliminates flow interruption; Monarch Money supports this pattern
- Agent `create_account` tool with confirmation flow — consistent with existing add-only agent safety model
- `source` field in agent `list_accounts` tool response — low cost, high value for agent context

**Defer (v2+):**
- AccountsPage edit/delete UI for manual accounts — CRUD is available via agent and tRPC; UI affordance is a polish step
- Opening balance UI guidance (tooltip/help text) — acceptable to add after user asks how to do this
- Multiple CSV format support (OFX, QFX, bank-specific CSV) — scope expansion dependent on SimpleFIN coverage gaps
- Manual account type expansion to HELOC/loan — requires branching balance logic throughout the service

**Explicitly out of scope (anti-features):**
- Manual balance entry field — creates two sources of truth; correct pattern is an opening-balance transaction via CSV
- Edit or delete SimpleFIN accounts — synced accounts are read-only by design; service-layer guard enforces this
- CSV import to synced accounts with "replace mode" — destructive and unsafe; additive dedup is already safe

### Architecture Approach

The architecture is an additive extension of the existing layered pattern. One new module (`src/accounts/accounts-service.ts`) provides all manual account business logic. The tRPC `accountsRouter` (already exists in `trpc-router.ts`) gains three mutations. The import service gains approximately 10 lines at the end of its transaction loop. Client pages receive conditional rendering based on the `source` field. The dependency chain is strictly linear: schema → service → router → import → client → agent.

Full details: `.planning/research/ARCHITECTURE.md`

**Major components:**
1. `migrations/006-manual-accounts.sql` (NEW) — adds `source` column; unblocks every subsequent step
2. `src/accounts/accounts-service.ts` (NEW) — createAccount, updateAccount, deleteAccount, recalculateBalance; called by both tRPC router and agent tools directly
3. `src/sync/trpc-router.ts` accountsRouter (MODIFIED) — adds CRUD mutations; extends list to return `source`; filters sync trigger to SimpleFIN accounts only
4. `src/import/import-service.ts` executeImport (MODIFIED) — calls recalculateBalance for each touched manual account after insert loop; writes balance_snapshots for import date
5. `client/pages/AccountsPage.tsx` (MODIFIED) — Manual badge, "Last imported" label, conditional sync affordances
6. `client/pages/ImportPage.tsx` PreviewStep (MODIFIED) — inline account creation form with `__create__` sentinel, cache invalidation on create
7. `src/agent/tools/action-tools.ts` (MODIFIED) — `create_account` tool with confirmation flow

### Critical Pitfalls

Full details: `.planning/research/PITFALLS.md`

1. **Sync trigger iterates manual accounts in rate-limit check** — Add `WHERE source = 'simplefin'` filter to the accounts query in `sync.trigger` in the same phase as the migration. Manual accounts have never been synced and confuse the rate limiter with rate-limit errors for accounts it has never seen.

2. **Balance column goes stale for manual accounts** — Call `recalculateBalance()` inside the same `db.transaction()` as the insert loop in `executeImport()`. Also insert a `balance_snapshots` row for the import date at the end of `executeImport()` rather than waiting for the scheduled snapshot job. Otherwise net worth history is wrong for that day.

3. **Sync upsert can overwrite manual account data** — Add `WHERE source = 'simplefin'` to the DO UPDATE clause of the sync upsert in `sync-service.ts`. UUID collision is near-impossible, but this makes the invariant architecturally enforced rather than probabilistically safe.

4. **`accounts.list` missing `source` column breaks all downstream features** — Update the `accounts.list` SELECT query and TypeScript return type in the same commit as the migration SQL. Every downstream consumer (UI badge, agent tools, import wizard) needs this field; missing it produces silent failures not TypeScript errors.

5. **Cascade delete destroys transaction history without warning** — `deleteAccount()` must count affected transactions and include that count in its return value. The UI delete dialog must show the count. The agent delete path must use the confirmation pattern. Never expose destructive account delete without scope disclosure.

## Implications for Roadmap

Based on research, the work decomposes into three phases. The strict dependency chain (migration → service → router → import → client → agent) means Phase 1 unblocks everything else, and Phase 3 can be parallelized internally once Phase 2 is complete.

### Phase 1: Schema Migration + Sync Safety

**Rationale:** The `source` column is required by every feature in this milestone. More critically, the sync trigger and upsert have latent bugs that activate the moment any manual account exists in the DB. These bugs must be fixed in the same atomic change as the migration. This phase has no UI and no new service functions — it is infrastructure only, but it is the highest-risk phase because mistakes here affect the live sync pipeline.
**Delivers:** A safe DB state where manual accounts can exist without contaminating sync, and the `source` field is available to all future queries.
**Addresses:** Table stakes: `source` column, `accounts.list` returns `source` field.
**Avoids:** Pitfalls 1 (sync rate-limit check on manual accounts), 5 (sync upsert overwrites manual account), 6 (`accounts.list` missing `source`).

**Specific changes:**
- `migrations/006-manual-accounts.sql`: `ALTER TABLE accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'simplefin'`
- `sync-service.ts`: Add `WHERE source = 'simplefin'` guard to upsert DO UPDATE clause
- `trpc-router.ts` sync.trigger: Filter accounts to `source = 'simplefin'` before rate-limit check
- `trpc-router.ts` accounts.list: Add `source` to SELECT and TypeScript return type

### Phase 2: Account CRUD Service + Import Integration

**Rationale:** The service layer is the foundation for the tRPC router mutations and the agent tool. The import service change is tightly coupled to `recalculateBalance()` — both should land together to avoid a window where CSV imports do not update balances. This phase completes all server-side work.
**Delivers:** Full server-side CRUD for manual accounts, correct balance management, and the complete tRPC API surface.
**Addresses:** Table stakes: account CRUD, post-import balance recalculation, tRPC mutations.
**Avoids:** Pitfalls 2 (stale balance column), 4 (cascade delete without transaction count).

**Specific changes:**
- `src/accounts/accounts-service.ts` (NEW): createAccount, updateAccount (source guard), deleteAccount (source guard + transaction count + dryRun option), recalculateBalance (updates both `accounts.balance` and `balance_snapshots`)
- `trpc-router.ts` accountsRouter: accounts.create, accounts.update, accounts.delete mutations with Zod validation
- `import-service.ts` executeImport: collect unique touched account IDs post-insert, filter to `source = 'manual'`, call recalculateBalance for each, write balance_snapshots for import date inside the same transaction

### Phase 3: Client UI + Agent Tools

**Rationale:** All client and agent work depends on the tRPC mutations from Phase 2. AccountsPage, ImportPage, and agent tools are independent of each other and can be implemented in parallel within this phase. Landing them together avoids half-visible UI states in production.
**Delivers:** Complete user-facing feature: visual distinction on AccountsPage, inline account creation in import wizard, agent `create_account` tool, `source` field in agent `list_accounts`.
**Addresses:** Differentiators: inline creation during import, agent tool. Table stakes: visual distinction (Manual badge, no Sync Now for manual accounts).
**Avoids:** Pitfall 3 (stale preview stats — add disclaimer note for newly-created accounts rather than re-running full preview).

**Specific changes:**
- `client/pages/AccountsPage.tsx`: Manual badge, "Last imported" label (reusing `last_synced` column), hide/grey out Sync Now for `source = 'manual'`
- `client/pages/ImportPage.tsx` PreviewStep: `__create__` sentinel in mapping dropdown, inline form (name pre-filled from CSV, institution input, type dropdown), `accounts.create` mutation call, `accounts.list` cache invalidation, disclaimer note for dedup stats on newly-created accounts
- `src/agent/tools/action-tools.ts`: `create_account` tool with confirmation flow (same pattern as `create_category`)
- `src/agent/tools/query-tools.ts`: `source` field included in `get_account_balances` response
- `src/agent/system-prompt.ts`: Guidance that agent can create manual accounts for institutions not in SimpleFIN

### Phase Ordering Rationale

- Phase 1 must come first: the `source` column is a hard dependency for everything else, and the sync safety fixes are latent bugs that must not go live without the column in place.
- Phase 2 must come before Phase 3: all client mutations depend on the tRPC API surface, and the import service fix is tightly coupled to the service function it calls.
- Phase 3 can be implemented as parallel sub-tasks (AccountsPage, ImportPage, agent tools are independent) once Phase 2 is complete.
- Each phase is independently deployable and testable before the next begins.

### Research Flags

Phases with standard patterns (research not needed during planning):
- **Phase 1 (Migration):** SQLite `ALTER TABLE ADD COLUMN` is fully documented and the migration runner pattern is established. The sync filter and upsert guard are straightforward one-line additions.
- **Phase 2 (Service + Import):** Service-layer CRUD follows the exact pattern of `categories-service.ts`. Import service changes are ~10 lines following an established pattern. `recalculateBalance()` is a single indexed query.
- **Phase 3 (Client + Agent):** Inline form follows the `__skip__` sentinel pattern from v2.4. Agent tool follows `create_category` pattern exactly. AccountsPage badge is conditional rendering on an existing field.

No phases require deeper research. All implementation details are fully specified in the design doc and confirmed by direct codebase inspection.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All findings verified by direct code inspection. Two existing uses of `crypto.randomUUID()` confirmed. Migration runner behavior confirmed by reading `migrate.ts`. Zero speculative technology choices. |
| Features | HIGH | Design doc is the authoritative spec. Feature boundaries confirmed against existing codebase. Competitor analysis provides corroboration for UX patterns (Monarch Money inline creation confirmed). |
| Architecture | HIGH | All patterns derived from direct codebase inspection. Build order derived from strict dependency analysis. Five anti-patterns documented with specific file references. |
| Pitfalls | HIGH | All six critical pitfalls identified by tracing actual code paths in the existing system. Specific file and line references provided for each. Recovery strategies confirmed against existing backup infrastructure. |

**Overall confidence:** HIGH

### Gaps to Address

- **Preview stats disclaimer vs. full re-run:** Research identified two acceptable approaches to the stale-preview-stats problem after inline account creation: add a disclaimer note ("Duplicate check not available for newly created accounts") or re-run `previewImport()` with updated mappings. The simpler disclaimer approach is recommended. Confirm this with the user before Phase 3 implementation if there is any question.
- **`last_synced` column reuse for import timestamp:** The design proposes reusing the `last_synced` column to store the import timestamp for manual accounts (displayed as "Last imported: {date}"). This is noted in the design doc but the specific UPDATE call location in `executeImport()` is not spelled out. Phase 2 or Phase 3 implementation should confirm this is the right approach versus adding a separate `last_imported` column.

## Sources

### Primary (HIGH confidence)

- `.planning/designs/2026-03-25-manual-accounts-csv-import-design.md` — authoritative design spec; all feature decisions, ID conventions, `recalculateBalance()` placement, sentinel `__create__` pattern
- `packages/server/src/sync/trpc-router.ts` — router pattern, existing accountsRouter, `accounts.list` query shape, `sync.trigger` accounts query (lines 60-64, 119-134)
- `packages/server/src/sync/sync-service.ts` — upsert DO UPDATE clause (lines 94-105), balance snapshot pattern in `syncAccount`
- `packages/server/src/import/import-service.ts` — `executeImport` structure, dedup hash, stateless preview/execute pattern, post-import hooks
- `packages/server/src/db/migrate.ts` — migration runner behavior, `user_version` management
- `packages/server/migrations/001-initial-schema.sql` — accounts schema, ON DELETE CASCADE rules, `simplefin_id` UNIQUE constraint
- `packages/server/src/categories/category-service.ts` — `randomUUID()` ID generation pattern
- `packages/server/src/agent/tools/action-tools.ts` — `create_category` tool pattern, confirmation flow
- `packages/client/src/pages/ImportPage.tsx` — wizard state management, `__skip__` sentinel pattern, PreviewStep structure
- `packages/client/src/pages/AccountsPage.tsx` — current render structure

### Secondary (MEDIUM confidence)

- [Monarch Money CSV import announcement](https://www.monarch.com/whats-new/tags-csv-import) — confirms assign-or-create-account pattern during import
- [YNAB file-based import guide](https://support.ynab.com/en_us/file-based-import-a-guide-Bkj4Sszyo) — competitor reference for create-account-first flow
- [SQLite ALTER TABLE documentation](https://www.sqlite.org/lang_altertable.html) — confirms ADD COLUMN safety without table rebuild when column has a DEFAULT value
- [Node.js crypto.randomUUID() docs](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions) — availability since Node 14.17.0; cryptographically random UUID v4

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
