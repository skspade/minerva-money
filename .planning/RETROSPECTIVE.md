# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 13 | 39 | Initial build with gap closure phases |
| v2.0 | 4 | 8 | Agent integration leveraging existing service layer |
| v2.1 | 3 | 5 | Deployment hardening as first-class milestone |
| v2.2 | 5 | 7 | Mobile-first responsive redesign |
| v2.3 | 3 | 5 | CSV import reusing existing services |

### Cumulative Quality

| Milestone | Tests | Requirements | Gap Closure Phases |
|-----------|-------|--------------|-------------------|
| v1.0 | 237 | 34/34 | 4 (Phases 10-13) |
| v2.0 | 259 | 34/34 | 1 (Phase 17) |
| v2.1 | 259 | 16/16 | 0 |
| v2.2 | 259 | N/A | 0 |
| v2.3 | 313 | 23/23 | 1 (Phase 28) |

### Top Lessons (Verified Across Milestones)

1. Per-phase verification prevents gap closure phases — verify as you go (confirmed v1.0 + v2.0 + v2.3, still being skipped)
2. Integer cents from day one is non-negotiable for financial apps
3. Service layer separation enables future integration with zero business logic duplication (v1.0 → v2.0 agent → v2.3 import)
4. Milestone audit always finds real issues — never skip it (confirmed across all milestones)
5. Reusing existing service functions dramatically reduces milestone scope (v2.3 was 3 phases because dedup/rules/transfers already existed)
