# Manual Accounts & CSV Import — Design

**Date:** 2026-03-25
**Approach:** Account CRUD API + Import Flow Integration

## Database Schema Changes

Add a `source` column to the `accounts` table to distinguish manually created accounts from SimpleFIN-synced ones. Use a migration:

```sql
ALTER TABLE accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'simplefin';
```

- Existing accounts default to `'simplefin'`
- Manual accounts are created with `source = 'manual'`
- Manual account IDs use a `manual_` prefix + UUID to avoid collisions with SimpleFIN IDs
- Balance for manual accounts is **computed from transaction sums** (no external source of truth), updated on each CSV import or when recalculated
- The `simplefin_id` column remains nullable — manual accounts leave it `NULL`
- The `last_synced` column is reused: for manual accounts it stores the last CSV import timestamp

## Account CRUD Service & API

New service at `packages/server/src/accounts/accounts-service.ts` with functions:

- **`createAccount(name, institution, type)`** — Generates `manual_<uuid>` ID, inserts with `source = 'manual'`, balance 0. Returns the new account.
- **`updateAccount(id, fields)`** — Updates name, institution, and/or type for manual accounts only. Rejects updates to SimpleFIN accounts (their data comes from sync).
- **`deleteAccount(id)`** — Deletes a manual account and all its transactions. Rejects deletion of SimpleFIN accounts. Uses a transaction to clean up related data (splits, budget allocations referencing those transactions).
- **`recalculateBalance(id)`** — Sums all transaction amounts for the account, updates the balance column. Called after each CSV import.

tRPC mutations added to the existing `accountsRouter`:
- `accounts.create` — input: `{ name: string, institution: string, type: string }`
- `accounts.update` — input: `{ id: string, name?: string, institution?: string, type?: string }`
- `accounts.delete` — input: `{ id: string }`

Validation: All mutations check `source = 'manual'` before allowing modification. Type defaults to `'banking'` if not provided.

## Import Flow Integration

Modify the CSV import wizard's account mapping step (Step 2) to add a **"+ Create New Account"** option in each account mapping dropdown. When selected:

1. A small inline form appears below the dropdown with fields: **Name** (pre-filled from CSV account name), **Institution** (text input), **Type** (dropdown: banking)
2. User fills in institution and confirms
3. Client calls `accounts.create` mutation
4. The newly created account appears in the mapping dropdown and is auto-selected
5. Import proceeds normally — the new account ID is included in `accountMappings`

**Server-side changes to import service:**
- After `executeImport()` completes, call `recalculateBalance()` for every manual account that received transactions
- No changes to parsing, dedup, or categorization logic — manual account transactions go through the same pipeline

**UI details:**
- The "Create New Account" option appears at the top of the dropdown, visually distinct (e.g., with a "+" icon)
- After creation, a success indicator briefly shows next to the dropdown
- The inline form is dismissible (cancel returns to the dropdown)

## Balance Management & Dashboard Integration

**Balance computation for manual accounts:**
- Balance = sum of all transaction amounts (stored as integer cents)
- Recalculated after each CSV import via `recalculateBalance()`
- No external balance source — the imported transactions ARE the source of truth

**Dashboard & reporting integration:**
- Manual accounts appear in the accounts list on the Dashboard alongside SimpleFIN accounts
- They're included in net worth calculations (daily balance snapshots continue to work — the snapshot job reads the `balance` column which gets updated on import)
- Manual account transactions appear in spending reports, category breakdowns, and all existing report queries
- Transfer detection runs on imported transactions (cross-account transfer matching works across manual and synced accounts)
- Budget system treats manual account transactions identically

**Visual distinction:**
- Manual accounts show a subtle label (e.g., "Manual") next to the account name in the accounts list
- No "last synced" timestamp shown for manual accounts — instead show "Last imported: {date}" or nothing if no imports yet
- No "Sync Now" button applies to manual accounts

## Agent Tool Integration

Add account creation tools to the Claude agent so manual accounts can also be created via chat:

- **`create_account`** tool — wraps `accounts.create()`, parameters: name, institution, type. Requires confirmation (like budget changes).
- **`list_accounts`** already exists — update it to include the `source` field in responses so the agent can distinguish manual vs synced accounts.

System prompt update: Add guidance that the agent can create manual accounts for institutions not supported by SimpleFIN, and should ask for institution name before creating.
