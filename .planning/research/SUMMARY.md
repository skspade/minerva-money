# Project Research Summary

**Project:** Minerva Money
**Domain:** Self-hosted personal envelope budgeting web app with bank sync via SimpleFIN
**Researched:** 2026-03-22
**Confidence:** HIGH

## Executive Summary

Minerva Money is a single-user, self-hosted personal finance app built around the envelope (zero-based) budgeting methodology with automatic bank sync via SimpleFIN. This is a well-understood domain — Actual Budget is open-source, YNAB's mechanics are publicly documented, and SimpleFIN's API is straightforward. The recommended approach is a three-layer monolith: React SPA talking to an Express/tRPC server backed by a single SQLite file. No microservices, no cloud infrastructure, no auth layer. The entire stack is locked in per project constraints; research focused on validating supporting libraries and confirming architectural patterns.

The primary risk areas are financial data integrity and bank sync reliability. Floating-point money storage is a hard failure mode that must be addressed at schema design time — all monetary values must be stored as integer cents from day one, as retrofitting this later requires touching every query, API response, and UI component. Transaction deduplication is unexpectedly complex: SimpleFIN transaction IDs change when pending transactions post, and some banks reuse or reassign IDs. The dedup strategy must be layered (primary: transactionId, secondary: deterministic hash, tertiary: manual UI resolution) and built alongside the initial sync. SimpleFIN enforces a 24-requests/day/account rate limit that is trivially exhausted during development without a mock fixture strategy.

The recommended build sequence follows strict dependency order: foundation data pipeline first (schema, DAOs, SimpleFIN client, sync), then read-only UI (account balances, transaction list), then the budgeting engine (categories, allocations, rollovers), then the intelligence layer (rules engine, transfer detection), then trends and dashboard. This order ensures real data flows before any UI is built and the budget engine has categorized transactions to work against before any envelope math runs. The key differentiators — retroactive rule application, twice-monthly funding schedule, and default category allocations — are medium-complexity features that sit on top of working core flows.

## Key Findings

### Recommended Stack

The pre-decided core stack (React 19, Tailwind 4, Express 4, tRPC 11, better-sqlite3 11, TanStack Query 5, TypeScript 5) is well-matched for this workload. Research validated supporting library choices: Vite 8 (confirmed released March 2026 with Rolldown bundler) for builds, Zod 4 for tRPC input validation, date-fns 4 for date math with first-class timezone support, currency.js 2 for display formatting (all arithmetic stays in integer cents), Recharts 3 for charts, and Vitest 4 for testing. The migration strategy is a 50-line custom runner using SQLite's `PRAGMA user_version` — no ORM or migration framework needed at this scale.

**Core technologies:**
- Vite 8 + tsx: frontend build and server TypeScript runner — Vite 8 ships Rolldown (Rust bundler), tsx is zero-config
- Zod 4: tRPC input validation — default tRPC validator, faster parsing, better TypeScript compile times in v4
- date-fns 4: date manipulation — tree-shakeable, functional API, first-class timezone support via @date-fns/tz
- currency.js 2: currency display formatting — 1.14KB, integer-backed precision, handles display rounding
- Recharts 3: charts — declarative React SVG components, best-in-class for standard finance chart types
- croner 9: cron scheduling — TypeScript-native, correct timezone/DST handling for financial date boundaries
- superjson 2: tRPC transformer — Date objects survive serialization as Date objects, not strings
- Custom migration runner: `PRAGMA user_version` pattern — 50 lines, no dependencies, purpose-built for SQLite

**What not to use:** Moment.js (deprecated), Prisma/Knex (overkill for single-user SQLite), axios (native Node.js fetch is sufficient), Create React App (dead), ts-node (tsx is faster), any UI component library (project constraint: Tailwind custom components only).

### Expected Features

The feature set is well-defined. The v1 goal is a complete Monarch Money replacement for a single-user household. Twelve features constitute the MVP; five are deferred to v1.x post-validation; four are explicit v2+ considerations. Three categories of features are deliberately excluded (anti-features): multi-user, mobile native app, and AI/ML categorization.

**Must have (table stakes):**
- SimpleFIN sync with deduplication — nothing works without transactions flowing in
- Account and balance display — aggregate from sync; group by account type
- Categories, category groups, and manual categorization — prerequisite for all budgeting
- Envelope budgeting with monthly periods and rollovers — core methodology; the point of the app
- Transfer detection (auto-suggest + manual confirm) — prevents double-counting in spending reports
- Dashboard with balances, spending summary, and trends — daily landing page
- Net worth tracking with daily balance snapshots — requires investment balance-only display
- Basic spending reports (by category, over time) — "where did my money go?"
- Sync error logging and status indicator — trust in the data

**Should have (differentiators for this project specifically):**
- Rules-based categorization with retroactive application — most apps only apply rules forward; retroactive bulk-fixes history
- Twice-monthly funding schedule (15th + last day) — aligned to actual pay schedule; unique to this workflow
- Default per-category budget allocations — auto-populate each month, reduce repetitive work
- iCloud Drive SQLite backup — automated data safety without cloud vendor complexity

**Defer (v1.x):**
- Split transactions, manual transaction entry, advanced reporting, transaction search/filters, budget templates

**Explicitly excluded (anti-features):**
- Multi-user/household sharing, mobile native app, AI/ML categorization, investment portfolio detail, push notifications

### Architecture Approach

The architecture is a three-layer monolith in a monorepo: React SPA (client package) communicating via tRPC over HTTP to an Express server (server package) backed by a single SQLite file. Shared types live in a third package. The layering is strict: tRPC routers are thin controllers that validate input with Zod and call service functions; services contain all business logic and orchestrate DAOs; DAOs own all SQL via prepared statements compiled at startup. The only async boundary is the SimpleFIN HTTP client — better-sqlite3 is synchronous throughout. All budget calculations (allocated, spent, available, rollover) happen server-side; the client receives computed values.

**Major components:**
1. React SPA (client) — UI rendering, TanStack Query cache, tRPC client
2. tRPC Router Layer — input validation (Zod), thin procedure definitions
3. Service Layer — envelope math, categorization rules, sync orchestration, transfer detection
4. Data Access Layer (DAOs) — prepared statement queries grouped by entity; no SQL outside DAOs
5. SimpleFIN Client — isolated HTTP client that fetches, normalizes, and returns typed data
6. Scheduler (croner) — twice-daily sync, 6-hour backup, post-sync backup trigger
7. Backup Module — `better-sqlite3` backup API with `PRAGMA integrity_check` validation

**Database:** 6 core tables (accounts, categories, category_groups, transactions, budget_allocations, category_defaults) + 3 supporting tables (balance_snapshots, rules, sync_log, settings). All money columns are INTEGER (cents). Dedup hash enforced as UNIQUE constraint — database-level dedup without application code. Month stored as YYYY-MM string for simple grouping and sorting.

### Critical Pitfalls

1. **Floating-point money storage** — Store all monetary values as integer cents in SQLite INTEGER columns from schema design. Never store or calculate money as JavaScript `number`. Format for display only at the UI boundary. This cannot be retrofitted without a full rewrite.

2. **Transaction deduplication failures** — SimpleFIN `transactionId` values change when pending transactions post. Implement layered dedup: primary on transactionId within account, secondary on deterministic hash (accountId + date + absoluteAmount + normalizedMerchant), tertiary UI for manual resolution. Use `INSERT OR IGNORE` with UNIQUE constraint on dedup_hash.

3. **SimpleFIN rate limit exhaustion** — 24 requests/day/account. Build mock fixtures from a single real API call on day one; never hit the live API during development or testing. Add a server-side request counter that hard-caps at 20/day with 4 reserved for manual syncs.

4. **Envelope month boundary math** — Rollover logic is deceptively complex. Positive balances roll forward; negative balances (overspending) reduce next month's available-to-budget, not next month's allocation. Bi-monthly funding (15th + last day) are two events within a calendar month period, not separate periods. Write unit tests for all boundary scenarios before building any UI.

5. **SQLite backup corruption** — Never copy the `.db` file with `cp` or `fs.copyFile` while the app is running. Use `better-sqlite3`'s `.backup()` API for atomic consistent snapshots. Validate with `PRAGMA integrity_check` before writing to iCloud Drive. Keep 3 rotating backups.

6. **Transfer detection false positives** — Same amount on the same day from two different accounts looks identical to a transfer and a real transaction. Auto-suggest transfers but never auto-confirm. Store confirmed transfers as linked pairs and exclude both from spending reports.

7. **Categorization rule ordering ambiguity** — Define a concrete specificity score upfront (exact match > contains match > regex match; more conditions = higher score). Show the user which rule won and why in the transaction detail view. Retroactive rule application must show a preview diff, never apply silently.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation — Data Pipeline

**Rationale:** Schema decisions made here are irreversible without full rewrites (money storage, dedup strategy, backup approach). Real SimpleFIN data must flow before any UI is useful. Get the foundation right before building on it.
**Delivers:** Working SQLite database with migrations, all DAOs, SimpleFIN client with mock fixtures, sync service with deduplication, tRPC server wired up with basic procedures, backup module with integrity validation.
**Addresses:** Account and balance display (data layer), sync status logging, iCloud backup.
**Avoids:** Float money storage (enforced at schema level), backup corruption (backup API from day one), rate limit exhaustion (mock fixtures before any sync logic), dedup failures (UNIQUE constraint + layered strategy built with sync).

### Phase 2: Read-Only UI — Accounts and Transactions

**Rationale:** Users need to see their data and validate sync is working before budgeting against it. The transaction list with manual categorization is both a validation tool and a prerequisite for the budget engine.
**Delivers:** React app shell, account list with balances, transaction list with sort/filter, manual categorization UI, sync controls (Sync Now button, status indicator, error display), category and category group CRUD.
**Addresses:** Account balance display, transaction viewing, sync error visibility, basic category management.
**Uses:** React 19, Tailwind 4, tRPC React Query integration, Recharts (minimal at this phase).
**Avoids:** Showing raw bank merchant names (normalize on import), burying sync errors.

### Phase 3: Budgeting Engine

**Rationale:** Categories must exist and transactions must be categorized before envelope math is meaningful. This is the core product value and has the highest complexity — build with heavy test coverage before UI.
**Delivers:** Monthly budget allocations, default allocations, twice-monthly funding schedule, envelope rollover logic (positive forward, negative deducts from available), budget grid UI showing allocated/spent/available per category.
**Addresses:** Envelope/zero-based budgeting, budget rollovers, overspending handling, default allocations, funding schedule.
**Avoids:** Month boundary math errors (unit tests first), client-side budget calculations (server computes all envelope state).

### Phase 4: Intelligence Layer — Rules and Transfers

**Rationale:** Rules and transfer detection are refinements on top of working transaction and budget flows. They improve data quality but aren't prerequisites for core function. Build after the budget engine validates that categorization matters.
**Delivers:** Categorization rules engine with specificity scoring, retroactive rule application with preview diff, transfer detection (auto-suggest + manual confirm), transfer exclusion from spending reports.
**Addresses:** Rules-based categorization with retroactive application, transfer detection, correct spending report totals.
**Avoids:** Categorization rule ordering ambiguity (define specificity score upfront), transfer detection false positives (suggest-only, never auto-confirm), silent retroactive recategorization.

### Phase 5: Trends, Dashboard, and Polish

**Rationale:** Trends require accumulated historical data. Dashboard is the synthesis of all other features — accounts, budgets, spending, and trends. Build the data recording mechanisms early (balance snapshots in Phase 1 sync), but defer visualization until the data is there.
**Delivers:** Balance snapshot accumulation (recording was Phase 1, visualization is here), net worth trend chart, spending by category reports, spending over time charts, dashboard landing page aggregating all views.
**Addresses:** Dashboard, net worth tracking, spending reports, basic analytics.
**Uses:** Recharts 3 for all visualizations.
**Avoids:** Loading all transactions for trend calculations (use SQL aggregation, not row hydration).

### Phase Ordering Rationale

- Schema and data pipeline come first because money storage, dedup strategy, and backup approach are high-cost to retrofit — every other phase depends on these decisions being correct.
- Read-only UI precedes the budget engine because transaction viewing validates sync correctness and manual categorization seeds the data the budget engine needs.
- Budget engine precedes the intelligence layer because rules and transfers are optimizations on a working budget flow — you can budget manually before rules exist.
- Dashboard and trends come last because they aggregate all other features and require accumulated historical data to be meaningful.
- The feature dependency graph in FEATURES.md and the suggested build order in ARCHITECTURE.md are in full agreement on this sequence.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1 (SimpleFIN integration):** The SimpleFIN API behavior with specific institutions (Discover, Fidelity, Consumers CU) needs early validation with real API responses captured as fixtures. Pending-to-posted transaction reconciliation behavior varies by bank.
- **Phase 3 (Budget engine rollover math):** Bi-monthly funding within a calendar month period has no direct precedent in documented apps. The exact rollover calculation when overspending interacts with partial funding needs careful spec work before implementation.
- **Phase 4 (Transfer detection calibration):** The matching window (+/- N days, same amount) needs tuning for the specific three institutions in scope. This requires real transaction data from all three.

Phases with standard patterns (skip research-phase):
- **Phase 2 (React UI shell):** Standard React SPA with tRPC React Query. Well-documented patterns, no novel problems.
- **Phase 5 (Recharts visualizations):** Recharts has extensive documentation for line, bar, and area charts. No custom visualization needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All library versions confirmed on npm. Vite 8 release confirmed March 2026. Compatibility matrix verified. |
| Features | HIGH | Competitor feature analysis based on live product inspection (Monarch, YNAB, Actual, Lunch Money). MVP scope is well-defined. |
| Architecture | HIGH | Validated against Actual Budget's open-source architecture (same domain, similar constraints). tRPC + Express + SQLite pattern has reference implementations. |
| Pitfalls | HIGH | Sourced from Actual Budget's production issue tracker (real failures in the same domain), SQLite official docs, and SimpleFIN official developer guide. |

**Overall confidence:** HIGH

### Gaps to Address

- **SimpleFIN institution-specific behavior:** Rate limits and dedup behavior documented at the protocol level, but institution-specific quirks (Discover, Fidelity, Consumers CU) need validation with real API calls. Capture mock fixtures on first live connection before building any sync logic against them.
- **currency.js maintenance status:** The library has not had a release in a while despite being stable. If issues arise, the fallback is integer arithmetic with a thin custom formatter. This is not a blocker but worth monitoring.
- **croner vs. node-cron for this use case:** croner chosen for correct timezone/DST handling, but it has lower adoption than node-cron. If croner has issues, the backup is system launchd (already planned for backup) or a simple `setTimeout`-based interval for sync.
- **Bi-monthly funding UX:** No competitor supports a twice-monthly funding schedule. The interaction model (what happens when the user opens the budget on the 14th vs. the 16th) needs UX design work before Phase 3 implementation. This is a spec gap, not a research gap.

## Sources

### Primary (HIGH confidence)

- [Vite 8.0 release blog](https://vite.dev/blog/announcing-vite8) — Rolldown bundler, confirmed March 2026
- [tRPC v11 announcement](https://trpc.io/blog/announcing-trpc-v11) — SSE, FormData, RSC support
- [SimpleFIN Developer Guide](https://beta-bridge.simplefin.org/info/developers) — rate limits, token handling, API behavior
- [SQLite: How to Corrupt a Database](https://sqlite.org/howtocorrupt.html) — official SQLite corruption vectors
- [Actual Budget Database Documentation](https://actualbudget.org/docs/contributing/project-details/database/) — local-first SQLite architecture, views pattern
- [Actual Budget Envelope Budgeting Docs](https://actualbudget.org/docs/getting-started/envelope-budgeting/) — rollover behavior in production envelope system
- [Actual Budget Rules Docs](https://actualbudget.org/docs/budgeting/rules/) — rule specificity and conflict resolution patterns
- [Modern Treasury: Floats Don't Work for Cents](https://www.moderntreasury.com/journal/floats-dont-work-for-storing-cents) — authoritative integer money storage explanation
- [Actual Budget SimpleFIN Issues](https://github.com/actualbudget/actual/issues/2272) — real-world sync problems from production usage
- [Actual Budget Cross-Account Duplicates](https://github.com/actualbudget/actual/issues/7015) — mirror transaction deduplication failures

### Secondary (MEDIUM confidence)

- [Recharts npm](https://www.npmjs.com/package/recharts) — v3.8.0 confirmed
- [Vitest 4.0 blog](https://vitest.dev/blog/vitest-4) — Browser Mode stable, v4.1.0 latest
- [Finary Transfer Detection](https://help.finary.com/en/articles/11572132-internal-transfers-automatic-detection-and-exclusion-from-analysis) — transfer matching heuristics
- [croner vs node-cron comparison](https://www.pkgpulse.com/blog/node-cron-vs-node-schedule-vs-croner-task-scheduling-nodejs-2026) — timezone handling comparison
- [SQLite PRAGMA user_version](https://levlaz.org/sqlite-db-migrations-with-pragma-user_version/) — migration pattern
- [Marmelab tRPC + React + SQLite Demo](https://github.com/marmelab/trpc-react-sqlite-demo) — reference implementation

### Tertiary (LOW confidence)

- [MDN Temporal API status](https://developer.mozilla.org/en-US/blog/javascript-temporal-is-coming/) — Stage 3, not production-ready; revisit 2027

---
*Research completed: 2026-03-22*
*Ready for roadmap: yes*
