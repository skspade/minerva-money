# Requirements: Minerva Money

**Defined:** 2026-03-22
**Core Value:** Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Data Sync

- [ ] **SYNC-01**: App syncs transactions from SimpleFIN with deduplication (transactionId primary, hash fallback)
- [ ] **SYNC-02**: App runs scheduled auto-sync twice daily
- [ ] **SYNC-03**: User can trigger a manual sync via "Sync Now" button
- [ ] **SYNC-04**: App displays sync status indicator showing last sync time and any errors
- [ ] **SYNC-05**: App logs sync failures server-side for debugging

### Accounts

- [ ] **ACCT-01**: User can view all linked accounts with current balances on the dashboard
- [ ] **ACCT-02**: App records daily balance snapshots per account for historical tracking
- [ ] **ACCT-03**: App displays investment accounts as balance-only for net worth calculation
- [ ] **ACCT-04**: User can view transaction list with filtering by date, payee, amount, and category
- [ ] **ACCT-05**: User can search transactions by payee or memo text

### Budgeting

- [ ] **BUDG-01**: User can create and manage budget categories organized into category groups
- [ ] **BUDG-02**: User can allocate money to envelope categories for each monthly period
- [ ] **BUDG-03**: Unspent envelope balances roll forward to the next month automatically
- [ ] **BUDG-04**: Overspent categories deduct from next month's available-to-budget funds
- [ ] **BUDG-05**: User can set default monthly allocation per category
- [ ] **BUDG-06**: App auto-populates envelope allocations on the 15th and last day of each month using defaults
- [ ] **BUDG-07**: User can manually override any auto-populated allocation

### Categorization

- [ ] **CATG-01**: User can manually assign a category to any transaction
- [ ] **CATG-02**: User can create categorization rules matching on merchant name, amount range, and/or memo text
- [ ] **CATG-03**: Rules apply retroactively to all existing matching transactions when created
- [ ] **CATG-04**: Rules apply automatically to all future matching transactions
- [ ] **CATG-05**: When multiple rules match, the most specific rule wins (ties: newer wins)
- [ ] **CATG-06**: User can split a single transaction across multiple categories
- [ ] **CATG-07**: App auto-suggests transfer pairs by matching offsetting transactions across accounts
- [ ] **CATG-08**: User can manually confirm or link transfer pairs
- [ ] **CATG-09**: Confirmed transfers are excluded from budget and spending reports

### Reporting

- [ ] **REPT-01**: User can view spending by category as pie/bar charts, filterable by date range
- [ ] **REPT-02**: User can view spending trends over time as line charts showing month-over-month patterns
- [ ] **REPT-03**: User can view net worth trend as a line chart over time

### Transactions

- [ ] **TXNR-01**: User can manually enter a transaction (amount, payee, date, category, account)

### Infrastructure

- [x] **INFR-01**: App performs atomic SQLite backups to iCloud Drive every 6 hours via launchd
- [x] **INFR-02**: App triggers SQLite backup after every SimpleFIN sync completion
- [x] **INFR-03**: App retains 30 days of timestamped backup snapshots plus a latest copy
- [x] **INFR-04**: All money values are stored as integers (cents) to avoid floating-point errors

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Reporting

- **ADVR-01**: User can view income vs expense reports
- **ADVR-02**: User can view cash flow reports
- **ADVR-03**: User can view year-over-year spending comparisons

### Claude Integration

- **CLAI-01**: App exposes an MCP server or CLI for Claude to query accounts, transactions, budgets, and spending data
- **CLAI-02**: Claude can perform actions like categorizing transactions, adjusting budgets, or triggering syncs

### Export

- **EXPT-01**: User can export transactions as CSV for tax preparation

### Budget Workflow

- **BWRK-01**: User can copy budget allocations from a prior month as a template
- **BWRK-02**: User can receive in-app warnings when approaching category budget limits

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-user / authentication | Single user on private home server — unnecessary complexity |
| Mobile native app | Web UI is responsive and accessible from any device on the network |
| Investment portfolio tracking | Balance-only needed for net worth; portfolio detail is enormous scope |
| AI/ML categorization | Rules engine is deterministic and debuggable; ML requires training data and model hosting |
| Recurring transaction forecasting | Real transactions arrive via bank sync; predictions add complexity without value |
| Goal tracking / savings targets | Envelope categories serve this purpose (e.g., "Vacation Fund" with rollover) |
| Credit card payment categories | Credit card payments are transfers between accounts; spending tracked at charge time |
| Bill calendar view | Duplicates what bank sync provides; more UI surface to maintain |
| Cryptocurrency tracking | Out of scope for user's financial picture |
| Push notifications / email alerts | In-app indicator sufficient for single user |
| Freedom Mortgage direct connection | Payment appears as bank debit from linked account |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SYNC-01 | Phase 2 | Pending |
| SYNC-02 | Phase 2 | Pending |
| SYNC-03 | Phase 3 | Pending |
| SYNC-04 | Phase 3 | Pending |
| SYNC-05 | Phase 2 | Pending |
| ACCT-01 | Phase 9 | Pending |
| ACCT-02 | Phase 2 | Pending |
| ACCT-03 | Phase 3 | Pending |
| ACCT-04 | Phase 3 | Pending |
| ACCT-05 | Phase 3 | Pending |
| BUDG-01 | Phase 4 | Pending |
| BUDG-02 | Phase 7 | Pending |
| BUDG-03 | Phase 7 | Pending |
| BUDG-04 | Phase 7 | Pending |
| BUDG-05 | Phase 7 | Pending |
| BUDG-06 | Phase 7 | Pending |
| BUDG-07 | Phase 8 | Pending |
| CATG-01 | Phase 4 | Pending |
| CATG-02 | Phase 5 | Pending |
| CATG-03 | Phase 5 | Pending |
| CATG-04 | Phase 5 | Pending |
| CATG-05 | Phase 5 | Pending |
| CATG-06 | Phase 4 | Pending |
| CATG-07 | Phase 6 | Pending |
| CATG-08 | Phase 6 | Pending |
| CATG-09 | Phase 6 | Pending |
| REPT-01 | Phase 9 | Pending |
| REPT-02 | Phase 9 | Pending |
| REPT-03 | Phase 9 | Pending |
| TXNR-01 | Phase 4 | Pending |
| INFR-01 | Phase 1 | Done |
| INFR-02 | Phase 1 | Done |
| INFR-03 | Phase 1 | Done |
| INFR-04 | Phase 1 | Done |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-22 after roadmap creation — all 34 requirements mapped*
