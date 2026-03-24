# Phase 26: Import Service and API - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

A working import service and tRPC API that can parse Monarch CSV files, validate rows, compute dedup stats, auto-suggest account/category mappings, and execute atomic imports with post-insert rules and transfer detection. This phase delivers the complete backend: `import-service.ts` with parsing, validation, transformation, and bulk insertion; `import-router.ts` with `preview` and `execute` tRPC mutations; and the Express body limit increase to accommodate CSV payloads. No UI work -- the API is callable and testable before any frontend exists.

</domain>

<decisions>
## Implementation Decisions

### CSV Parsing
- Use `csv-parse` (^5.6.0) sync API (`csv-parse/sync`) as the sole new dependency -- installed in server workspace only
- Auto-detect delimiter: inspect first line for tab character, fall back to comma
- Configure with `columns: true`, `skip_empty_lines: true`, `trim: true`, `relax_column_count: true`, `bom: true`
- Validate required Monarch columns exist in header: Date, Merchant, Category, Account, Original Statement, Amount
- Tags column silently ignored; Notes column maps to memo
- Strip UTF-8 BOM before parsing as defense-in-depth alongside `csv-parse`'s `bom: true` option
- Normalize CRLF line endings (Claude's Decision: csv-parse handles this but explicit normalization prevents edge cases with delimiter detection on the first line)

### Date Parsing
- Use deterministic regex-based parser, never `new Date()` or `Date.parse()`
- Support ISO format `YYYY-MM-DD` and US format `M/D/YYYY` or `MM/DD/YYYY`
- Output always `YYYY-MM-DD` to match `transactions.date` column format
- Reject rows with unparseable dates as validation errors with row numbers

### Amount Conversion
- Use `toCents(parseFloat(row.amount))` from `@minerva/shared` exclusively -- never manual multiplication
- Monarch sign convention (negative = expense, positive = income) matches Minerva DB convention -- pass through without sign flip
- Unit test with known edge values: `19.99 -> 1999`, `0.01 -> 1`, `-18.32 -> -1832`

### Dedup Hash and Payee Field
- Use `generateDedupHash(accountId, date, amount, payee)` from `sync/simplefin-client.ts` -- same formula as sync pipeline
- Use "Original Statement" column as the payee parameter for hash alignment with SimpleFIN-synced transactions
- Use "Merchant" column as a display-friendly fallback stored in a separate field or as payee when Original Statement is empty (Claude's Decision: Original Statement may be empty in some Monarch rows; Merchant provides a reasonable fallback)
- `INSERT OR IGNORE` with `dedup_hash` UNIQUE constraint handles duplicate detection automatically

### Module Structure
- New directory `packages/server/src/import/` following the established convention (`sync/`, `rules/`, `transfers/`)
- `import-service.ts` -- all business logic: parse, validate, transform, preview stats, bulk insert, category fallback
- `import-router.ts` -- thin tRPC router with `preview` and `execute` mutations
- `import-service.test.ts` -- unit tests covering parsing, validation, dedup, rules integration, category fallback
- No shared types file needed -- tRPC infers types for the client via `AppRouter`

### Preview Mutation (`import.preview`)
- Accepts `{ csvText: string }` via Zod-validated input
- Returns: parsed row count, first 10 sample rows, unique account names with auto-suggested Minerva matches, unique category names with auto-suggested Minerva matches, validation errors with row numbers, dedup stats (new vs. duplicate counts)
- Account auto-matching: case-insensitive substring match against existing Minerva account names
- Category auto-matching: exact case-insensitive name match against existing Minerva category names
- Dedup stats require computing hashes against existing transactions in the database -- this means account mappings from auto-suggest are used for the initial dedup estimate (Claude's Decision: preview must show dedup counts before user confirms mappings; auto-suggested account mappings provide a reasonable first estimate that updates when the user changes mappings on the frontend)

### Execute Mutation (`import.execute`)
- Accepts `{ csvText: string, accountMappings: Record<string, string>, categoryMappings: Record<string, number> }` via Zod-validated input
- Re-parses CSV server-side (stateless design matching all other tRPC procedures)
- Rejects execution if any CSV account name lacks a mapping -- returns validation error
- Unmapped categories default to uncategorized (NULL category_id)
- All inserts run inside a single `db.transaction()` for atomicity
- Transaction IDs generated via `crypto.randomUUID()` (Claude's Decision: matches manual transaction pattern; no prefix needed since provenance is trackable via dedup_hash matching and import timing)
- `pending` flag set to `0` for all imported transactions

### Category Handling Priority (Order Matters)
- Rules engine runs first via `categorizeNewTransactions(db, newTransactionIds)` -- sets `category_id` AND `rule_id` where rules match
- CSV-mapped categories apply as fallback via `applyCsvCategoryFallback()` -- only for transactions still uncategorized after rules; sets `category_id`, leaves `rule_id` NULL
- Execute response reports: imported count, skipped count (duplicates), categorized-by-rules count, categorized-from-CSV count

### Transfer Detection
- `detectTransferCandidates(db, newTransactionIds)` called after rules engine, inside the same transaction
- Catches transfers spanning imported historical data and already-synced transactions

### Express Body Limit
- Raise `express.json()` limit from default 100KB to `10mb` in `packages/server/src/index.ts`
- Monarch exports are typically 200KB-2MB; 10MB provides headroom

### Router Integration
- Add `import: importRouter` to `appRouter` in `packages/server/src/sync/trpc-router.ts` -- becomes the 10th nested router
- Both endpoints are mutations (not queries) because CSV text is sent as POST body and would overflow URL-encoded query parameters

### Field Mapping
- Trim all field values after parsing; map empty/whitespace-only strings to `null` for nullable columns (payee, memo)
- Required fields for validation: Date, Amount, Account (row rejected if any is missing/empty after trim)
- Merchant is required for dedup hash; rows with empty Merchant AND empty Original Statement are rejected (Claude's Decision: dedup hash needs a payee component; without it, same-date same-amount transactions to different merchants would collide)

### Claude's Discretion
- Internal function decomposition within import-service.ts (e.g., separate `parseRows`, `validateRow`, `transformRow` helpers vs. inline)
- Exact Zod schema shapes for input validation (string length limits, record value constraints)
- Test fixture structure and naming conventions
- Whether to extract `generateDedupHash` to a shared utility or import from simplefin-client directly
- Error message wording for validation failures

</decisions>

<specifics>
## Specific Ideas

- The sync-service.ts transaction insertion pattern (lines 107-131) is the direct template for the import execute flow: prepare INSERT OR IGNORE statement, loop rows, track `info.changes > 0` for counting, then call `categorizeNewTransactions` and `detectTransferCandidates` on new IDs
- The `applyCsvCategoryFallback` function uses `UPDATE transactions SET category_id = ? WHERE id = ? AND category_id IS NULL` -- the `AND category_id IS NULL` clause ensures rules-engine categorizations are never overridden
- Express body limit change is a single line: `app.use(express.json({ limit: '10mb' }))` at line 18 of `packages/server/src/index.ts`
- The appRouter currently has 9 nested routers (sync, accounts, transactions, categories, rules, transfers, budget, reports, agent) -- import becomes the 10th
- For the dedup preview, compute hashes for all parsed rows using auto-suggested account mappings, then batch-check which hashes exist in the transactions table via `SELECT dedup_hash FROM transactions WHERE dedup_hash IN (...)` (Claude's Decision: batch SELECT is efficient for up to 10K hashes and avoids N+1 queries)
- The design doc mentions an `owner` field in the CSV row interface but Minerva is single-user with no owner concept -- this field should be ignored (Claude's Decision: Monarch has a multi-user household feature; Minerva is single-user so this column is irrelevant)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `generateDedupHash(accountId, date, amount, payee)` at `packages/server/src/sync/simplefin-client.ts:62` -- exported, produces SHA-256 hash from `${accountId}|${date}|${amount}|${payee}`, reusable without modification
- `categorizeNewTransactions(db, transactionIds)` at `packages/server/src/rules/rules-service.ts:285` -- exported, runs most-specific-rule-wins categorization on an array of transaction IDs
- `detectTransferCandidates(db, transactionIds)` at `packages/server/src/transfers/transfer-service.ts:41` -- exported, finds offsetting transaction pairs across accounts within a date window
- `toCents(dollars)` at `packages/shared/src/types.ts:3` -- uses `Math.round(dollars * 100)`, already imported by simplefin-client for the same dollar-to-cents purpose
- `sync-service.ts` lines 107-131 -- the exact INSERT OR IGNORE + rules + transfer detection pattern to replicate for imports

### Established Patterns
- Feature modules under `packages/server/src/{module}/` with `{module}-service.ts` (business logic) and `{module}-router.ts` or integration in `trpc-router.ts` (API layer)
- Thin tRPC routers that delegate all logic to service functions -- router files contain only Zod schemas and service calls
- `db.transaction(() => { ... })()` wrapping pattern for atomic multi-row operations (used in sync-service.ts and budget-service.ts)
- ESM imports with `.js` extensions in all server source files
- Vitest for all testing with `Database` from `better-sqlite3` for test fixtures

### Integration Points
- `packages/server/src/sync/trpc-router.ts` line 443: `appRouter` composition object where `import: importRouter` will be added
- `packages/server/src/index.ts` line 18: `app.use(express.json())` where body limit must be set to `{ limit: '10mb' }`
- `packages/server/src/sync/simplefin-client.ts`: exports `generateDedupHash` for import to consume
- `packages/server/src/rules/rules-service.ts`: exports `categorizeNewTransactions` for post-insert hook
- `packages/server/src/transfers/transfer-service.ts`: exports `detectTransferCandidates` for post-insert hook
- Account and category data will be queried directly from SQLite (existing tables `accounts` and `categories`) for auto-match suggestions in the preview endpoint

</code_context>

<deferred>
## Deferred Ideas

- Import UI (3-step wizard, file upload, mapping dropdowns, confirm screen) -- Phase 27 scope
- Navigation entries (desktop nav bar, mobile More sheet, `/import` route) -- Phase 27 scope
- Import history log with timestamp, filename, and row counts -- deferred to future release (EXTI-02)
- Inline account creation during import mapping -- explicitly out of scope (REQUIREMENTS.md Out of Scope)
- Multiple CSV format support with format selector -- deferred to future release (EXTI-01)
- Transaction provenance tracking (import source column or ID prefix) -- nice-to-have but not required by any requirement
- Date range overlap warning for cross-source dedup -- Phase 27 UI concern; service returns data, UI presents the warning

</deferred>

---

*Phase: 26-import-service-and-api*
*Context gathered: 2026-03-24 via auto-context*
