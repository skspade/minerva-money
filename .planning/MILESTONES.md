# Milestones

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

