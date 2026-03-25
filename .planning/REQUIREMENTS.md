# Requirements: Minerva Money

**Defined:** 2026-03-25
**Core Value:** Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## v2.7 Requirements

Requirements for Manual Accounts milestone. Each maps to roadmap phases.

### Schema

- [ ] **SCHEMA-01**: Database has a `source` column on accounts table distinguishing manual (`'manual'`) from synced (`'simplefin'`) accounts
- [ ] **SCHEMA-02**: Existing accounts default to `source = 'simplefin'` after migration with no data loss
- [ ] **SCHEMA-03**: Manual account IDs use `manual_` prefix + UUID to avoid collisions with SimpleFIN IDs
- [ ] **SCHEMA-04**: Sync trigger and rate-limit check filter to `source = 'simplefin'` accounts only

### Account CRUD

- [ ] **CRUD-01**: User can create a manual account with name, institution, and type (defaults to banking)
- [ ] **CRUD-02**: User can update name, institution, and type of a manual account
- [ ] **CRUD-03**: User can delete a manual account, cascading removal of all its transactions and related data
- [ ] **CRUD-04**: Service rejects create/update/delete operations on SimpleFIN-synced accounts
- [ ] **CRUD-05**: Manual account balance is computed from sum of transaction amounts (integer cents) and recalculated after each CSV import

### Import Integration

- [ ] **IMPORT-01**: Import wizard account mapping dropdown includes a "+ Create New Account" option
- [ ] **IMPORT-02**: Selecting "+ Create New Account" shows an inline form with name (pre-filled from CSV), institution, and type fields
- [ ] **IMPORT-03**: After inline account creation, the new account is auto-selected in the mapping dropdown
- [ ] **IMPORT-04**: After import execution, `recalculateBalance()` runs for every manual account that received transactions

### Dashboard & Reporting

- [ ] **DASH-01**: Manual accounts appear in the dashboard accounts list alongside synced accounts
- [ ] **DASH-02**: Manual accounts show a "Manual" label and "Last imported" timestamp instead of "Last synced"
- [ ] **DASH-03**: Manual accounts are included in net worth calculations and daily balance snapshots
- [ ] **DASH-04**: Manual account transactions appear in all spending reports and category breakdowns
- [ ] **DASH-05**: Sync Now button is not shown for manual accounts

### Agent

- [ ] **AGENT-01**: Agent has a `create_account` tool that creates manual accounts with confirmation flow
- [ ] **AGENT-02**: Agent `list_accounts` tool response includes the `source` field
- [ ] **AGENT-03**: System prompt includes guidance for creating manual accounts for institutions not in SimpleFIN

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Account Management UI

- **ACCTUI-01**: User can edit and delete manual accounts from a dedicated UI (currently CRUD is tRPC/agent only)
- **ACCTUI-02**: Opening balance pattern documented in UI help text for users without CSV history

### Format Support

- **FMT-01**: Support additional CSV formats beyond Monarch (OFX, QFX, bank-specific)
- **FMT-02**: Manual account type expansion to HELOC or loan

## Out of Scope

| Feature | Reason |
|---------|--------|
| Manual balance entry (override computed balance) | Creates two sources of truth that diverge on every import — transactions are the source of truth |
| Edit/delete SimpleFIN accounts | Sync re-creates/overwrites on next pull — creates confusion and silent data loss |
| Bulk CSV re-import in replace mode | Destroys manual categorizations and rule-applied categories; dedup makes additive re-import safe |
| Manual investment accounts | Investment balances are balance-only (not summed from transactions); scope expansion deferred |
| AccountsPage edit/delete UI | tRPC mutations exist but UI deferred to future milestone — inline import creation is sufficient for v2.7 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 44 | Pending |
| SCHEMA-02 | Phase 44 | Pending |
| SCHEMA-03 | Phase 44 | Pending |
| SCHEMA-04 | Phase 44 | Pending |
| CRUD-01 | Phase 45 | Pending |
| CRUD-02 | Phase 45 | Pending |
| CRUD-03 | Phase 45 | Pending |
| CRUD-04 | Phase 45 | Pending |
| CRUD-05 | Phase 45 | Pending |
| IMPORT-01 | Phase 46 | Pending |
| IMPORT-02 | Phase 46 | Pending |
| IMPORT-03 | Phase 46 | Pending |
| IMPORT-04 | Phase 45 | Pending |
| DASH-01 | Phase 46 | Pending |
| DASH-02 | Phase 46 | Pending |
| DASH-03 | Phase 46 | Pending |
| DASH-04 | Phase 46 | Pending |
| DASH-05 | Phase 46 | Pending |
| AGENT-01 | Phase 46 | Pending |
| AGENT-02 | Phase 46 | Pending |
| AGENT-03 | Phase 46 | Pending |

**Coverage:**
- v2.7 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 after roadmap creation*
