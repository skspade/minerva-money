# Roadmap: Minerva Money

## Milestones

- ✅ **v1.0 MVP** — Phases 1-13 (shipped 2026-03-22)
- ✅ **v2.0 Claude Agent** — Phases 14-17 (shipped 2026-03-23)
- ✅ **v2.1 Deployment Hardening** — Phases 18-20 (shipped 2026-03-24)
- ✅ **v2.2 Mobile-Friendly UI** — Phases 21-25 (shipped 2026-03-24)
- ✅ **v2.3 CSV Import** — Phases 26-28 (shipped 2026-03-24)
- 📋 **v2.4 CSV Import Account Filtering** — Phases 29-31 (in progress)

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

<details>
<summary>✅ v2.3 CSV Import (Phases 26-28) — SHIPPED 2026-03-24</summary>

- [x] Phase 26: Import Service and API (2/2 plans) — completed 2026-03-24
- [x] Phase 27: Import UI and Navigation (2/2 plans) — completed 2026-03-24
- [x] Phase 28: Phase 26 Verification (1/1 plan) — completed 2026-03-24 [Gap Closure]

Full details: [milestones/v2.3-ROADMAP.md](milestones/v2.3-ROADMAP.md)

</details>

### v2.4 CSV Import Account Filtering (In Progress)

- [ ] **Phase 29: Server Skip Support** - Server accepts partial account mappings and provides per-account row counts
- [ ] **Phase 30: Client Skip UI** - Skip option in account mapping dropdown with visual styling and row count badges
- [ ] **Phase 31: Stats Filtering and Polish** - Preview stats, sample rows, and results reflect skip decisions; bulk skip and summary banner

## Phase Details

### Phase 29: Server Skip Support
**Goal**: Server gracefully handles partial account mappings, enabling clients to omit skipped accounts without errors
**Depends on**: Nothing (first phase in v2.4)
**Requirements**: EXEC-01
**Success Criteria** (what must be TRUE):
  1. Server execute endpoint accepts an accountMappings record that omits some CSV accounts and imports only the mapped accounts without throwing
  2. Execute result includes a count of rows skipped due to unmapped accounts (skippedByAccountFilter)
  3. Preview result includes per-account row counts (rowCountByAccount) so the client can display how many rows each account contains
**Plans**: 1 plan

Plans:
- [ ] 29-01: Partial account mapping support (execute skip logic + preview rowCountByAccount)

### Phase 30: Client Skip UI
**Goal**: Users can mark CSV accounts as "skip" in the import wizard and see which accounts they are skipping with clear visual treatment
**Depends on**: Phase 29
**Requirements**: SKIP-01, SKIP-02, SKIP-03
**Success Criteria** (what must be TRUE):
  1. User can select "Skip — do not import" for any CSV account in the account mapping dropdown
  2. User can see how many rows each CSV account contains (row count badge) to make informed skip decisions
  3. Skipped accounts appear with visually distinct styling (dimmed/amber) in the mapping UI
  4. Continue button correctly requires every account to be either mapped or skipped (undecided blocks, all-skipped blocks with clear message)
  5. Skip sentinel value is stripped from the payload before sending to server
**Plans**: TBD

Plans:
- [ ] 30-01: TBD

### Phase 31: Stats Filtering and Polish
**Goal**: All preview stats, sample rows, and import results accurately reflect skip decisions, with convenience features for bulk operations
**Depends on**: Phase 30
**Requirements**: STAT-01, STAT-02, STAT-03, EXEC-02, PLSH-01, PLSH-02
**Success Criteria** (what must be TRUE):
  1. Preview stats (total rows, valid rows) dynamically exclude rows from skipped accounts as the user changes mappings
  2. Sample rows table dynamically excludes rows from skipped accounts
  3. Dedup stats (new/duplicate counts) exclude rows from skipped accounts, with a note about excluded rows
  4. Confirm summary (step 3) and results page reflect filtered counts including a skippedByAccountFilter stat
  5. "Skip All Unmatched" button sets all accounts without auto-suggested matches to skip in one click
  6. Summary banner shows "Importing from X of Y accounts (Z skipped)" when any accounts are skipped
**Plans**: TBD

Plans:
- [ ] 31-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 29 → 30 → 31

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
| 26. Import Service and API | v2.3 | 2/2 | Complete | 2026-03-24 |
| 27. Import UI and Navigation | v2.3 | 2/2 | Complete | 2026-03-24 |
| 28. Phase 26 Verification | v2.3 | 1/1 | Complete | 2026-03-24 |
| 29. Server Skip Support | v2.4 | 0/? | Not started | - |
| 30. Client Skip UI | v2.4 | 0/? | Not started | - |
| 31. Stats Filtering and Polish | v2.4 | 0/? | Not started | - |
