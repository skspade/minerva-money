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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 13 | 39 | Initial build with gap closure phases |
| v2.0 | 4 | 8 | Agent integration leveraging existing service layer |

### Cumulative Quality

| Milestone | Tests | Requirements | Gap Closure Phases |
|-----------|-------|--------------|-------------------|
| v1.0 | 237 | 34/34 | 4 (Phases 10-13) |
| v2.0 | 259 | 34/34 | 1 (Phase 17) |

### Top Lessons (Verified Across Milestones)

1. Per-phase verification prevents gap closure phases — verify as you go (confirmed v1.0 + v2.0)
2. Integer cents from day one is non-negotiable for financial apps
3. Service layer separation enables future integration with zero business logic duplication (v1.0 design → v2.0 agent tools)
4. Milestone audit always finds real issues — never skip it
