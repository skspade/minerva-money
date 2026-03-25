# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v2.7 — Manual Accounts

**Shipped:** 2026-03-25
**Phases:** 3 | **Plans:** 6 | **Requirements:** 21/21

### What Was Built
- Database migration adding `source` column to accounts table with sync pipeline filtered to SimpleFIN-only
- Account CRUD service (createAccount, updateAccount, deleteAccount, recalculateBalance) with SimpleFIN guard
- tRPC mutations for account management and post-import balance recalculation in atomic transactions
- Agent create_account tool with duplicate name detection and system prompt guidance (rules 17-19)
- Dashboard and AccountsPage visual distinction: "Manual" badges and "Last imported" labels
- Import wizard inline account creation: "+ Create New Account" dropdown option with inline form and auto-selection

### What Worked
- No gap closure phase needed — milestone audit passed with 21/21 requirements on first check
- TDD for accounts-service.ts produced 22 new tests covering all CRUD paths and edge cases
- Reusing existing sentinel pattern (`__skip__` → `__CREATE_NEW__`) for import dropdown kept the UI contract consistent
- Manual accounts required zero changes for net worth, reports, or balance snapshots — existing queries don't filter by source
- recalculateBalance running inside import's existing db.transaction() eliminated balance/snapshot drift risk

### What Was Inefficient
- REQUIREMENTS.md checkboxes for 17 requirements (CRUD, IMPORT, DASH, AGENT) left unchecked despite being verified complete — same drift as prior milestones
- Phase 46 SUMMARY.md frontmatter has empty `requirements_completed` arrays — 7th milestone with this gap
- Agent get_account_balances tool has pre-existing bug (references non-existent available_balance column) — not introduced by v2.7 but surfaced during audit
- Agent trigger_sync rate-limit check doesn't filter by source='simplefin' — minor tech debt surfaced by audit

### Patterns Established
- `manual_` prefix + UUID pattern for manual account ID generation (avoids SimpleFIN collisions)
- Source column filtering pattern: `WHERE source = 'simplefin'` for sync operations
- Inline entity creation in import wizard: sentinel detection → inline form → mutation → auto-select
- Caller-managed transaction scope for recalculateBalance (atomicity with import)

### Key Lessons
1. Schema extension milestones can be small (3 phases) when existing queries don't need changes — manual accounts "just work" in reports/net worth
2. Milestone audit passing on first check (no gap closure phase) shows process maturation — per-phase verification improving
3. Pre-existing bugs surface during audits of related features — good signal for tech debt backlog
4. SUMMARY.md frontmatter and REQUIREMENTS.md checkbox drift still not solved — 7 milestones running

### Cost Observations
- Model mix: primarily opus for execution, sonnet for research/planning
- Sessions: autopilot mode
- Notable: 3 phases, 6 plans, 2,047 net lines — smallest feature milestone yet with highest requirements density (21)

---

## Milestone: v2.6 — Streaming Chat

**Shipped:** 2026-03-25
**Phases:** 6 | **Plans:** 6 | **Requirements:** 20/20

### What Was Built
- SSE event protocol — compile-time discriminated union with 6 typed event kinds shared between packages
- chatStream() async generator iterating Agent SDK with tool events, abort handling, and per-model idle timeout
- POST /api/chat/stream Express endpoint with Zod validation before SSE headers
- useStreamingChat React hook with fetch/ReadableStream, reactive state, and automatic tRPC fallback
- Live token-by-token chat rendering with human-readable tool activity labels for 24 agent tools
- Smart auto-scroll that pauses when user scrolls up to read earlier messages

### What Worked
- Strict 5-phase dependency chain (shared types → server generator → HTTP handler → client hook → UI) prevented integration surprises
- TDD throughout — 58 net new tests with clean per-phase separation (types, generator, handler, hook, UI labels)
- Zero new npm dependencies — Agent SDK streaming, Express SSE, fetch ReadableStream all used built-in capabilities
- Extracting processStream and parseSSEChunk as standalone functions made hook testing trivial without React rendering
- Live bubble separate from messages array avoided array churn on every token delta

### What Was Inefficient
- Phase 43 gap closure was still needed for missing VERIFICATION.md files on phases 40 and 42 — 6th milestone in a row
- Session ID continuity bug (empty session on resumed turns) was caught by audit, not by tests — could have been a test case in Phase 41
- ROADMAP.md plan checkboxes still unchecked for phases 38, 39, 41, 42 despite being complete

### Patterns Established
- SSE events as discriminated union with type literal field — self-describing parsed objects for switch narrowing
- Custom hooks in packages/client/src/hooks/ directory
- Tool label map: centralized Record<string, string> with formatted fallback for unknown tools
- Smart scroll: useRef boolean + scroll event listener pattern for gating auto-scroll during streaming

### Key Lessons
1. Standalone Express routes work well alongside tRPC when the transport doesn't fit RPC semantics (streaming SSE)
2. Hook testing is much easier when async logic is extracted into separately exported pure functions
3. Session ID continuity across turns is subtle — the Agent SDK doesn't always emit a session event on resumed turns
4. VERIFICATION.md gap closure is now a predictable tax on every milestone — urgent need for workflow automation

### Cost Observations
- Model mix: primarily opus for execution, sonnet for research/planning
- Sessions: autopilot mode
- Notable: entire milestone completed in 2 days, 6 phases, 4,452 net lines added

---

## Milestone: v2.0 — Claude Agent

**Shipped:** 2026-03-23
**Phases:** 4 | **Plans:** 8 | **Requirements:** 34/34

### What Was Built
- Claude Agent SDK integration with server-side execution and collect-and-return pattern
- 11 read-only query tools covering all financial data surfaces
- 10 action tools for categorization, rules, budgets, transfers, and sync
- Chat UI with markdown rendering, loading states, and inline confirmation buttons
- Safety layer: confirmation for budget amounts, prompt injection prevention, rate limiter enforcement

### What Worked
- Service layer separation from v1.0 made agent tool creation trivial — each tool wraps an existing service function
- Milestone audit before completion caught a rate limiter bypass in trigger_sync (SAFE-04 fix in Phase 17)
- Gap closure phase (17) was minimal (1 plan) because most requirements were satisfied during original phases
- Per-request MCP server instantiation avoids stale DB references

### What Was Inefficient
- SUMMARY.md files across all phases lack `requirements-completed` frontmatter — the summary-extract tool couldn't find accomplishments
- Phase 14 VERIFICATION.md created retroactively in Phase 17 instead of during Phase 14 execution
- 3 tool names in Phase 14 VERIFICATION.md don't match actual code names — documentation drift

### Patterns Established
- XML-wrapped bank strings for prompt injection prevention in agent tools
- System prompt confirmation rules (numbered rules 12-13) for budget amount changes
- Shared tool-helpers.ts for common MCP tool patterns (date formatting, cents conversion, error handling)

### Key Lessons
1. Create VERIFICATION.md during phase execution, not retroactively — same lesson as v1.0 but now proven across 2 milestones
2. Service layer separation pays compound dividends — v1.0 design decision enabled v2.0 agent tools with zero business logic duplication
3. Audit found real safety issues (rate limiter bypass) — always audit before milestone completion

### Cost Observations
- Model mix: primarily opus for execution, sonnet for research/planning
- Sessions: autopilot mode
- Notable: entire v2.0 built in same day as v1.0 completion — 4 phases, 8 plans in ~1 hour

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-22
**Phases:** 13 | **Plans:** 39 | **Requirements:** 34/34

### What Was Built
- Full-stack personal budgeting app (React + Express + tRPC + SQLite)
- SimpleFIN data pipeline with dedup, rate limiting, and twice-daily auto-sync
- Envelope budgeting engine with rollover, auto-funding, and default allocations
- Categorization rules engine with specificity-based conflict resolution
- Transfer detection with auto-suggest and report exclusion
- Dashboard with spending charts, net worth trends, and budget progress
- iCloud Drive atomic backups with 30-day retention

### What Worked
- TDD approach for service layers produced reliable business logic (237 tests)
- Gap closure phases (10-13) effectively caught and resolved audit findings
- Strict dependency ordering (schema → data → UI → categorization → budgeting → reporting) prevented rework
- Service layer separation (business logic in services, tRPC routers as thin controllers) kept code testable
- Integer cents from day one eliminated all floating-point money bugs

### What Was Inefficient
- ROADMAP.md plan checkboxes not kept in sync with disk state during execution (many show unchecked despite being complete)
- Phase 10 created to fix a missing file (run-backup.ts) that should have been caught in Phase 1
- Several VERIFICATION.md files created retroactively in gap closure rather than during original phase execution

### Patterns Established
- All money as INTEGER cents, enforced at schema level
- Service functions are the unit of business logic; tRPC routers are thin wiring
- Gap closure phases for audit-identified issues (decimal or sequential numbering)
- Milestone audit before completion catches gaps early

### Key Lessons
1. Run milestone audit earlier — gap closure phases 10-13 were all preventable with per-phase verification
2. Keep ROADMAP.md checkboxes in sync during execution to avoid confusing state
3. TDD pays off most in budget math and dedup logic where edge cases are subtle

### Cost Observations
- Model mix: primarily opus for execution, sonnet for research/planning
- Sessions: multiple autopilot sessions
- Notable: entire v1.0 built in a single day — autopilot mode with quality profile

---

## Milestone: v2.2 — Mobile-Friendly UI

**Shipped:** 2026-03-24
**Phases:** 5 | **Plans:** 7 | **Requirements:** N/A (design milestone)

### What Was Built
- Responsive layout foundation with mobile-first breakpoints, bottom navigation bar, and hamburger menu
- Transaction cards replacing table rows on mobile screens
- Budget cards with touch-friendly progress bars and category breakdowns
- Modal conversions for forms and detail views on small screens
- Remaining page adaptations (dashboard, reports, categories, rules, transfers, chat)

### What Worked
- Phase-per-component approach kept each change small and independently verifiable
- Existing Tailwind utility classes made responsive variants straightforward
- No component library dependency — full control over mobile breakpoints

### What Was Inefficient
- No audit run for v2.2 — skipped due to design-only nature, but pattern should be consistent

### Patterns Established
- Mobile-first responsive approach: base styles for mobile, `md:` prefix for desktop
- Bottom nav for mobile, sidebar nav for desktop
- MoreSheet component for overflow navigation items on mobile

### Key Lessons
1. Design milestones move fast when the component structure is already clean from prior milestones
2. Bottom nav + More sheet is an effective mobile navigation pattern for apps with 8+ pages

### Cost Observations
- Model mix: primarily opus for execution
- Sessions: autopilot mode
- Notable: 5 phases completed in rapid succession, same day as v2.1

---

## Milestone: v2.1 — Deployment Hardening

**Shipped:** 2026-03-24
**Phases:** 3 | **Plans:** 5 | **Requirements:** 16/16

### What Was Built
- Production build pipeline (tsc + Vite, Express SPA serving)
- launchd service management with crash recovery and boot startup
- Deploy scripts (setup.sh + deploy.sh) with health checks and pre-flight validation

### What Worked
- Treating deployment as a first-class milestone rather than an afterthought
- launchd KeepAlive dict form fix caught a real production issue before first deploy

### What Was Inefficient
- Phase 20 deploy scripts had "Plans: TBD" in ROADMAP but were executed anyway — planning gap

### Key Lessons
1. launchd KeepAlive requires dict form (not bool) for proper crash recovery semantics
2. Deploy scripts should validate prerequisites (node path, .env) before touching launchd

### Cost Observations
- Model mix: primarily opus for execution
- Sessions: autopilot mode
- Notable: 3 phases across 2 days, straightforward infrastructure work

---

## Milestone: v2.3 — CSV Import

**Shipped:** 2026-03-24
**Phases:** 3 | **Plans:** 5 | **Requirements:** 23/23

### What Was Built
- Monarch CSV parsing with auto-delimiter detection, BOM stripping, CRLF normalization, row validation
- Stateless preview/execute API with atomic SQLite transactions, dedup hash, auto-suggest mappings
- 3-step import wizard UI with drag-and-drop, preview, account/category mapping, confirm/results
- Post-import rules engine categorization and transfer detection
- Navigation integration at /import route, desktop nav, mobile More sheet

### What Worked
- TDD approach for CSV parsing caught all edge cases (BOM, CRLF, delimiter detection) before integration
- Stateless preview/execute pattern eliminated server-side session management complexity
- Reusing existing service functions (categorizeNewTransactions, detectTransferCandidates, generateDedupHash) kept scope small
- Audit found only tech debt (no requirement gaps) — per-phase verification working

### What Was Inefficient
- Phase 28 gap closure was needed because Phase 26 didn't create VERIFICATION.md during execution — same lesson as v1.0 and v2.0
- REQUIREMENTS.md traceability table shows many rows as "Pending" despite being complete — status tracking drift

### Patterns Established
- csv-parse/sync for RFC-4180-compliant CSV parsing in Node
- Auto-delimiter detection via header line inspection
- Rules engine priority over import-mapped categories (consistent categorization)

### Key Lessons
1. VERIFICATION.md during execution is STILL being skipped — 3rd milestone in a row with this issue. Need workflow enforcement, not just reminders
2. Reusing existing service functions (dedup hash, rules, transfers) from earlier milestones drastically reduces scope — v2.3 was 3 phases because v1.0 built the foundations
3. 54 tests for the import service caught a real issue with dedup hash chunk sizing for SQLite parameter limits

### Cost Observations
- Model mix: primarily opus for execution
- Sessions: autopilot mode
- Notable: entire milestone completed same day as v2.1 and v2.2

---

## Milestone: v2.4 — CSV Import Account Filtering

**Shipped:** 2026-03-24
**Phases:** 4 | **Plans:** 4 | **Requirements:** 10/10

### What Was Built
- Server-side partial account mapping support — skip rows for unmapped accounts, return per-account row counts
- Skip option in account mapping dropdown with row count badges and amber visual styling
- Client-side stats filtering — preview stats, sample rows, dedup notes all dynamically exclude skipped accounts
- "Skip All Unmatched" convenience button and summary banner showing import scope
- Confirm summary and results page reflecting filtered counts with skippedByAccountFilter stat
- Formal verification with file-and-line evidence for all 10 requirements

### What Worked
- Pure helper function pattern (computeSkipFilterStats, validation helpers) made skip logic independently testable with 22 tests
- Minimal server changes (Phase 29 was 1 plan) — most complexity correctly pushed to client-side filtering
- Audit found only tech debt (SUMMARY.md frontmatter gaps), no requirement gaps — per-phase verification improving
- Gap closure phase (32) was minimal — only VERIFICATION.md creation and traceability table fixes

### What Was Inefficient
- Phase 31 SUMMARY.md frontmatter still missing `requirements_completed` — same pattern as prior milestones
- ROADMAP.md plan checkboxes for phases 29-31 still unchecked despite being complete — roadmap sync drift continues

### Patterns Established
- Sentinel value pattern (`__skip__`) for client-only state that shouldn't reach server
- `computeSkipFilterStats()` pure helper for derived UI state from account mappings
- Three-state form validation: undecided (blocks), all-skipped (blocks with message), ready (proceeds)

### Key Lessons
1. Client-side filtering via useMemo provides instant UI updates without server round-trips — correct pattern for preview-stage UX
2. SUMMARY.md frontmatter gaps persist across 4 milestones now — workflow needs structural enforcement, not documentation reminders
3. Small focused milestones (4 phases, 10 requirements) complete quickly and cleanly — scope discipline pays off

### Cost Observations
- Model mix: primarily opus for execution
- Sessions: autopilot mode
- Notable: entire milestone completed same day — 4 phases in rapid succession

---

## Milestone: v2.5 — Chat Enhancements

**Shipped:** 2026-03-24
**Phases:** 5 | **Plans:** 5 | **Requirements:** 18/18

### What Was Built
- Server-side model selection with centralized models.ts config, tRPC query, per-model timeout scaling
- Category creation tools (create_category_group, create_category) with duplicate validation and confirmation flow
- System prompt behavioral guidance for category management (add-only policy, check-before-create, UI redirect)
- Model selector UI dropdown with session reset on model change and disabled during pending
- Verification gap closure for phases 33, 35, 36

### What Worked
- Centralized models.ts config constant pattern — single source of truth for IDs, labels, timeouts, validation
- TDD for category creation tools caught edge cases in duplicate name validation (case-insensitive)
- Phases 33 and 34 executed in parallel (independent subsystems) — model selection and category tools don't share files
- Milestone audit identified only procedural gaps (frontmatter, checkboxes) — no real requirement gaps

### What Was Inefficient
- REQUIREMENTS.md checkboxes for MOD-01–07 and SYS-01–04 left unchecked despite being satisfied — same traceability drift
- SUMMARY.md frontmatter still missing `requirements-completed` in phases 34, 35, 37 — 5th milestone with this issue
- Phase 37 gap closure was documentation-only (3 VERIFICATION.md files) — could have been created during phases 33, 35, 36

### Patterns Established
- Centralized config constant with derived types and validation helpers (models.ts pattern)
- System prompt numbered rules for behavioral guidance (rules 14-16 for category management)
- Add-only agent tools with UI redirect for destructive operations

### Key Lessons
1. Parallel phase execution works when subsystems are truly independent — 33 (model) and 34 (categories) touched zero shared files
2. SUMMARY.md and REQUIREMENTS.md drift is now a systemic issue — 5 milestones running. Needs automation, not documentation
3. Small focused milestones (5 phases, 18 requirements) complete cleanly in a single session
4. Verification gap closure phases are predictable overhead — building VERIFICATION.md during execution would eliminate them entirely

### Cost Observations
- Model mix: primarily opus for execution, sonnet for research/planning
- Sessions: autopilot mode
- Notable: entire milestone completed same day — 5 phases, 373 lines of new code

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 13 | 39 | Initial build with gap closure phases |
| v2.0 | 4 | 8 | Agent integration leveraging existing service layer |
| v2.1 | 3 | 5 | Deployment hardening as first-class milestone |
| v2.2 | 5 | 7 | Mobile-first responsive redesign |
| v2.3 | 3 | 5 | CSV import reusing existing services |
| v2.4 | 4 | 4 | Account-level skip filtering for selective import |
| v2.5 | 5 | 5 | Chat agent model selection and category creation tools |
| v2.6 | 6 | 6 | SSE streaming with layered dependency chain |
| v2.7 | 3 | 6 | Manual accounts with schema extension and import integration |

### Cumulative Quality

| Milestone | Tests | Requirements | Gap Closure Phases |
|-----------|-------|--------------|-------------------|
| v1.0 | 237 | 34/34 | 4 (Phases 10-13) |
| v2.0 | 259 | 34/34 | 1 (Phase 17) |
| v2.1 | 259 | 16/16 | 0 |
| v2.2 | 259 | N/A | 0 |
| v2.3 | 313 | 23/23 | 1 (Phase 28) |
| v2.4 | 334 | 10/10 | 1 (Phase 32) |
| v2.5 | 361 | 18/18 | 1 (Phase 37) |
| v2.6 | 423 | 20/20 | 1 (Phase 43) |
| v2.7 | 456 | 21/21 | 0 |

### Top Lessons (Verified Across Milestones)

1. Per-phase verification prevents gap closure phases — verify as you go (confirmed v1.0 + v2.0 + v2.3, still being skipped)
2. Integer cents from day one is non-negotiable for financial apps
3. Service layer separation enables future integration with zero business logic duplication (v1.0 → v2.0 agent → v2.3 import)
4. Milestone audit always finds real issues — never skip it (confirmed across all milestones)
5. Reusing existing service functions dramatically reduces milestone scope (v2.3 was 3 phases because dedup/rules/transfers already existed)
6. SUMMARY.md frontmatter `requirements_completed` is skipped in every milestone — needs structural workflow fix, not reminders (confirmed v2.0 + v2.3 + v2.4)
7. Extracting async logic from React hooks into standalone functions dramatically improves testability (confirmed v2.6 — processStream/parseSSEChunk pattern)
