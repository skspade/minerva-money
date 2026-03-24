# Requirements: Minerva Money

**Defined:** 2026-03-24
**Core Value:** Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## v2.4 Requirements

Requirements for CSV Import Account Filtering milestone. Each maps to roadmap phases.

### Account Skip

- [ ] **SKIP-01**: User can select "Skip — do not import" for any CSV account in the account mapping dropdown
- [ ] **SKIP-02**: User can see how many rows each CSV account contains to make informed skip decisions
- [ ] **SKIP-03**: Skipped accounts have visually distinct styling (dimmed/amber) in the mapping UI

### Stats Filtering

- [ ] **STAT-01**: Preview stats (total rows, valid rows) exclude rows from skipped accounts
- [ ] **STAT-02**: Sample rows table excludes rows from skipped accounts
- [ ] **STAT-03**: Dedup stats (new/duplicate counts) exclude rows from skipped accounts

### Import Execution

- [ ] **EXEC-01**: Server accepts partial account mappings and skips rows for unmapped accounts instead of throwing
- [ ] **EXEC-02**: Confirm summary (step 3) reflects filtered counts excluding skipped accounts

### Polish

- [ ] **PLSH-01**: "Skip All Unmatched" button sets all accounts without auto-suggested matches to skip
- [ ] **PLSH-02**: Filtered summary banner shows "Importing from X of Y accounts (Z skipped)"

## Future Requirements

None — this is a focused enhancement milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-row skip/include checkboxes | Wrong abstraction level — account-level covers the real use case |
| Server-side preview filtering | Unnecessary complexity — client already has all data to filter locally |
| Auto-skip by account type detection | No account type metadata in CSV — would require fragile name guessing |
| Persistent skip preferences across imports | One-time Monarch migration — not a recurring workflow |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SKIP-01 | Pending | Pending |
| SKIP-02 | Pending | Pending |
| SKIP-03 | Pending | Pending |
| STAT-01 | Pending | Pending |
| STAT-02 | Pending | Pending |
| STAT-03 | Pending | Pending |
| EXEC-01 | Pending | Pending |
| EXEC-02 | Pending | Pending |
| PLSH-01 | Pending | Pending |
| PLSH-02 | Pending | Pending |

**Coverage:**
- v2.4 requirements: 10 total
- Mapped to phases: 0
- Unmapped: 10 ⚠️

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after initial definition*
