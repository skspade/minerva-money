# Roadmap: Minerva Money

## Milestones

- ✅ **v1.0 MVP** — Phases 1-13 (shipped 2026-03-22)
- ✅ **v2.0 Claude Agent** — Phases 14-17 (shipped 2026-03-23)
- ✅ **v2.1 Deployment Hardening** — Phases 18-20 (shipped 2026-03-24)
- ✅ **v2.2 Mobile-Friendly UI** — Phases 21-25 (shipped 2026-03-24)
- 🚧 **v2.3 CSV Import** — Phases 26-27 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-13) — SHIPPED 2026-03-22</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-03-22
- [x] Phase 2: SimpleFIN Data Pipeline (4/4 plans) — completed 2026-03-22
- [x] Phase 3: Accounts and Transactions UI (4/4 plans) — completed 2026-03-22
- [x] Phase 4: Category Management (4/4 plans) — completed 2026-03-22
- [x] Phase 5: Categorization Rules Engine (4/4 plans) — completed 2026-03-23
- [x] Phase 6: Transfer Detection (3/3 plans) — completed 2026-03-22
- [x] Phase 7: Budget Engine (4/4 plans) — completed 2026-03-22
- [x] Phase 8: Budget UI (3/3 plans) — completed 2026-03-22
- [x] Phase 9: Dashboard and Reporting (4/4 plans) — completed 2026-03-22
- [x] Phase 10: Foundation Bug Fix & Verification (2/2 plans) — completed 2026-03-23 [Gap Closure]
- [x] Phase 11: Reporting Date Fix & Verification Sweep (2/2 plans) — completed 2026-03-23 [Gap Closure]
- [x] Phase 12: Budget Defaults UI (1/1 plan) — completed 2026-03-23 [Gap Closure]
- [x] Phase 13: Transaction Filter Completion (1/1 plan) — completed 2026-03-23 [Gap Closure]

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v2.0 Claude Agent (Phases 14-17) — SHIPPED 2026-03-23</summary>

- [x] Phase 14: Agent Infrastructure and Query Tools (3/3 plans) — completed 2026-03-23
- [x] Phase 15: Chat UI (2/2 plans) — completed 2026-03-23
- [x] Phase 16: Action Tools and Confirmation Flow (2/2 plans) — completed 2026-03-23
- [x] Phase 17: Audit Gap Closure (1/1 plan) — completed 2026-03-23 [Gap Closure]

Full details: [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md)

</details>

<details>
<summary>✅ v2.1 Deployment Hardening (Phases 18-20) — SHIPPED 2026-03-24</summary>

- [x] Phase 18: Production Build and Directory Layout (2/2 plans) — completed 2026-03-23
- [x] Phase 19: Service Configuration (1/1 plan) — completed 2026-03-24
- [x] Phase 20: Deploy Scripts (2/2 plans) — completed 2026-03-24

Full details: see Phase Details below

</details>

<details>
<summary>✅ v2.2 Mobile-Friendly UI (Phases 21-25) — SHIPPED 2026-03-24</summary>

- [x] Phase 21: Layout Foundation (2/2 plans) — completed 2026-03-24
- [x] Phase 22: Transaction Cards (1/1 plan) — completed 2026-03-24
- [x] Phase 23: Budget Cards (1/1 plan) — completed 2026-03-24
- [x] Phase 24: Modal Conversions (1/1 plan) — completed 2026-03-24
- [x] Phase 25: Remaining Pages (2/2 plans) — completed 2026-03-24

</details>

### 🚧 v2.3 CSV Import (In Progress)

**Milestone Goal:** Add a reusable CSV import feature for migrating transaction history from Monarch Money into Minerva Money, with parsing, account/category mapping, deduplication, and a 3-step wizard UI.

- [x] **Phase 26: Import Service and API** - CSV parsing, validation, dedup, account/category auto-matching, atomic import execution with rules engine and transfer detection (completed 2026-03-24)
- [x] **Phase 27: Import UI and Navigation** - 3-step wizard (upload, preview/map, confirm/import), navigation entries, mobile-responsive layout (2 plans) (completed 2026-03-24)
- [x] **Phase 28: Phase 26 Verification** - Write missing VERIFICATION.md for Phase 26, closing 12 unverified requirements [Gap Closure] (completed 2026-03-24)

## Phase Details

### Phase 26: Import Service and API
**Goal**: A working import service and tRPC API that can parse Monarch CSV files, validate rows, compute dedup stats, auto-suggest account/category mappings, and execute atomic imports with post-insert rules and transfer detection
**Depends on**: Nothing (first phase in v2.3)
**Requirements**: CSV-02, CSV-03, CSV-04, CSV-05, MAP-02, MAP-04, MAP-05, IMP-01, IMP-02, IMP-03, IMP-04, IMP-05
**Success Criteria** (what must be TRUE):
  1. Calling the `preview` tRPC mutation with Monarch CSV text returns parsed row count, unique account names with auto-suggested Minerva matches, unique category names with auto-suggested Minerva matches, validation errors with row numbers, and dedup stats (new vs. duplicate counts)
  2. Calling the `execute` tRPC mutation with CSV text and confirmed account/category mappings inserts all valid transactions atomically — either all succeed or none are written
  3. Duplicate transactions (matching dedup hash) are silently skipped via INSERT OR IGNORE, and the execute response reports the exact skip count
  4. After import, the rules engine has run on all imported transactions (setting category_id and rule_id where rules match), and transfer detection has identified candidate pairs
  5. The API rejects execution when any CSV account is unmapped, returning a clear validation error
**Plans**: 2 plans
  - [ ] 26-01-PLAN.md — TDD: CSV parsing, validation, date parsing, amount conversion
  - [ ] 26-02-PLAN.md — Preview/execute service, tRPC router, integration wiring

### Phase 27: Import UI and Navigation
**Goal**: Users can import Monarch CSV files through a 3-step wizard accessible from both desktop and mobile navigation
**Depends on**: Phase 26 (preview and execute API must exist)
**Requirements**: CSV-01, MAP-01, MAP-03, UI-01, UI-02, UI-03, UI-04, UI-05, NAV-01, NAV-02, NAV-03
**Success Criteria** (what must be TRUE):
  1. User can drag-and-drop or browse to select a CSV file, and the wizard advances to show a preview with the first 10 rows, total row count, and any parse errors
  2. User can map each unique CSV account name to a Minerva account via dropdown, and each unique CSV category to a Minerva category or leave it unmapped (defaults to uncategorized)
  3. Before confirming, user sees a summary showing new transactions to import, duplicates to skip, and error rows — then can confirm to execute or go back to adjust mappings
  4. After successful import, a results screen shows imported count, skipped count, and a link to the Transactions page
  5. The Import page is accessible at `/import`, linked from the desktop nav bar and the mobile "More" bottom sheet, and displays correctly on mobile with stacked layout
**Plans**: 2 plans
  - [ ] 27-01-PLAN.md — ImportPage.tsx: 3-step wizard (upload, preview/map, confirm/results)
  - [ ] 27-02-PLAN.md — Navigation wiring: route, desktop NavLink, mobile MoreSheet entry

### Phase 28: Phase 26 Verification
**Goal**: Write VERIFICATION.md for Phase 26, verifying all 12 requirements that were implemented but never formally verified
**Depends on**: Phase 26 (verifies Phase 26's implementation)
**Requirements**: CSV-02, CSV-03, CSV-04, CSV-05, MAP-02, MAP-04, MAP-05, IMP-01, IMP-02, IMP-03, IMP-04, IMP-05
**Gap Closure:** Closes gaps from audit — Phase 26 code confirmed functional, VERIFICATION.md never written
**Success Criteria** (what must be TRUE):
  1. VERIFICATION.md exists in `.planning/phases/28-phase-26-verification/` confirming each of the 12 requirements against actual code and test evidence
  2. All 12 requirements pass verification (tests run, code inspected, behavior confirmed)
**Plans**: 1 plan
  - [ ] 28-01-PLAN.md — Verify Phase 26 requirements and write VERIFICATION.md

### Phase 18: Production Build and Directory Layout
**Goal**: Server and client produce correct compiled output, Express serves the SPA in production, and all deployment artifacts live in one place
**Depends on**: Nothing (first phase in v2.1)
**Requirements**: BUILD-01, BUILD-02, BUILD-03, BUILD-04, DIR-01, DIR-02
**Success Criteria** (what must be TRUE):
  1. Running `npm run build` produces compiled JavaScript in `packages/server/dist/` and bundled client in `packages/client/dist/`
  2. Starting the compiled server serves the React SPA at the root URL and all client-side routes return index.html
  3. The server loads environment variables via `--env-file` without any dotenv dependency
  4. All deployment config files (plists, scripts) are co-located in the `deploy/` directory with no deployment artifacts elsewhere in the repo
**Plans**: 2 plans
  - [x] 18-01-PLAN.md — Fix production build pipeline (prebuild clean, verify SPA serving)
  - [x] 18-02-PLAN.md — Fix plists and verify deployment directory layout

### Phase 19: Service Configuration
**Goal**: launchd service definitions correctly manage the server and backup processes with crash recovery and boot startup
**Depends on**: Phase 18 (plists must reference correct build output paths)
**Requirements**: PROC-01, PROC-02, PROC-03, PROC-04, PROC-05
**Success Criteria** (what must be TRUE):
  1. The server plist uses the correct absolute node binary path for the target machine and points at compiled server output
  2. launchd restarts the server automatically after a crash (non-zero exit) but does not restart after a clean shutdown
  3. The server starts automatically on user login without manual intervention
  4. A crash loop is throttled to at most one restart every 10 seconds
  5. The backup plist runs the compiled `dist/backup/run-backup.js` instead of TypeScript source via tsx
**Plans**: 1 plan
  - [x] 19-01-PLAN.md — Fix KeepAlive dict form and verify all PROC requirements

### Phase 20: Deploy Scripts
**Goal**: One-command first-install and one-command updates with pre-flight validation
**Depends on**: Phase 19 (scripts install and manage the plists from Phase 19)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-05
**Success Criteria** (what must be TRUE):
  1. Running `setup.sh` on a fresh machine builds the project, copies plists to LaunchAgents, loads services via `launchctl bootstrap`, and confirms the server is healthy
  2. Running `deploy.sh` pulls latest code, reinstalls dependencies, rebuilds, restarts the service, and confirms health -- all in one command
  3. Both scripts validate the node binary path exists before installing or updating plists
  4. `setup.sh` exits with an error if `.env` is missing, before attempting to start the server
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-03-22 |
| 2. SimpleFIN Data Pipeline | v1.0 | 4/4 | Complete | 2026-03-22 |
| 3. Accounts and Transactions UI | v1.0 | 4/4 | Complete | 2026-03-22 |
| 4. Category Management | v1.0 | 4/4 | Complete | 2026-03-22 |
| 5. Categorization Rules Engine | v1.0 | 4/4 | Complete | 2026-03-23 |
| 6. Transfer Detection | v1.0 | 3/3 | Complete | 2026-03-22 |
| 7. Budget Engine | v1.0 | 4/4 | Complete | 2026-03-22 |
| 8. Budget UI | v1.0 | 3/3 | Complete | 2026-03-22 |
| 9. Dashboard and Reporting | v1.0 | 4/4 | Complete | 2026-03-22 |
| 10. Foundation Bug Fix | v1.0 | 2/2 | Complete | 2026-03-23 |
| 11. Reporting Date Fix | v1.0 | 2/2 | Complete | 2026-03-23 |
| 12. Budget Defaults UI | v1.0 | 1/1 | Complete | 2026-03-23 |
| 13. Transaction Filters | v1.0 | 1/1 | Complete | 2026-03-23 |
| 14. Agent Infrastructure | v2.0 | 3/3 | Complete | 2026-03-23 |
| 15. Chat UI | v2.0 | 2/2 | Complete | 2026-03-23 |
| 16. Action Tools | v2.0 | 2/2 | Complete | 2026-03-23 |
| 17. Audit Gap Closure | v2.0 | 1/1 | Complete | 2026-03-23 |
| 18. Production Build | v2.1 | 2/2 | Complete | 2026-03-23 |
| 19. Service Configuration | v2.1 | 1/1 | Complete | 2026-03-24 |
| 20. Deploy Scripts | v2.1 | 2/2 | Complete | 2026-03-24 |
| 21. Layout Foundation | v2.2 | 2/2 | Complete | 2026-03-24 |
| 22. Transaction Cards | v2.2 | 1/1 | Complete | 2026-03-24 |
| 23. Budget Cards | v2.2 | 1/1 | Complete | 2026-03-24 |
| 24. Modal Conversions | v2.2 | 1/1 | Complete | 2026-03-24 |
| 25. Remaining Pages | v2.2 | 2/2 | Complete | 2026-03-24 |
| 26. Import Service and API | 2/2 | Complete    | 2026-03-24 | - |
| 27. Import UI and Navigation | 2/2 | Complete    | 2026-03-24 | - |
| 28. Phase 26 Verification | 1/1 | Complete    | 2026-03-24 | - |
