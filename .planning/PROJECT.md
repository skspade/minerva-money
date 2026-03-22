# Minerva Money

## What This Is

A single-user personal budgeting web app replacing Monarch Money. Built with React, Express, tRPC, and SQLite, hosted on a home iMac server. Pulls financial data from SimpleFIN (MX upstream) and uses envelope budgeting to assign every dollar a job.

## Core Value

Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Dashboard with account balances, top spending categories, and trends
- [ ] Envelope budgeting with monthly periods, twice-monthly funding (15th and last day), and rollovers
- [ ] Default per-category budget allocations, manually overridable
- [ ] Transaction categorization via rules (merchant, amount range, memo) plus manual fallback
- [ ] Rules apply retroactively to all matching transactions
- [ ] Most-specific-rule-wins conflict resolution (ties: newer wins)
- [ ] SimpleFIN sync: twice-daily auto + manual "Sync Now" button
- [ ] Transaction deduplication: transactionId primary, hash fallback (account + date + amount + merchant)
- [ ] Transfer detection: auto-suggest + manual confirm, excluded from spending reports
- [ ] Investment accounts shown as balance-only for net worth
- [ ] Daily balance snapshots per account for net worth and spending trends
- [ ] Sync error logging + in-app status indicator (last sync time, errors)
- [ ] iCloud Drive backup via atomic SQLite snapshots (every 6 hours + post-sync)

### Out of Scope

- Portfolio breakdown / gain-loss tracking — just need balance for net worth
- Mobile app — web-only, accessed from any device on the network
- Multi-user / auth — single user on private home server
- Recurring transaction management — real transactions come through bank sync
- Freedom Mortgage direct connection — payment shows as bank debit
- External alerts (push/email) for sync failures — in-app indicator sufficient

## Context

- Replacing Monarch Money with a self-hosted alternative
- SimpleFIN costs $15/year, connects to MX (16,000+ institutions)
- Three institutions: Discover (banking + HELOC), Fidelity (investments), Consumers Credit Union (banking)
- Pay schedule: bi-monthly (15th and last day of month), equal split
- SimpleFIN rate limit: 24 requests/day per account, 90-day max date range
- Freedom Mortgage blocks all aggregators but payments appear as bank debits — no special handling needed
- Discover HELOC discontinued July 2025 (Capital One acquisition) — existing loan still serviced

## Constraints

- **Tech stack**: React + Tailwind (custom components) / Express + tRPC / SQLite via better-sqlite3 / TanStack Query — all TypeScript
- **Infrastructure**: Single iMac home server, SQLite single-file database
- **Data provider**: SimpleFIN only — 24 req/day/account, daily refresh cycle
- **Security**: SimpleFIN credentials in .env file (gitignored), no auth layer needed
- **Backup**: SQLite .backup to iCloud Drive, not live sync (corruption risk)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| tRPC over REST/GraphQL | End-to-end type safety, zero codegen, both sides TypeScript | — Pending |
| Envelope budgeting (not tracking-only) | Every dollar assigned a job — matches user's budgeting philosophy | — Pending |
| Most-specific-rule-wins for categorization | Intuitive behavior without manual priority ordering | — Pending |
| Hash-based dedup fallback | Some providers reuse/change transactionIds — hash of account+date+amount+merchant as safety net | — Pending |
| Balance-only for investments | Keeps scope minimal — net worth is the goal, not portfolio management | — Pending |
| No auth layer | Single user on private home server — unnecessary complexity | — Pending |
| .env for secrets | Simple and sufficient for single-user home server | — Pending |

---
*Last updated: 2026-03-22 after initialization*
