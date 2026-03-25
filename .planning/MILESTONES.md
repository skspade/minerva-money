# Milestones

## v2.7 Manual Accounts (Shipped: 2026-03-25)

**Phases:** 3 | **Plans:** 6 | **Requirements:** 21/21
**LOC added:** ~2,047 TypeScript | **Total LOC:** 22,030
**Timeline:** 2026-03-25 (single day)
**Git range:** feat(44-01) → feat(46-03)

**Key accomplishments:**
1. Schema migration — added `source` column to accounts table with sync pipeline filtered to SimpleFIN-only accounts
2. Account CRUD service — TDD-built createAccount, updateAccount, deleteAccount, recalculateBalance with SimpleFIN guard
3. tRPC mutations and import integration — account create/update/delete endpoints with post-import balance recalculation
4. Agent tools — create_account tool with duplicate detection and system prompt guidance for manual accounts
5. Dashboard visual distinction — "Manual" pill badges and "Last imported" labels on Dashboard and AccountsPage
6. Import wizard inline creation — "+ Create New Account" option with inline form and auto-selection after creation

---

## v2.6 Streaming Chat (Shipped: 2026-03-25)

**Phases:** 6 | **Plans:** 6 | **Requirements:** 20/20
**LOC added:** ~4,452 TypeScript | **Total LOC:** 21,189
**Timeline:** 2026-03-24 → 2026-03-25 (2 days)
**Git range:** feat(38-01) → feat(42-01)

**Key accomplishments:**
1. SSE event protocol — compile-time discriminated union with 6 typed event kinds shared between server and client packages
2. Server stream processing — chatStream() async generator iterating Agent SDK with tool events, abort handling, and per-model idle timeout
3. Express SSE endpoint — POST /api/chat/stream with Zod validation before SSE headers, standard wire format
4. Client stream hook — useStreamingChat with fetch/ReadableStream consumption, reactive state, and automatic tRPC fallback
5. Streaming chat UI — live token-by-token rendering, human-readable tool activity labels for 24 tools, smart auto-scroll
6. Session ID continuity fix — fallback prevents empty session on resumed chat turns

---

## v2.5 Chat Enhancements (Shipped: 2026-03-24)

**Phases:** 5 | **Plans:** 5 | **Requirements:** 18/18
**LOC added:** ~373 TypeScript | **Total LOC:** 19,237
**Timeline:** 2026-03-24 (single day)
**Git range:** feat(33-01) → docs(37)

**Key accomplishments:**
1. Server-side model selection — centralized models.ts config, agent.models tRPC query, chat mutation model parameter with allowlist validation, per-model timeout scaling (Haiku 15s / Sonnet 30s / Opus 60s)
2. Category creation tools — create_category_group and create_category MCP tools with case-insensitive duplicate validation, group existence checking, and confirmation flow
3. System prompt behavioral guidance — category management rules (check before create, require confirmation, redirect delete/rename to UI)
4. Model selector UI — native select dropdown in ChatPage, session reset on model change, disabled during pending requests
5. Verification gap closure — VERIFICATION.md files for phases 33, 35, 36 confirming all 18 requirements

---

## v2.4 CSV Import Account Filtering (Shipped: 2026-03-24)

**Phases:** 4 | **Plans:** 4 | **Requirements:** 10/10
**LOC added:** ~2,200 TypeScript | **Total LOC:** 11,854
**Timeline:** 2026-03-24 (single day)
**Git range:** feat(29-01) → feat(32-01)

**Key accomplishments:**
1. Server accepts partial account mappings — skips unmapped rows instead of throwing, returns per-account row counts for UI
2. Skip option in account mapping dropdown with row count badges and amber/dimmed visual treatment
3. Client-side stats filtering — preview stats, sample rows, and dedup notes all dynamically reflect skip decisions
4. "Skip All Unmatched" button and summary banner for bulk operations and at-a-glance import scope
5. Formal verification of all 10 requirements with file-and-line evidence across 3 implementation phases

---

## v2.3 CSV Import (Shipped: 2026-03-24)

**Phases:** 3 | **Plans:** 5 | **Requirements:** 23/23
**LOC added:** 1,548 TypeScript (source) | **Total LOC:** 18,461
**Timeline:** 2026-03-24 (single day)
**Git range:** feat(26-01) → docs(phase-28)

**Key accomplishments:**
1. Monarch CSV parsing layer — auto-delimiter detection (tab/comma), BOM stripping, CRLF normalization, row validation with error reporting
2. Stateless preview/execute import API — atomic SQLite transactions, dedup hash with INSERT OR IGNORE, auto-suggest account/category mappings
3. Post-import processing — rules engine categorization and transfer detection run on all imported transactions
4. 3-step import wizard UI — drag-and-drop upload, preview with sample rows, account/category mapping dropdowns, confirm/results flow
5. Navigation integration — /import route, desktop nav bar link, mobile More bottom sheet entry
6. Full verification of all 12 service-layer requirements with 54 passing tests

---

## v2.1 Deployment Hardening (Shipped: 2026-03-24)

**Phases:** 3 | **Plans:** 5 | **Requirements:** 16/16
**Timeline:** 2026-03-23 → 2026-03-24 (1 day)
**Git range:** feat(18-01) → feat(20-02)

**Key accomplishments:**
1. Production build pipeline — tsc server compilation, Vite client bundle, Express SPA serving
2. launchd service management — crash recovery (KeepAlive dict form), boot startup, restart throttling
3. Deploy scripts — `setup.sh` for first-time install, `deploy.sh` for one-command updates with health checks
4. Deployment config co-located in `deploy/` directory

---

## v2.0 Claude Agent (Shipped: 2026-03-23)

**Phases:** 4 | **Plans:** 8 | **Requirements:** 34/34
**LOC added:** 5,983 TypeScript | **Files modified:** 40
**Timeline:** 2026-03-22 → 2026-03-23 (1 day)
**Git range:** feat(14-01) → feat(17-01)

**Key accomplishments:**
1. Claude Agent SDK integration — server-side agent with system prompt, MCP server, session management, and tRPC endpoint
2. 11 query tools — natural language access to all financial data (balances, budgets, spending, net worth, transactions, categories, rules, sync status, transfers)
3. 10 action tools — modify data via chat (categorize, rules, budgets, transfers, sync) with input validation
4. Chat UI — full-height chat page with markdown rendering, loading states, error handling, and inline confirmation buttons
5. Confirmation flow — budget changes require explicit user approval; all other operations auto-execute
6. Safety hardening — rate limiter pre-check on sync, prompt injection prevention, no destructive tools, API key server-side only

---

## v1.0 MVP (Shipped: 2026-03-23)

**Phases:** 13 | **Plans:** 39 | **Requirements:** 34/34
**LOC:** 8,142 TypeScript | **Commits:** 138 | **Files:** 215
**Timeline:** 2026-03-22 (single day)
**Git range:** feat(01-01) → feat(13-01)

**Key accomplishments:**
1. Full-stack monorepo with React, Express, tRPC, and SQLite — type-safe end-to-end
2. SimpleFIN data pipeline with dedup, rate limiting, and twice-daily auto-sync
3. Envelope budgeting engine with rollover math, auto-funding on 15th/last day, and defaults
4. Transaction categorization via rules with specificity-based conflict resolution
5. Transfer detection with auto-suggest, manual confirm/link, and report exclusion
6. Dashboard with spending-by-category charts, spending trends, net worth trend, and budget progress

---

