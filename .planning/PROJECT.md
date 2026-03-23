# Minerva Money

## What This Is

A single-user personal budgeting web app replacing Monarch Money. Built with React, Express, tRPC, and SQLite, hosted on a home iMac server. Pulls financial data from SimpleFIN (MX upstream) and uses envelope budgeting to assign every dollar a job. Ships with a full dashboard, spending/net-worth charts, categorization rules engine, transfer detection, and twice-monthly auto-funding.

## Core Value

Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## Requirements

### Validated

- ✓ Dashboard with account balances, top spending categories, and trends — v1.0
- ✓ Envelope budgeting with monthly periods, twice-monthly funding (15th and last day), and rollovers — v1.0
- ✓ Default per-category budget allocations, manually overridable — v1.0
- ✓ Transaction categorization via rules (merchant, amount range, memo) plus manual fallback — v1.0
- ✓ Rules apply retroactively to all matching transactions — v1.0
- ✓ Most-specific-rule-wins conflict resolution (ties: newer wins) — v1.0
- ✓ SimpleFIN sync: twice-daily auto + manual "Sync Now" button — v1.0
- ✓ Transaction deduplication: transactionId primary, hash fallback (account + date + amount + merchant) — v1.0
- ✓ Transfer detection: auto-suggest + manual confirm, excluded from spending reports — v1.0
- ✓ Investment accounts shown as balance-only for net worth — v1.0
- ✓ Daily balance snapshots per account for net worth and spending trends — v1.0
- ✓ Sync error logging + in-app status indicator (last sync time, errors) — v1.0
- ✓ iCloud Drive backup via atomic SQLite snapshots (every 6 hours + post-sync) — v1.0

### Active

- [ ] Claude Agent SDK integration — conversational agent with custom tools wrapping service functions (v2.0)
- [ ] Chat UI in web app — full-height chat page with markdown rendering (v2.0)
- [ ] Agent query tools — account balances, budget summary, spending, net worth, transactions, categories, rules, sync status (v2.0)
- [ ] Agent action tools — categorize transactions, manage rules, adjust budgets, handle transfers, trigger sync (v2.0)
- [ ] Confirmation flow — agent auto-executes most actions, requires confirmation for amount changes (v2.0)

## Current Milestone: v2.0 Claude Agent

**Goal:** Add a Claude-powered conversational agent accessible through a chat UI, capable of querying and acting on financial data.

**Target features:**
- Agent SDK integration with custom tools wrapping existing service functions
- Chat UI page in the React app with markdown rendering
- Query tools for all financial data (balances, budgets, spending, net worth)
- Action tools for categorization, rules, budgets, transfers, and sync
- Permission model: auto-execute most actions, confirm amount changes

### Out of Scope

- Portfolio breakdown / gain-loss tracking — just need balance for net worth
- Mobile app — web-only, accessed from any device on the network
- Multi-user / auth — single user on private home server
- Recurring transaction management — real transactions come through bank sync
- Freedom Mortgage direct connection — payment shows as bank debit
- External alerts (push/email) for sync failures — in-app indicator sufficient

## Context

- Shipped v1.0 with 8,142 LOC TypeScript across 215 files
- Tech stack: React + Tailwind / Express + tRPC / SQLite via better-sqlite3 / TanStack Query
- Replacing Monarch Money with a self-hosted alternative
- SimpleFIN costs $15/year, connects to MX (16,000+ institutions)
- Three institutions: Discover (banking + HELOC), Fidelity (investments), Consumers Credit Union (banking)
- Pay schedule: bi-monthly (15th and last day of month), equal split
- SimpleFIN rate limit: 24 requests/day per account, 90-day max date range
- Freedom Mortgage blocks all aggregators but payments appear as bank debits — no special handling needed
- Discover HELOC discontinued July 2025 (Capital One acquisition) — existing loan still serviced
- Known tech debt: orphaned budget.allocations.byMonth procedure, client uses inline cents conversion instead of shared helper, 2 redundant backup tests

## Constraints

- **Tech stack**: React + Tailwind (custom components) / Express + tRPC / SQLite via better-sqlite3 / TanStack Query — all TypeScript
- **Infrastructure**: Single iMac home server, SQLite single-file database
- **Data provider**: SimpleFIN only — 24 req/day/account, daily refresh cycle
- **Security**: SimpleFIN + Anthropic API credentials in .env file (gitignored), no auth layer needed
- **Backup**: SQLite .backup to iCloud Drive, not live sync (corruption risk)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| tRPC over REST/GraphQL | End-to-end type safety, zero codegen, both sides TypeScript | ✓ Good — clean service layer separation achieved |
| Envelope budgeting (not tracking-only) | Every dollar assigned a job — matches user's budgeting philosophy | ✓ Good — rollover and auto-funding working |
| Most-specific-rule-wins for categorization | Intuitive behavior without manual priority ordering | ✓ Good — specificity scoring tested with 32 tests |
| Hash-based dedup fallback | Some providers reuse/change transactionIds — hash of account+date+amount+merchant as safety net | ✓ Good — layered dedup via primary key + hash UNIQUE |
| Balance-only for investments | Keeps scope minimal — net worth is the goal, not portfolio management | ✓ Good — net worth chart working |
| Design tRPC API with future MCP/CLI exposure in mind | Claude integration planned for v2; service layer should be cleanly separable from tRPC routers | ✓ Good — all business logic in service functions |
| No auth layer | Single user on private home server — unnecessary complexity | ✓ Good |
| .env for secrets | Simple and sufficient for single-user home server | ✓ Good |
| Twice-monthly auto-funding with half-split math | Matches pay schedule; floor for first half, remainder for second | ✓ Good — idempotent funding preserves manual overrides |
| Integer cents for all money | Avoid floating-point errors in budget math | ✓ Good — enforced at schema level |
| Gap closure phases (10-13) | Audit revealed missing verification and UI gaps | ✓ Good — all 34 requirements satisfied |
| Claude Agent SDK over MCP server | Agent SDK provides built-in tool execution, sessions, and hooks — more powerful than raw MCP for a chat-based agent | — Pending |
| Direct service binding for agent tools | Custom tools wrapping service functions vs raw DB access — safer, type-safe, explicit permissions | — Pending |
| Server-side agent execution | API key stays secure on server, agent runs in Express process | — Pending |
| Collect-and-return over streaming | Simpler architecture; upgrade to WebSocket streaming later if response times are slow | — Pending |

---
*Last updated: 2026-03-23 after v2.0 milestone start*
