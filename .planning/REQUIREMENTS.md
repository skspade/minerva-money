# Requirements: Minerva Money

**Defined:** 2026-03-26
**Core Value:** Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## v2.8 Requirements

Requirements for Sync Error Visibility milestone. Each maps to roadmap phases.

### Schema

- [ ] **SCHEMA-01**: sync_warnings table persists per-account errors with account_id, account_name, error_code, message, first_seen, last_seen, and occurrence_count
- [ ] **SCHEMA-02**: sync_warnings rows are linked to sync_log entries via foreign key

### Sync Service

- [ ] **SYNC-01**: Sync service writes per-account warnings to sync_warnings table when SimpleFIN returns account-level errors
- [ ] **SYNC-02**: Sync service sets sync_log status to 'partial' when some accounts have errors but the API call succeeded
- [ ] **SYNC-03**: Sync service auto-clears warnings for accounts that sync successfully
- [ ] **SYNC-04**: Sync service maps SimpleFIN error codes and connection-level errors to the correct accounts

### API

- [ ] **API-01**: tRPC sync.status response includes structured warnings array with accountId, accountName, errorCode, message, and lastSeen
- [ ] **API-02**: Warnings are queried from sync_warnings table and returned alongside existing sync status data

### Dashboard UI

- [ ] **DASH-01**: Dashboard sync card shows amber "Partial" badge when sync status is 'partial'
- [ ] **DASH-02**: Dashboard displays per-account error list with account name and simplified error message
- [ ] **DASH-03**: Dashboard shows SimpleFIN reconnect link when connection errors exist
- [ ] **DASH-04**: Dashboard sync card displays cleanly when no warnings exist (no visual regression)

### Navbar

- [ ] **NAV-01**: Navbar SyncStatus shows amber warning indicator when latest sync is 'partial'
- [ ] **NAV-02**: Navbar warning indicator includes tooltip showing count and names of affected accounts

### Agent

- [ ] **AGENT-01**: Agent get_sync_status tool returns sync warnings alongside existing status data

## Future Requirements

### Deferred

- **STALE-01**: Account-level staleness indicator showing per-account last sync time on dashboard — zero backend work, UI polish pass

## Out of Scope

| Feature | Reason |
|---------|--------|
| Push/email notifications for sync failures | Explicitly excluded per PROJECT.md — in-app indicator sufficient for single-user home server |
| Automatic SimpleFIN re-authentication | Requires browser-based OAuth flow at SimpleFIN bridge — cannot be automated server-side |
| Per-account manual retry | SimpleFIN API returns all accounts in one response — cannot selectively re-sync |
| Historical sync error dashboard | No user action beyond "re-auth" or "wait" — occurrence_count provides inline context |
| Granular error severity levels | Only 7 SimpleFIN error codes; amber for warnings, red for total failure is sufficient |
| Toast notifications on sync completion | Sync happens at 6 AM/6 PM — transient toasts would be missed; persistent indicator is better |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | — | Pending |
| SCHEMA-02 | — | Pending |
| SYNC-01 | — | Pending |
| SYNC-02 | — | Pending |
| SYNC-03 | — | Pending |
| SYNC-04 | — | Pending |
| API-01 | — | Pending |
| API-02 | — | Pending |
| DASH-01 | — | Pending |
| DASH-02 | — | Pending |
| DASH-03 | — | Pending |
| DASH-04 | — | Pending |
| NAV-01 | — | Pending |
| NAV-02 | — | Pending |
| AGENT-01 | — | Pending |

**Coverage:**
- v2.8 requirements: 15 total
- Mapped to phases: 0
- Unmapped: 15 ⚠️

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after initial definition*
