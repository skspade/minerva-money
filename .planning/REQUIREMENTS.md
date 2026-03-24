# Requirements: Minerva Money

**Defined:** 2026-03-24
**Core Value:** Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## v2.3 Requirements

Requirements for CSV Import milestone. Each maps to roadmap phases.

### CSV Parsing

- [ ] **CSV-01**: User can upload a Monarch Money CSV file via drag-and-drop or file picker
- [ ] **CSV-02**: System parses the 8-column Monarch format (Date, Merchant, Category, Account, Original Statement, Notes, Amount, Tags) with auto-detected delimiter (tab or comma)
- [ ] **CSV-03**: System validates each row and reports errors (missing date, invalid amount, missing merchant) with row numbers
- [ ] **CSV-04**: System strips UTF-8 BOM and handles CRLF line endings without errors
- [ ] **CSV-05**: System converts decimal dollar amounts to integer cents using existing `toCents()` function

### Account & Category Mapping

- [ ] **MAP-01**: User can map each unique CSV account name to an existing Minerva account via dropdown
- [ ] **MAP-02**: System auto-suggests account matches by case-insensitive substring matching
- [ ] **MAP-03**: User can map each unique CSV category name to an existing Minerva category or skip it
- [ ] **MAP-04**: System auto-suggests category matches by exact case-insensitive name matching
- [ ] **MAP-05**: All CSV accounts must be mapped before import can proceed; unmapped categories default to uncategorized

### Import Execution

- [ ] **IMP-01**: System inserts transactions atomically in a single SQLite transaction (all-or-nothing)
- [ ] **IMP-02**: System generates dedup hashes using existing `generateDedupHash()` and skips duplicates via `INSERT OR IGNORE`
- [ ] **IMP-03**: System runs the rules engine (`categorizeNewTransactions()`) on all imported transaction IDs post-insert, overriding CSV-mapped categories where rules match
- [ ] **IMP-04**: System runs transfer detection (`detectTransferCandidates()`) on imported transactions post-insert
- [ ] **IMP-05**: System uses "Original Statement" column as payee for dedup hash alignment with SimpleFIN-synced transactions

### Import UI

- [ ] **UI-01**: Import page displays a 3-step wizard: upload → preview/map → confirm/import
- [ ] **UI-02**: Preview step shows first 10 sample rows, total row count, and any parse errors
- [ ] **UI-03**: Confirm step shows summary: new transactions count, duplicates to skip, error rows count
- [ ] **UI-04**: After import, success screen shows imported count, skipped count, and link to Transactions page
- [ ] **UI-05**: Import page is mobile-responsive with stacked layout on small screens

### Navigation

- [ ] **NAV-01**: Import page is accessible at `/import` route
- [ ] **NAV-02**: "Import" link appears in desktop navigation bar
- [ ] **NAV-03**: "Import" appears in mobile "More" bottom sheet

## Future Requirements

Deferred to later release. Tracked but not in current roadmap.

### Extended Import

- **EXTI-01**: Support multiple CSV formats with a format selector dropdown
- **EXTI-02**: Import history log with timestamp, filename, and row counts
- **EXTI-03**: Inline account creation during import mapping step
- **EXTI-04**: CSV export of transaction data

## Out of Scope

| Feature | Reason |
|---------|--------|
| Generic column mapping UI | Only Monarch format needed; add format selector if second source appears |
| Tag import | Minerva has no tag system; Tags column silently ignored |
| Balance history import | Minerva calculates balances from transactions; historical snapshots would be incomplete |
| Undo/rollback import | Clear preview/confirmation prevents wrong imports; date-range filter+delete as manual fallback |
| OFX/QFX/QIF format support | YAGNI — user migrating from Monarch which exports CSV |
| Streaming/chunked upload | Monarch exports typically < 10K rows; standard file upload sufficient |
| Category creation during import | Requires group assignment and sort ordering — user creates beforehand via Categories page |

## Traceability

Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CSV-01 | — | Pending |
| CSV-02 | — | Pending |
| CSV-03 | — | Pending |
| CSV-04 | — | Pending |
| CSV-05 | — | Pending |
| MAP-01 | — | Pending |
| MAP-02 | — | Pending |
| MAP-03 | — | Pending |
| MAP-04 | — | Pending |
| MAP-05 | — | Pending |
| IMP-01 | — | Pending |
| IMP-02 | — | Pending |
| IMP-03 | — | Pending |
| IMP-04 | — | Pending |
| IMP-05 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| UI-04 | — | Pending |
| UI-05 | — | Pending |
| NAV-01 | — | Pending |
| NAV-02 | — | Pending |
| NAV-03 | — | Pending |

**Coverage:**
- v2.3 requirements: 23 total
- Mapped to phases: 0
- Unmapped: 23 ⚠️

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after initial definition*
