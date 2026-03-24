# Roadmap: Minerva Money

## Milestones

- ✅ **v1.0 MVP** — Phases 1-13 (shipped 2026-03-22)
- ✅ **v2.0 Claude Agent** — Phases 14-17 (shipped 2026-03-23)
- ✅ **v2.1 Deployment Hardening** — Phases 18-20 (shipped 2026-03-24)
- 🚧 **v2.2 Mobile-Friendly UI** — Phases 21-25 (in progress)

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

### 🚧 v2.2 Mobile-Friendly UI (In Progress)

**Milestone Goal:** Make every page in Minerva Money fully functional on iPhone (375–430px) with bottom tab navigation, card layouts, safe area insets, and bottom sheet modals — without regressing any desktop behavior.

- [x] **Phase 21: Layout Foundation** - Bottom tab bar, Sheet component, viewport/safe area fixes, Layout.tsx mobile padding (completed 2026-03-24)
- [x] **Phase 22: Transaction Cards** - Mobile card layout, filter collapse, CategoryPicker tap-to-change (1 plan) (completed 2026-03-24)
- [x] **Phase 23: Budget Cards** - Stacked category cards, progress bars, inline allocation editing (1 plan) (completed 2026-03-24)
    - [x] 23-01-PLAN.md — Extract AllocationCell, create BudgetCategoryCard, add mobile cards + responsive month selector (completed 2026-03-24)
- [x] **Phase 24: Modal Conversions** - SplitModal, ManualTransactionForm, RuleForm, ManualLinkModal as bottom sheets (completed 2026-03-24)
- [x] **Phase 25: Remaining Pages** - Dashboard, Accounts, Reports, Chat, Categories, Rules mobile polish (completed 2026-03-24)

## Phase Details

### Phase 21: Layout Foundation
**Goal**: Establish the mobile navigation shell (bottom tab bar, "More" sheet), fix viewport behavior for iOS Safari, and add safe area inset support so all subsequent page work has a correct foundation
**Depends on**: Nothing (first phase in v2.2)
**Requirements**: NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, LAYOUT-05, TOUCH-01
**Success Criteria** (what must be TRUE):
  1. On screens below 768px, a fixed bottom tab bar with 5 tabs (Dashboard, Transactions, Budget, Chat, More) is visible; the desktop top navbar is hidden
  2. Tapping "More" opens a bottom sheet listing Accounts, Categories, Rules, Transfers, and Reports; navigating to any listed page auto-closes the sheet
  3. Main content has bottom padding that clears the tab bar, and no horizontal scroll occurs at 375px viewport width
  4. The viewport uses `viewport-fit=cover` and the tab bar respects `env(safe-area-inset-bottom)` on iPhone
  5. All tab bar items have minimum 44x44px tap targets
**Plans**: 2 plans
  - [ ] 21-01-PLAN.md — Viewport, CSS safe area utility, and Layout.tsx mobile restructure
  - [ ] 21-02-PLAN.md — Install vaul/lucide-react, build BottomTabBar and MoreSheet, wire into Layout

### Phase 22: Transaction Cards
**Goal**: Replace the desktop transaction table with a mobile card layout on small screens, with collapsible filters and tap-to-change category
**Depends on**: Phase 21 (layout shell and touch target patterns must exist)
**Requirements**: TXN-01, TXN-02, TXN-03, TXN-04, TXN-05, TOUCH-02
**Success Criteria** (what must be TRUE):
  1. On mobile, transactions display as stacked cards showing merchant, amount, date, account, and category — the desktop table is hidden
  2. Tapping a transaction card's category badge opens the CategoryPicker to change the category
  3. Tapping a transaction card expands it to show memo, splits, and notes
  4. Filters collapse into a "Filter" button with an active filter count badge on mobile
  5. Form inputs use 16px minimum font size to prevent iOS auto-zoom
**Plans**: 1 plan
  - [ ] 22-01-PLAN.md — TransactionCard component, mobile card list, filter collapse, TOUCH-02 input fixes

### Phase 23: Budget Cards
**Goal**: Replace the desktop budget grid with stacked category cards on mobile, with color-coded progress bars and tap-to-edit allocation
**Depends on**: Phase 21 (layout shell must exist)
**Requirements**: BUD-01, BUD-02, BUD-03, BUD-04, BUD-05
**Success Criteria** (what must be TRUE):
  1. On mobile, budget categories display as stacked cards grouped by category group — the desktop grid is hidden
  2. Each card shows category name, color-coded progress bar (green/yellow/red), spent/budgeted amounts, and remaining
  3. Tapping a budget card expands inline editing for the allocation amount
  4. The month selector is full-width with left/right navigation arrows on mobile
**Plans**: 1 plan
  - [ ] 23-01-PLAN.md — Extract AllocationCell, create BudgetCategoryCard, mobile card section + responsive month selector

### Phase 24: Modal Conversions
**Goal**: Convert desktop-centered modals to full-screen bottom sheets on mobile with drag-to-dismiss and backdrop tap to close
**Depends on**: Phase 21 (Sheet component must exist)
**Requirements**: MODAL-01, MODAL-02, MODAL-03, MODAL-04, MODAL-05, TOUCH-03
**Success Criteria** (what must be TRUE):
  1. SplitModal renders as a full-screen bottom sheet on mobile and a centered modal on desktop
  2. ManualTransactionForm renders as a full-screen bottom sheet on mobile and a centered modal on desktop
  3. All bottom sheets support drag-to-dismiss and backdrop tap to close
  4. RuleForm and ManualLinkModal render as full-screen sheets on mobile
  5. Form layouts stack vertically on mobile with full-width inputs
**Plans**: TBD

### Phase 25: Remaining Pages
**Goal**: Ensure all remaining pages (Dashboard, Accounts, Reports, Chat, Categories, Rules) display correctly at 375px width
**Depends on**: Phase 21 (layout foundation), Phase 24 (sheet patterns for any page-specific modals)
**Requirements**: PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-06
**Success Criteria** (what must be TRUE):
  1. Dashboard displays as single-column cards with no overflow at 375px
  2. Accounts page stacks account cards vertically with no horizontal overflow
  3. Reports page charts are readable at 375px width with simplified axis labels
  4. Chat page input bar is fixed above the bottom tab bar with safe area inset on mobile
  5. Categories page drag handles meet 44px tap target and Rules page shows rules as cards on mobile
**Plans**: 2 plans
  - [ ] 25-01-PLAN.md — ReportsPage, ChatPage, CategoriesPage mobile fixes (date filter stacking, dvh height, safe area inset, drag handle tap targets)
  - [ ] 25-02-PLAN.md — RulesPage mobile card layout + DashboardPage/AccountsPage 375px audit

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
**Plans**: 1 plan
  - [ ] 19-01-PLAN.md — Fix KeepAlive dict form and verify all PROC requirements

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
| 18. Production Build and Directory Layout | v2.1 | 2/2 | Complete | 2026-03-23 |
| 19. Service Configuration | v2.1 | 1/1 | Complete | 2026-03-24 |
| 20. Deploy Scripts | v2.1 | 2/2 | Complete | 2026-03-24 |
| 21. Layout Foundation | 2/2 | Complete    | 2026-03-24 | — |
| 22. Transaction Cards | 1/1 | Complete    | 2026-03-24 | — |
| 23. Budget Cards | 1/1 | Complete    | 2026-03-24 | — |
| 24. Modal Conversions | 1/1 | Complete    | 2026-03-24 | — |
| 25. Remaining Pages | 2/2 | Complete   | 2026-03-24 | — |
