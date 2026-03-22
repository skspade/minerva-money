# Minerva Money

Personal budgeting app to replace Monarch Money.

## Tech Stack

- TypeScript / Node.js
- SQLite (single-file DB, atomic backups, ideal for single-user)
- SimpleFIN client (custom-built, see `simplefin.ts`)
- `better-sqlite3` npm package

## Infrastructure

- **Host:** Old iMac running as home personal server
- **Database:** SQLite at `~/minerva-money/data/minerva.db`
- **Backup:** Scheduled SQLite snapshots to iCloud Drive (see [Backup Strategy](#backup-strategy--icloud-drive))

## Financial Institutions

| Institution               | Type                       | Sync Method                         |
| ------------------------- | -------------------------- | ----------------------------------- |
| Discover                  | Banking + Home Equity Loan | SimpleFIN                           |
| Freedom Mortgage          | Mortgage                   | Manual entry (recurring transaction)|
| Fidelity                  | Investments                | SimpleFIN                           |
| Consumers Credit Union (IL) | Banking                  | SimpleFIN                           |

### Institution Notes

- **Fidelity** blocked Plaid access in late 2023. Routes data through Akoya/Finicity. SimpleFIN accesses Fidelity via its upstream provider MX — confirmed working connectivity including holdings, tickers, cost basis, and market values.
- **Freedom Mortgage** has deployed MFA that blocks all third-party aggregation. No aggregator has working connectivity. Mortgage payments are fixed/predictable, so a recurring transaction is the most reliable approach. Check their portal for downloadable statements (CSV/PDF parsing) as a secondary option.
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
3. Access URL contains Basic Auth credentials — store securely
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

### API Limits to Remember

- 24 requests/day per account
- 90-day max date range per request
- Data refreshes once daily per linked account (timing varies)
- Rate limit violations → warning messages in `errlist`, then token disabled

## Provider Comparison

| Provider  | Pricing           | Personal Use Viable? | Notes                                          |
| --------- | ----------------- | -------------------- | ---------------------------------------------- |
| SimpleFIN | $15/year          | Best option          | MX upstream, simple API                        |
| Plaid     | ~$2-10/month      | Good backup          | Best DX, but Fidelity blocked                  |
| Finicity  | Sales call required | No                 | Fidelity OAuth partner but enterprise-only     |
| MX        | ~$15k/year        | No                   | Enterprise pricing                             |
| Yodlee    | $1-2k/month base  | No                   | Enterprise pricing                             |
| Teller    | Free (100 connections) | Limited           | Depository/credit only, no investments/loans   |
| Akoya     | Enterprise/opaque | No                   | Fidelity co-owned, but inaccessible for personal |
| Sophtron  | Free              | Experimental         | AI scraping, unproven reliability              |

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

`better-sqlite3` has a `.backup()` method — trigger after every SimpleFIN sync (only once daily anyway).

## To Do

- [ ] Sign up for SimpleFIN Bridge ($15/year)
- [ ] Test Discover banking connection via SimpleFIN
- [ ] Test Fidelity investment connection via SimpleFIN
- [ ] Test Consumers CU connection via SimpleFIN
- [ ] Set up SQLite database schema
- [ ] Build transaction normalization + categorization layer
- [ ] Implement recurring transaction feature for Freedom Mortgage
- [ ] Build initial budget category system
- [ ] Create backup-to-icloud.sh script
- [ ] Set up launchd plist for scheduled backups
- [ ] Add programmatic backup trigger after SimpleFIN sync (better-sqlite3 .backup())
