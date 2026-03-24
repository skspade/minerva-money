# Requirements: Minerva Money

**Defined:** 2026-03-23
**Core Value:** Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## v2.2 Requirements

Requirements for mobile-friendly UI milestone. Each maps to roadmap phases.

### Navigation

- [x] **NAV-01**: User sees a fixed bottom tab bar with 5 tabs (Dashboard, Transactions, Budget, Chat, More) on screens below 768px
- [x] **NAV-02**: User can tap the "More" tab to open a bottom sheet listing Accounts, Categories, Rules, Transfers, and Reports
- [x] **NAV-03**: Desktop horizontal navbar remains unchanged and hidden on mobile; bottom tab bar hidden on desktop
- [x] **NAV-04**: Active tab is visually highlighted and updates on navigation
- [x] **NAV-05**: "More" sheet auto-closes when user navigates to a page

### Transactions

- [x] **TXN-01**: User sees transactions as stacked cards (not a table) on mobile, showing merchant, amount, date, account, and category
- [x] **TXN-02**: User can tap a transaction card's category badge to change the category via CategoryPicker
- [x] **TXN-03**: User can tap a transaction card to expand and view details (memo, splits, notes)
- [x] **TXN-04**: Transaction filters collapse into a "Filter" button on mobile with active filter count badge
- [x] **TXN-05**: Desktop transaction table remains unchanged on screens above 768px

### Budget

- [x] **BUD-01**: User sees budget categories as stacked cards grouped by category group on mobile, replacing the grid layout
- [x] **BUD-02**: Each budget card shows category name, progress bar (color-coded: green/yellow/red), spent/budgeted amounts, and remaining
- [x] **BUD-03**: User can tap a budget category card to expand inline editing for allocation amount
- [x] **BUD-04**: Month selector displays full-width with left/right navigation arrows on mobile
- [x] **BUD-05**: Desktop budget grid layout remains unchanged on screens above 768px

### Layout & Viewport

- [x] **LAYOUT-01**: Viewport meta tag includes `viewport-fit=cover` to enable safe area insets
- [x] **LAYOUT-02**: Bottom tab bar and Chat input bar respect iPhone safe area insets via `env(safe-area-inset-bottom)`
- [x] **LAYOUT-03**: Main content area has bottom padding to clear the fixed bottom tab bar on mobile
- [x] **LAYOUT-04**: Layout uses `min-h-dvh` instead of `min-h-screen` to handle iOS Safari viewport correctly
- [x] **LAYOUT-05**: No horizontal scroll occurs on any page at 375px viewport width

### Touch & Interaction

- [x] **TOUCH-01**: All interactive elements (buttons, links, form inputs, tab bar items) have a minimum 44x44px tap target on mobile
- [x] **TOUCH-02**: Form inputs use `text-base` (16px) minimum font size on mobile to prevent iOS auto-zoom
- [x] **TOUCH-03**: Form layouts stack vertically on mobile with full-width inputs

### Modals & Sheets

- [x] **MODAL-01**: SplitModal renders as a full-screen bottom sheet on mobile and a centered modal on desktop
- [x] **MODAL-02**: ManualTransactionForm renders as a full-screen bottom sheet on mobile and a centered modal on desktop
- [x] **MODAL-03**: Bottom sheets support drag-to-dismiss and backdrop tap to close
- [x] **MODAL-04**: RuleForm renders as a full-screen sheet on mobile
- [x] **MODAL-05**: ManualLinkModal renders as a full-screen sheet on mobile

### Remaining Pages

- [ ] **PAGE-01**: Dashboard page displays correctly at 375px (single-column cards, no overflow)
- [ ] **PAGE-02**: Accounts page stacks account cards vertically with no horizontal overflow on mobile
- [ ] **PAGE-03**: Reports page charts render readable at 375px width with simplified axis labels if needed
- [ ] **PAGE-04**: Chat page input bar is fixed above the bottom tab bar on mobile with safe area inset
- [ ] **PAGE-05**: Categories page drag handles meet 44px tap target on mobile
- [ ] **PAGE-06**: Rules page displays rules as cards instead of table rows on mobile

## v2.1 Requirements (Shipped)

<details>
<summary>Deployment Hardening — 16 requirements</summary>

### Production Build

- [x] **BUILD-01**: Server runs from compiled JavaScript (tsc output), not TypeScript source
- [x] **BUILD-02**: Client static files are served by Express in production (single process, no nginx)
- [x] **BUILD-03**: SPA catch-all route serves index.html for all client-side routes
- [x] **BUILD-04**: Environment variables load via Node 20 native `--env-file` flag (no dotenv)

### Process Management

- [x] **PROC-01**: Server auto-restarts on crash via launchd KeepAlive (dict form: only on non-zero exit)
- [x] **PROC-02**: Server starts automatically on user login via launchd RunAtLoad
- [x] **PROC-03**: Restart throttle prevents rapid restart loops (ThrottleInterval: 10)
- [x] **PROC-04**: Server plist uses correct node binary path for the target machine
- [x] **PROC-05**: Backup plist runs compiled JS instead of tsx source

### Deploy Scripts

- [x] **DEPLOY-01**: `setup.sh` performs first-time install (build, copy plists, load services, health check)
- [x] **DEPLOY-02**: `setup.sh` uses modern `launchctl bootstrap` instead of deprecated `launchctl load`
- [x] **DEPLOY-03**: `deploy.sh` performs one-command update (git pull, install, build, restart)
- [x] **DEPLOY-04**: Deploy scripts validate the node binary path before installing plists
- [x] **DEPLOY-05**: `.env` existence is verified before starting the server

### Directory Layout

- [x] **DIR-01**: All deployment config co-located in `deploy/` directory
- [x] **DIR-02**: Server and backup plists both live in `deploy/` (backup plist moved from repo root)

</details>

## Future Requirements

### Progressive Web App

- **PWA-01**: App can be installed to home screen via manifest
- **PWA-02**: App works offline with cached data

### Advanced Mobile UX

- **UX-01**: Swipe-to-reveal actions on transaction cards
- **UX-02**: Virtualized transaction list for large datasets
- **UX-03**: Sync status badge on Dashboard tab icon

## Out of Scope

| Feature | Reason |
|---------|--------|
| PWA / offline mode | Service worker caching incompatible with live financial data on LAN server |
| Swipe navigation between pages | Gesture conflicts with scroll; complex state coordination |
| Pull-to-refresh | Conflicts with iOS Safari native pull-to-refresh |
| Pinch-to-zoom on charts | Recharts doesn't support it; date range selector is sufficient |
| Infinite scroll | Not needed at this data scale (~hundreds of transactions) |
| Native mobile app | Web-only, accessed via Safari on private network |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| NAV-01 | Phase 21 | Not Started |
| NAV-02 | Phase 21 | Not Started |
| NAV-03 | Phase 21 | Not Started |
| NAV-04 | Phase 21 | Not Started |
| NAV-05 | Phase 21 | Not Started |
| LAYOUT-01 | Phase 21 | Not Started |
| LAYOUT-02 | Phase 21 | Not Started |
| LAYOUT-03 | Phase 21 | Not Started |
| LAYOUT-04 | Phase 21 | Not Started |
| LAYOUT-05 | Phase 21 | Not Started |
| TOUCH-01 | Phase 21 | Not Started |
| TXN-01 | Phase 22 | Not Started |
| TXN-02 | Phase 22 | Not Started |
| TXN-03 | Phase 22 | Not Started |
| TXN-04 | Phase 22 | Not Started |
| TXN-05 | Phase 22 | Not Started |
| TOUCH-02 | Phase 22 | Not Started |
| BUD-01 | Phase 23 | Complete |
| BUD-02 | Phase 23 | Complete |
| BUD-03 | Phase 23 | Complete |
| BUD-04 | Phase 23 | Complete |
| BUD-05 | Phase 23 | Complete |
| MODAL-01 | Phase 24 | Complete |
| MODAL-02 | Phase 24 | Complete |
| MODAL-03 | Phase 24 | Complete |
| MODAL-04 | Phase 24 | Complete |
| MODAL-05 | Phase 24 | Complete |
| TOUCH-03 | Phase 24 | Complete |
| PAGE-01 | Phase 25 | Not Started |
| PAGE-02 | Phase 25 | Not Started |
| PAGE-03 | Phase 25 | Not Started |
| PAGE-04 | Phase 25 | Not Started |
| PAGE-05 | Phase 25 | Not Started |
| PAGE-06 | Phase 25 | Not Started |

**Coverage:**
- v2.2 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after initial definition*
