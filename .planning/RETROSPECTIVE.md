# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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

### Cumulative Quality

| Milestone | Tests | Requirements | Gap Closure Phases |
|-----------|-------|--------------|-------------------|
| v1.0 | 237 | 34/34 | 4 (Phases 10-13) |

### Top Lessons (Verified Across Milestones)

1. Per-phase verification prevents gap closure phases — verify as you go
2. Integer cents from day one is non-negotiable for financial apps
