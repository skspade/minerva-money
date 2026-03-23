# Roadmap: Minerva Money

## Milestones

- ✅ **v1.0 MVP** — Phases 1-13 (shipped 2026-03-22)
- ✅ **v2.0 Claude Agent** — Phases 14-17 (shipped 2026-03-23)
- 🚧 **v2.1 Deployment Hardening** — Phases 18-20 (in progress)

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

### 🚧 v2.1 Deployment Hardening (In Progress)

**Milestone Goal:** Harden Minerva Money for production deployment on a home iMac with compiled builds, auto-restart on crash, boot startup, and one-command deployments.

- [ ] **Phase 18: Production Build and Directory Layout** - Compiled server/client output, Express static serving, env loading, deploy directory organization
- [ ] **Phase 19: Service Configuration** - launchd plists with correct paths, crash recovery, boot startup, restart throttling
- [ ] **Phase 20: Deploy Scripts** - First-install setup, one-command updates, pre-flight validation

## Phase Details

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
  - [ ] 18-01-PLAN.md — Fix production build pipeline (prebuild clean, verify SPA serving)
  - [ ] 18-02-PLAN.md — Fix plists and verify deployment directory layout

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
**Plans**: TBD

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
| 18. Production Build and Directory Layout | v2.1 | 0/2 | Planned | - |
| 19. Service Configuration | v2.1 | 0/0 | Not started | - |
| 20. Deploy Scripts | v2.1 | 0/0 | Not started | - |
