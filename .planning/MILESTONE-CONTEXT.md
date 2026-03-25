# Milestone Context

**Source:** Brainstorm session (Manual Accounts & CSV Import)
**Design:** .planning/designs/2026-03-25-manual-accounts-csv-import-design.md

## Milestone Goal

Enable manual account creation and CSV transaction import for accounts that cannot be synced via SimpleFIN. Manual accounts are fully integrated into budgets, reports, dashboard, and net worth — they behave identically to synced accounts except their data comes from user-uploaded CSVs instead of automatic sync.

## Features

### Database Schema Changes

Add a `source` column to the `accounts` table to distinguish manually created accounts from SimpleFIN-synced ones. Existing accounts default to `'simplefin'`, manual accounts are created with `source = 'manual'`. Manual account IDs use a `manual_` prefix + UUID. Balance is computed from transaction sums. The `simplefin_id` column remains nullable (NULL for manual accounts). The `last_synced` column stores the last CSV import timestamp for manual accounts.

### Account CRUD Service & API

New service at `packages/server/src/accounts/accounts-service.ts` with createAccount, updateAccount, deleteAccount, and recalculateBalance functions. tRPC mutations: accounts.create, accounts.update, accounts.delete. All mutations check `source = 'manual'` before allowing modification. Type defaults to `'banking'`.

### Import Flow Integration

Add "+ Create New Account" option to the account mapping dropdown in the existing CSV import wizard. Inline form collects name, institution, and type. Client calls accounts.create, new account auto-selected in mapping. After executeImport(), recalculateBalance() runs for manual accounts. No changes to parsing, dedup, or categorization.

### Balance Management & Dashboard Integration

Balance = sum of all transaction amounts (integer cents), recalculated after each CSV import. Manual accounts appear in dashboard, net worth, spending reports, category breakdowns. Transfer detection and budget system treat manual transactions identically. Visual distinction: "Manual" label, "Last imported" instead of "Last synced", no Sync Now button.

### Agent Tool Integration

Add create_account tool to Claude agent wrapping accounts.create() with confirmation flow. Update list_accounts to include source field. System prompt guidance for creating manual accounts.
