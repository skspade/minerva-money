---
gsd_state_version: 1.0
milestone: v2.7
milestone_name: Manual Accounts
status: ready_to_plan
last_updated: "2026-03-25"
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.
**Current focus:** v2.7 Manual Accounts — Phase 44: Schema Migration and Sync Safety

## Current Position

Phase: 44 of 46 (Schema Migration and Sync Safety)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-25 — Roadmap created for v2.7 Manual Accounts (3 phases, 21 requirements)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (v2.7)
- Phases: 0/3
- Requirements satisfied: 0/21

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.7]: Manual accounts use `manual_` prefix + UUID for IDs to avoid SimpleFIN collisions
- [v2.7]: Balance computed from transaction sums (no manual balance entry) — transactions are source of truth
- [v2.7]: Inline account creation during import wizard using `__create__` sentinel pattern

### Pending Todos

None.

### Blockers/Concerns

- Sync upsert DO UPDATE clause needs `WHERE source = 'simplefin'` guard (Phase 44 — latent bug)
- Sync trigger rate-limit check iterates all accounts without source filter (Phase 44 — latent bug)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 2 | Add a UI button to trigger manual sync and backup | 2026-03-24 | 6fdfae6 | [2-add-a-ui-button-to-trigger-manual-sync-a](./quick/2-add-a-ui-button-to-trigger-manual-sync-a/) |
| 3 | Add local backup fallback when iCloud Drive unavailable | 2026-03-24 | 71b6913 | [3-add-local-backup-fallback-when-icloud-di](./quick/3-add-local-backup-fallback-when-icloud-di/) |

## Session Continuity

Last session: 2026-03-25
Stopped at: Roadmap created for v2.7 milestone — ready to plan Phase 44
Resume file: None
