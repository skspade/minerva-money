# Minerva Money

## What This Is

A single-user personal budgeting web app replacing Monarch Money. Built with React, Express, tRPC, and SQLite, hosted on a home iMac server. Pulls financial data from SimpleFIN (MX upstream) and uses envelope budgeting to assign every dollar a job. Ships with a full dashboard, spending/net-worth charts, categorization rules engine, transfer detection, twice-monthly auto-funding, a Claude-powered conversational agent, and CSV import for migrating transaction history from Monarch Money.

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
- ✓ Claude Agent SDK integration — conversational agent with custom MCP tools wrapping service functions — v2.0
- ✓ Chat UI — full-height chat page with markdown rendering, loading states, confirmation buttons — v2.0
- ✓ Agent query tools — 11 tools covering balances, budgets, spending, net worth, transactions, categories, rules, sync status, transfers — v2.0
- ✓ Agent action tools — 10 tools for categorization, rules, budgets, transfers, sync — v2.0
- ✓ Confirmation flow — auto-execute reads and most writes, require confirmation for budget amount changes — v2.0

- ✓ CSV import with Monarch format parsing, auto-delimiter detection, validation, and error reporting — v2.3
- ✓ Preview/execute import API with atomic SQLite transactions, dedup hash, auto-suggest account/category mappings — v2.3
- ✓ 3-step import wizard UI (upload, preview/map, confirm/results) with drag-and-drop — v2.3
- ✓ Post-import rules engine categorization and transfer detection — v2.3
- ✓ Import navigation: /import route, desktop nav bar, mobile More sheet — v2.3

### Active

(No active milestone — use `/gsd:new-milestone` to start next)

### Out of Scope

- Portfolio breakdown / gain-loss tracking — just need balance for net worth
- Mobile app — web-only, accessed from any device on the network
- Multi-user / auth — single user on private home server
- Recurring transaction management — real transactions come through bank sync
- Freedom Mortgage direct connection — payment shows as bank debit
- External alerts (push/email) for sync failures — in-app indicator sufficient
- Financial advice / recommendations — liability risk; agent answers data questions only
- Voice input/output — text-only chat sufficient
- Agent-initiated proactive alerts — dashboard already shows budget status
- Streaming agent responses — collect-and-return sufficient; upgrade if response times are slow
- Persistent chat history database — SDK sessions handle within-session continuity
- Category creation via agent — UI concern with sort ordering
- Multi-agent orchestration — single agent sufficient

## Context

- Shipped v2.3 with 18,461 LOC TypeScript across 28 phases
- Tech stack: React + Tailwind / Express + tRPC / SQLite via better-sqlite3 / TanStack Query / Claude Agent SDK / csv-parse
- Replacing Monarch Money with a self-hosted alternative (CSV import enables full data migration)
- SimpleFIN costs $15/year, connects to MX (16,000+ institutions)
- Three institutions: Discover (banking + HELOC), Fidelity (investments), Consumers Credit Union (banking)
- Pay schedule: bi-monthly (15th and last day of month), equal split
- SimpleFIN rate limit: 24 requests/day per account, 90-day max date range
- Freedom Mortgage blocks all aggregators but payments appear as bank debits
- Discover HELOC discontinued July 2025 (Capital One acquisition) — existing loan still serviced
- Known tech debt: orphaned budget.allocations.byMonth procedure, client uses inline cents conversion instead of shared helper, 2 redundant backup tests (run-backup.test.ts), 3 VERIFICATION.md tool name mismatches in Phase 14, no dedicated unit tests for query-tools.ts or ChatPage.tsx, rules-service.test.ts has 8 repetitive beforeEach/afterEach blocks

## Constraints

- **Tech stack**: React + Tailwind (custom components) / Express + tRPC / SQLite via better-sqlite3 / TanStack Query — all TypeScript
- **Infrastructure**: Single iMac home server, SQLite single-file database
- **Data provider**: SimpleFIN only — 24 req/day/account, daily refresh cycle
- **Security**: SimpleFIN + Anthropic API credentials in .env file (gitignored), no auth layer needed
- **Backup**: SQLite .backup to iCloud Drive, not live sync (corruption risk)
- **Agent**: Claude Agent SDK, server-side execution only, collect-and-return (no streaming)

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
| Claude Agent SDK over MCP server | Built-in tool execution, sessions, hooks — more powerful than raw MCP for chat-based agent | ✓ Good — clean integration with collect-and-return pattern |
| Direct service binding for agent tools | Custom tools wrapping service functions vs raw DB access — safer, type-safe, explicit permissions | ✓ Good — 21 tools wrapping existing services |
| Server-side agent execution | API key stays secure on server, agent runs in Express process | ✓ Good — no client exposure |
| Collect-and-return over streaming | Simpler architecture; upgrade to WebSocket streaming later if response times are slow | ✓ Good — adequate for single-user |
| System prompt confirmation flow | Budget amount changes require JSON confirmation block parsed by UI | ✓ Good — inline buttons for confirm/cancel |
| XML-wrapped bank strings | Prevent prompt injection from payee/memo fields | ✓ Good — delimiter-based sanitization |
| Gap closure phase (17) for audit findings | Rate limiter bypass and missing verification caught by audit | ✓ Good — all 34 v2.0 requirements verified |
| launchd over PM2/Docker for process management | Native macOS, zero dependencies, consistent with existing backup plist | — Pending |
| Express serves client static files | Single process, simpler deployment than nginx + Express | — Pending |
| Node 20 --env-file over dotenv | No extra dependency, native support | — Pending |
| Stateless preview/execute CSV import | Client sends CSV text, server re-parses on execute — no session state | ✓ Good — simple, no cleanup needed |
| csv-parse library for CSV parsing | RFC-4180 compliant, BOM support, sync API — proven library | ✓ Good — handles edge cases reliably |
| Rules engine priority over CSV categories | Rules run first, CSV categories only as fallback for unmatched | ✓ Good — consistent categorization |
| Auto-delimiter detection (tab vs comma) | `headerLine.includes('\t')` check before parsing | ✓ Good — handles both Monarch export formats |

---
*Last updated: 2026-03-24 after v2.3 milestone*
