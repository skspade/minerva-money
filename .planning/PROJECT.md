# Minerva Money

## What This Is

A single-user personal budgeting web app replacing Monarch Money. Built with React, Express, tRPC, and SQLite, hosted on a home iMac server. Pulls financial data from SimpleFIN (MX upstream) and uses envelope budgeting to assign every dollar a job. Ships with a full dashboard, spending/net-worth charts, categorization rules engine, transfer detection, twice-monthly auto-funding, a Claude-powered conversational agent with model selection (Haiku/Sonnet/Opus), category creation tools, and real-time token-by-token streaming responses with tool activity indicators. Includes CSV import with account-level skip filtering for migrating transaction history from Monarch Money. Supports manual account creation for institutions not available through SimpleFIN, with inline account creation during import, computed balances, and full dashboard/report integration.

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

- ✓ Server accepts partial account mappings and skips rows for unmapped accounts — v2.4
- ✓ Skip option in account mapping dropdown with row count badges and amber styling — v2.4
- ✓ Preview stats, sample rows, and dedup notes dynamically exclude skipped accounts — v2.4
- ✓ Confirm summary and results page reflect filtered counts — v2.4
- ✓ "Skip All Unmatched" button and summary banner for import scope visibility — v2.4

- ✓ Server-driven model selector (Haiku/Sonnet/Opus) with centralized model list, tRPC query, and per-model timeout scaling — v2.5
- ✓ Model selector UI dropdown above chat input bar with session reset on model change — v2.5
- ✓ Category creation agent tools (create_category_group, create_category) with duplicate validation and confirmation flow — v2.5
- ✓ System prompt behavioral guidance for category management (add-only policy, duplicate checking, UI redirect for destructive ops) — v2.5

- ✓ SSE event protocol with typed events (session, text-delta, tool-start, tool-end, done, error) shared between server and client — v2.6
- ✓ Server SSE endpoint (POST /api/chat/stream) with Zod validation and SSE headers — v2.6
- ✓ Server stream processing — iterate Agent SDK async iterable, emit SSE events in real-time with abort handling and idle timeout — v2.6
- ✓ Client stream consumer hook (useStreamingChat) with fetch/ReadableStream, reactive state, and tRPC fallback — v2.6
- ✓ Incremental text rendering, tool activity indicators (24 tools), smart auto-scroll in ChatPage — v2.6
- ✓ Session ID continuity fix for resumed chat turns — v2.6

- ✓ Manual account schema with `source` column distinguishing manual from SimpleFIN accounts — v2.7
- ✓ Account CRUD service (create, update, delete, recalculate balance) with SimpleFIN guard — v2.7
- ✓ Import wizard inline account creation with auto-selection — v2.7
- ✓ Manual account balance computed from transaction sums, recalculated on import — v2.7
- ✓ Dashboard/reporting integration with "Manual" badges and "Last imported" labels — v2.7
- ✓ Agent create_account tool with duplicate detection and system prompt guidance — v2.7

### Active

**Current Milestone: v2.8 Sync Error Visibility**

**Goal:** Surface per-account sync errors in the UI so the user immediately knows when a bank connection needs attention, instead of silently showing "success" when SimpleFIN returns account-level errors.

**Target features:**
- sync_warnings table to persist per-account errors with history
- 'partial' sync status when accounts have errors but API call succeeded
- tRPC sync.status endpoint returns structured warnings
- Dashboard amber "Partial" badge with account error list and SimpleFIN reconnect link
- Navbar amber warning indicator with tooltip for affected account count

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
- Persistent chat history database — SDK sessions handle within-session continuity
- Category deletion/rename via agent — UI concern with sort ordering; creation is safe but destructive ops stay in UI
- Multi-agent orchestration — single agent sufficient
- Stop button for streaming — deferred to future milestone (STOP-01)
- Collapsible tool call log — deferred to future milestone (MTOOL-01)
- SSE reconnection/resume on drop — deferred to future milestone (RESUME-01)
- WebSocket transport — SSE is simpler and sufficient for unidirectional streaming
- EventSource API — only supports GET; chat needs POST with message body
- Extended thinking with streaming — Agent SDK does not emit StreamEvents when maxThinkingTokens is set

## Context

- Shipped v2.7 with 22,030 LOC TypeScript across 46 phases (9 milestones)
- Tech stack: React + Tailwind / Express + tRPC / SQLite via better-sqlite3 / TanStack Query / Claude Agent SDK / csv-parse
- Replacing Monarch Money with a self-hosted alternative (CSV import with account filtering enables selective data migration)
- Agent now supports model selection (Haiku/Sonnet/Opus), category creation, account creation, and real-time token-by-token streaming with tool activity indicators
- Manual accounts supported for institutions not in SimpleFIN — inline creation during import, computed balances, full dashboard integration
- SimpleFIN costs $15/year, connects to MX (16,000+ institutions)
- Three institutions: Discover (banking + HELOC), Fidelity (investments), Consumers Credit Union (banking)
- Pay schedule: bi-monthly (15th and last day of month), equal split
- SimpleFIN rate limit: 24 requests/day per account, 90-day max date range
- Freedom Mortgage blocks all aggregators but payments appear as bank debits
- Discover HELOC discontinued July 2025 (Capital One acquisition) — existing loan still serviced
- Known tech debt: orphaned budget.allocations.byMonth procedure, client uses inline cents conversion instead of shared helper, 2 redundant backup tests (run-backup.test.ts), 3 VERIFICATION.md tool name mismatches in Phase 14, no dedicated unit tests for query-tools.ts or ChatPage.tsx, rules-service.test.ts has 8 repetitive beforeEach/afterEach blocks, compiled dist/sse-events.test.js duplicates src test (inflates test count by 10), agent get_account_balances references non-existent available_balance column, agent trigger_sync rate-limit check doesn't filter by source='simplefin'

## Constraints

- **Tech stack**: React + Tailwind (custom components) / Express + tRPC / SQLite via better-sqlite3 / TanStack Query — all TypeScript
- **Infrastructure**: Single iMac home server, SQLite single-file database
- **Data provider**: SimpleFIN only — 24 req/day/account, daily refresh cycle
- **Security**: SimpleFIN + Anthropic API credentials in .env file (gitignored), no auth layer needed
- **Backup**: SQLite .backup to iCloud Drive, not live sync (corruption risk)
- **Agent**: Claude Agent SDK, server-side execution only, SSE streaming with tRPC fallback

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
| System prompt confirmation flow | Budget amount changes require JSON confirmation block parsed by UI | ✓ Good — inline buttons for confirm/cancel |
| XML-wrapped bank strings | Prevent prompt injection from payee/memo fields | ✓ Good — delimiter-based sanitization |
| Gap closure phase (17) for audit findings | Rate limiter bypass and missing verification caught by audit | ✓ Good — all 34 v2.0 requirements verified |
| launchd over PM2/Docker for process management | Native macOS, zero dependencies, consistent with existing backup plist | ✓ Good — stable in production |
| Express serves client static files | Single process, simpler deployment than nginx + Express | ✓ Good — single-port deployment |
| Node 20 --env-file over dotenv | No extra dependency, native support | ✓ Good |
| Stateless preview/execute CSV import | Client sends CSV text, server re-parses on execute — no session state | ✓ Good — simple, no cleanup needed |
| csv-parse library for CSV parsing | RFC-4180 compliant, BOM support, sync API — proven library | ✓ Good — handles edge cases reliably |
| Rules engine priority over CSV categories | Rules run first, CSV categories only as fallback for unmatched | ✓ Good — consistent categorization |
| Auto-delimiter detection (tab vs comma) | `headerLine.includes('\t')` check before parsing | ✓ Good — handles both Monarch export formats |
| Sentinel value pattern for skip | `"__skip__"` in accountMappings, stripped before server payload | ✓ Good — clean client/server contract |
| Server treats absent accounts as skip | No new API parameters — omit from mapping to skip | ✓ Good — backward-compatible, zero migration |
| Client-side stats filtering via useMemo | No server round-trip for preview updates when toggling skips | ✓ Good — instant UI responsiveness |
| Pure helper functions for UI logic | Exported testable functions (validation, filtering, stats) | ✓ Good — 22 tests covering skip logic |
| Centralized models.ts config constant | Single source of truth for model IDs, labels, timeouts, validation | ✓ Good — clean separation, reusable in router and service |
| Native HTML select for model dropdown | Accessible, mobile-friendly, sufficient for 3 options — no component library needed | ✓ Good — works well on all devices |
| Per-model timeout scaling | Haiku 15s, Sonnet 30s, Opus 60s — proportional to model response time | ✓ Good — prevents premature timeouts on Opus |
| Add-only agent category tools | Creation is safe; destructive ops (delete/rename) stay in UI where sort ordering is visible | ✓ Good — clear safety boundary |
| System prompt behavioral rules for categories | Check existing before create, require confirmation, redirect destructive ops | ✓ Good — 7 tests verify prompt content |
| SSE over standalone Express POST route (not tRPC) | tRPC subscriptions are GET-only; POST needed for message body | ✓ Good — clean separation of streaming from RPC |
| No new npm dependencies for streaming | Agent SDK streaming, Express SSE, fetch ReadableStream all built-in | ✓ Good — zero dependency overhead |
| 5-phase strict dependency chain for streaming | shared types → server generator → HTTP handler → client hook → UI | ✓ Good — clean layered architecture |
| Single send path via useStreamingChat | Removed chatMutation entirely; hook handles tRPC fallback internally | ✓ Good — simpler ChatPage code |
| Live bubble separate from messages array | Avoids array churn on every token delta | ✓ Good — smooth streaming performance |
| Discriminated union on type field for SSE events | Parsed objects are self-describing; enables switch narrowing | ✓ Good — compile-time protocol safety |
| `manual_` prefix + UUID for manual account IDs | Avoids collisions with SimpleFIN-assigned IDs | ✓ Good — clean namespace separation |
| Balance computed from transaction sums (no manual entry) | Transactions are single source of truth; avoids divergence on import | ✓ Good — recalculateBalance runs atomically with import |
| `__CREATE_NEW__` sentinel in import dropdown | Reuses existing sentinel pattern from skip (`__skip__`) | ✓ Good — consistent UI contract |
| Account type restricted to banking/credit | Investment accounts are balance-only (not transaction-summed); deferred | ✓ Good — avoids scope creep |
| recalculateBalance caller-managed transaction | Allows atomic execution inside import's db.transaction() | ✓ Good — no balance/snapshot drift |
| No index on accounts.source column | Table has ~3 rows at current scale — not needed | ✓ Good — avoid premature optimization |

---
*Last updated: 2026-03-26 after v2.8 milestone start*
