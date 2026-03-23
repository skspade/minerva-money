# Minerva Money

Personal budgeting app to replace Monarch Money. Single-user web app hosted on a home iMac server.

## Tech Stack

- **Frontend:** React + Tailwind CSS (custom components)
- **Backend:** Express + tRPC
- **Language:** TypeScript (full stack)
- **Database:** SQLite via `better-sqlite3`
- **Data Fetching:** tRPC + TanStack Query (React Query)
- **Data Provider:** SimpleFIN (custom client, see `simplefin.ts`)

## Application Architecture

### Layers

- **React SPA** — dashboard, transaction management, budget views, settings
- **tRPC API** — type-safe RPC layer between client and server
- **Service Layer** — business logic (budgeting, categorization, sync)
- **Data Access** — `better-sqlite3` queries against SQLite

### Dashboard

The home screen displays:

- **Account balances** — current balances for all linked accounts
- **Top spending categories** — highest spend envelopes for the current period
- **Trends** — spending and net worth over time (powered by daily balance snapshots)

## Budgeting

### Envelope Method

Every dollar gets assigned to a category (envelope). Monthly budget periods.

- **Funding:** Twice monthly — 15th and last day of the month (matching pay schedule)
- **Rollovers:** Unspent money in an envelope rolls over to the next month
- **Default allocations:** Each envelope has a default monthly allocation, auto-split across the two pay periods. Can be manually overridden.

## Categorization

### Rules-Based + Manual

Transactions are categorized by matching rules. Unmatched transactions require manual categorization.

### Rule Matching

Rules match on any combination of:

- **Merchant name**
- **Amount range**
- **Memo text**

### Rule Application

- Rules apply **retroactively** — creating a new rule updates all existing transactions that match
- Rules apply to all future transactions automatically

### Conflict Resolution

When multiple rules match a transaction:

- **Most specific rule wins** — a rule matching on merchant + amount + memo beats one matching merchant alone
- **Ties:** newer rule wins

## Transfers

Transfers between owned accounts (e.g., Discover checking → Consumers CU) are detected and handled:

- **Auto-detect:** Match offsetting transactions across accounts by amount and date
- **Manual confirm:** User confirms or manually links transfer pairs
- **Reporting:** Transfers are excluded from budget/spending reports but visible in transaction history

## Investments

Fidelity investment data is used for **balance only** — total investment value contributes to net worth. No portfolio breakdown, gain/loss tracking, or asset allocation.

## Infrastructure

- **Host:** Old iMac running as home personal server
- **Database:** SQLite at `~/minerva-money/data/minerva.db`
- **Backup:** Scheduled SQLite snapshots to iCloud Drive (see [Backup Strategy](#backup-strategy--icloud-drive))

## Financial Institutions

| Institution                 | Type                       | Sync Method |
| --------------------------- | -------------------------- | ----------- |
| Discover                    | Banking + Home Equity Loan | SimpleFIN   |
| Fidelity                    | Investments                | SimpleFIN   |
| Consumers Credit Union (IL) | Banking                    | SimpleFIN   |

Freedom Mortgage payments appear as debits from a linked bank account — no direct connection needed.

### Institution Notes

- **Fidelity** blocked Plaid access in late 2023. Routes data through Akoya/Finicity. SimpleFIN accesses Fidelity via its upstream provider MX — confirmed working connectivity including holdings, tickers, cost basis, and market values.
- **Discover** home equity loan business was discontinued July 2025 (Capital One acquisition). Existing loans may still be serviced but long-term aggregator support is uncertain.
- **Consumers Credit Union** is a large IL credit union (~$4.3B assets, top 110 nationally). Likely supported via MX but needs testing.

## SimpleFIN Integration

### Overview

- **Cost:** $15/year flat ($1.50/month)
- **Upstream provider:** MX (16,000+ institutions)
- **Limits:** 25 institutions, 25 apps
- **Refresh:** Daily (~24hr per linked account, timing varies)
- **Rate limit:** 24 requests/day per account
- **History:** 90-day max date range per request
- **Protocol spec:** https://www.simplefin.org/protocol.html (v2 released 2026-03-19)
- No webhooks, no built-in transaction categorization

### How It Works

1. User gets a Setup Token from SimpleFIN Bridge
2. App exchanges Setup Token for a persistent Access URL (one-time POST)
3. Access URL contains Basic Auth credentials — stored in `.env` file
4. GET requests to `{accessUrl}/accounts` return JSON with balances + transactions
5. User can revoke access at any time

### Client Implementation

Custom TypeScript client (`simplefin.ts`) with:

- `SimpleFIN.claimToken(setupToken)` — one-time token exchange
- `new SimpleFIN(accessUrl)` — create client from stored Access URL
- `fetchAccounts(opts)` — main method with date range, account filtering, pending, balances-only
- `fetchBalances()` — quick balance check (saves quota)
- `fetchTransactions(accountId, start, end)` — single account transactions
- `fetchFullHistory()` — 90-day backfill with pending included
- Normalize helpers: `normalizeAccount()`, `normalizeTransaction()`, `parseAmount()`, `epochToDate()`

### Sync Strategy

- **Scheduled:** Twice daily auto-sync
- **Manual:** "Sync Now" button in the UI
- **Quota:** 24 requests/day per account (3 accounts = 72 total). Twice-daily auto-sync uses 6, leaving plenty of headroom for manual syncs.

### Transaction Deduplication

Transactions are deduplicated on ingest using a two-tier strategy:

1. **Primary:** SimpleFIN `transactionId` — used when available and stable
2. **Fallback:** Hash of `account + date + amount + merchant` — covers cases where providers reuse or change transaction IDs

### Error Handling

- **Logging:** Sync failures logged server-side for debugging
- **UI indicator:** In-app sync status showing last successful sync time and any errors (banner/badge)
- Rate limit violations surface as warnings in SimpleFIN's `errlist` response field

### API Limits to Remember

- 24 requests/day per account
- 90-day max date range per request
- Data refreshes once daily per linked account (timing varies)
- Rate limit violations → warning messages in `errlist`, then token disabled

## Historical Tracking

Daily balance snapshots are recorded per account to power:

- **Net worth trends** — total across all accounts over time
- **Spending trends** — category-level spending patterns
- **Dashboard trends widget**

## Security

- **SimpleFIN credentials:** Stored in `.env` file, loaded at server startup
- `.env` is gitignored and lives outside the repo
- Single-user app on a private home server — no auth layer needed

## Provider Comparison

| Provider  | Pricing                | Personal Use Viable? | Notes                                              |
| --------- | ---------------------- | -------------------- | -------------------------------------------------- |
| SimpleFIN | $15/year               | Best option          | MX upstream, simple API                            |
| Plaid     | ~$2-10/month           | Good backup          | Best DX, but Fidelity blocked                      |
| Finicity  | Sales call required    | No                   | Fidelity OAuth partner but enterprise-only         |
| MX        | ~$15k/year             | No                   | Enterprise pricing                                 |
| Yodlee    | $1-2k/month base       | No                   | Enterprise pricing                                 |
| Teller    | Free (100 connections) | Limited              | Depository/credit only, no investments/loans       |
| Akoya     | Enterprise/opaque      | No                   | Fidelity co-owned, but inaccessible for personal   |
| Sophtron  | Free                   | Experimental         | AI scraping, unproven reliability                  |

## Backup Strategy — iCloud Drive

### Why Not Live Sync?

SQLite writes to multiple files (.db, -wal, -shm). If iCloud Drive syncs mid-write, the remote copy can be corrupted. Instead, use scheduled atomic snapshots via `sqlite3 .backup`.

### Architecture

- **Live DB:** `~/minerva-money/data/minerva.db` (normal local directory, NOT in iCloud)
- **Backup target:** `/Library/Mobile Documents/com~apple~CloudDrive/MinervaBackups/`
- **Method:** `sqlite3 .backup` — atomic, safe even during writes
- **Schedule:** Every 6 hours via launchd + on every SimpleFIN sync completion
- **Retention:** 30 days of timestamped snapshots, plus a `minerva_latest.db` for easy restore
- **Access:** Backups auto-sync to any device on the same iCloud account (Files → iCloud Drive → MinervaBackups on iOS)

### Backup Script

`~/minerva-money/backup-to-icloud.sh`:

```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDrive/MinervaBackups"
mkdir -p "$BACKUP_DIR"

# Atomic backup — safe even during writes
sqlite3 ~/minerva-money/data/minerva.db ".backup '$BACKUP_DIR/minerva_$TIMESTAMP.db'"

# Keep a "latest" copy for easy restore
cp "$BACKUP_DIR/minerva_$TIMESTAMP.db" "$BACKUP_DIR/minerva_latest.db"

# Prune backups older than 30 days
find "$BACKUP_DIR" -name "minerva_*.db" -mtime +30 -delete
```

### launchd Schedule

`~/Library/LaunchAgents/com.minerva.backup.plist` — runs every 6 hours + at login.

Load with: `launchctl load ~/Library/LaunchAgents/com.minerva.backup.plist`

### Programmatic Backup

`better-sqlite3` has a `.backup()` method — trigger after every SimpleFIN sync.

## To Do

- [ ] Sign up for SimpleFIN Bridge ($15/year)
- [ ] Test Discover banking connection via SimpleFIN
- [ ] Test Fidelity investment connection via SimpleFIN
- [ ] Test Consumers CU connection via SimpleFIN
- [ ] Set up SQLite database schema (accounts, transactions, categories, budget allocations, rules, transfer links, balance snapshots)
- [ ] Set up Express + tRPC backend
- [ ] Set up React + Tailwind frontend with TanStack Query
- [ ] Build transaction normalization + deduplication layer
- [ ] Build categorization rules engine (merchant, amount, memo matching)
- [ ] Build envelope budget system with default allocations and rollovers
- [ ] Build transfer detection and linking
- [ ] Build dashboard (balances, top categories, trends)
- [ ] Implement scheduled sync (twice daily) + manual sync button
- [ ] Build sync status indicator in UI
- [ ] Create backup-to-icloud.sh script
- [ ] Set up launchd plist for scheduled backups
- [ ] Add programmatic backup trigger after SimpleFIN sync (better-sqlite3 .backup())
