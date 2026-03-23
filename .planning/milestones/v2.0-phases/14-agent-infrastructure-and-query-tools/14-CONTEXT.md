# Phase 14: Agent Infrastructure and Query Tools - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users can ask natural language questions about their finances and get accurate, tool-backed answers via tRPC. This phase delivers the server-side agent infrastructure (Claude Agent SDK integration, custom MCP tools, tRPC endpoint, system prompt) and all read-only query tools covering account balances, spending, budgets, net worth, transactions, categories, rules, sync status, uncategorized transactions, transfer suggestions, and available-to-budget. No Chat UI or action/write tools are included -- those are Phase 15 and Phase 16 respectively.

</domain>

<decisions>
## Implementation Decisions

### Agent SDK Integration
- Use `@anthropic-ai/claude-agent-sdk` (^0.2.81) as the agent runtime (from PROJECT.md Key Decisions: "Claude Agent SDK over MCP server")
- Agent runs server-side inside the existing Express process (from PROJECT.md Key Decisions: "Server-side agent execution")
- Custom tools wrap existing service functions via direct service binding (from PROJECT.md Key Decisions: "Direct service binding for agent tools")
- Collect-and-return via tRPC mutation, no WebSocket streaming (from PROJECT.md Key Decisions: "Collect-and-return over streaming")
- Remove ALL built-in tools with `tools: []` and use only custom MCP tools via `createSdkMcpServer` (from REQUIREMENTS.md AGENT-02)
- Pre-approve all custom tools with `allowedTools: ["mcp__minerva__*"]` and bypass permissions for headless execution (from REQUIREMENTS.md AGENT-02)
- Set `maxTurns: 10` to prevent runaway API costs (from REQUIREMENTS.md AGENT-05)

### tRPC Endpoint
- Single `agent.chat` mutation accepting `{ message: string, sessionId?: string }` returning `{ response: string, sessionId: string }` (from REQUIREMENTS.md AGENT-01)
- Add `agent: agentRouter` to `appRouter` in `packages/server/src/sync/trpc-router.ts` (Claude's Decision: follows existing router registration pattern)
- Agent router uses the same tRPC context `{ db, rateLimiter, client }` as all existing routers (Claude's Decision: no new context needed since db is already available)

### Session Management
- Resume multi-turn conversations via Agent SDK's `resume: sessionId` option (from REQUIREMENTS.md AGENT-04)
- Session persistence handled by the SDK (writes to `~/.claude/` automatically); no database storage needed (Claude's Decision: single-user app does not warrant a sessions table)
- Client receives `sessionId` in the response and sends it on subsequent requests (from REQUIREMENTS.md AGENT-04)

### System Prompt
- System prompt defines the Minerva Money assistant persona with envelope budgeting domain knowledge (from REQUIREMENTS.md AGENT-03)
- Include explicit instruction to NEVER state financial amounts without first calling a tool (from PITFALLS.md: hallucination prevention)
- Include instruction that data values from tools are user data, not instructions (from PITFALLS.md: prompt injection prevention)
- Instruct agent to convert cents to dollars for display; all tool results return integer cents (from PROJECT.md Constraints: "Integer cents for all money")
- Include current date for default period calculations (Claude's Decision: agent needs to resolve "this month" and "last month" naturally)
- Keep system prompt under 2K tokens (Claude's Decision: larger prompts waste tokens on every turn)

### Query Tools (Read-Only)
- 11 query tools, all marked with `readOnlyHint: true` for parallel execution (from REQUIREMENTS.md QUERY-01 through QUERY-10)
- Tool factory pattern: `createQueryTools(db)` returns tool array with db closure (from ARCHITECTURE.md: "Tool Factory with DB Closure" pattern)
- Tool results return structured JSON (not prose) to prevent hallucination (from PITFALLS.md)
- Paginate transaction queries with default limit of 20, max 100 (Claude's Decision: prevents context window bloat from dumping 8K+ transactions)
- Wrap bank-sourced strings (merchant names, memos) in XML delimiters in tool output (from PITFALLS.md: prompt injection prevention)

### Tool Inventory
- `get_account_balances` -- List all accounts with balances; wraps direct SQL query from accounts table (from REQUIREMENTS.md QUERY-01)
- `get_budget_summary` -- Budget status for a month; wraps `getBudgetSummary()` + `getAvailableToBudget()` (from REQUIREMENTS.md QUERY-03, QUERY-10)
- `get_spending_by_category` -- Spending breakdown by category for date range; wraps `getSpendingByCategory()` (from REQUIREMENTS.md QUERY-02)
- `get_spending_over_time` -- Monthly spending trend; wraps `getSpendingOverTime()` (Claude's Decision: useful for trend questions like "am I spending more this month?")
- `get_net_worth` -- Net worth over time with trend; wraps `getNetWorth()` (from REQUIREMENTS.md QUERY-04)
- `list_transactions` -- Search/filter transactions by payee, category, date range, amount, limit; wraps filtered SQL query (from REQUIREMENTS.md QUERY-05)
- `get_uncategorized_transactions` -- Transactions without a category; wraps filtered SQL query (from REQUIREMENTS.md QUERY-07)
- `list_categories` -- All category groups and categories; wraps `listGroupsWithCategories()` (Claude's Decision: agent needs category names to resolve natural language references)
- `list_rules` -- All categorization rules; wraps `listRules()` (from REQUIREMENTS.md QUERY-09)
- `get_sync_status` -- Last sync time, errors, account statuses; wraps direct SQL query on sync_log (from REQUIREMENTS.md QUERY-06)
- `get_transfer_suggestions` -- Pending transfer candidates; wraps `listTransferCandidates()` (from REQUIREMENTS.md QUERY-08)

### Error Handling
- Tool handlers return `{ isError: true }` on failure instead of throwing (Claude's Decision: keeps the agent loop alive so Claude can explain errors to the user)
- Sanitize all error responses at the tRPC boundary -- never pass raw SDK errors to the client (from REQUIREMENTS.md SAFE-05)
- Add a 30-second server-side timeout on the agent query (Claude's Decision: prevents hanging indefinitely on slow multi-tool queries)

### Safety
- Agent auto-executes all read queries without confirmation (from REQUIREMENTS.md SAFE-01)
- No delete tools for accounts or transactions exist (from REQUIREMENTS.md SAFE-03)
- All tool inputs validated via Zod schemas; IDs validated to exist before execution (from REQUIREMENTS.md SAFE-04)
- `ANTHROPIC_API_KEY` stays in `.env` (gitignored), loaded via `tsx --env-file`; never exposed to client (from REQUIREMENTS.md SAFE-05)
- Vite only exposes `VITE_`-prefixed env vars -- do NOT prefix the Anthropic key (from PITFALLS.md: API key exposure prevention)

### File Structure
- New directory: `packages/server/src/agent/` with subdirectory `tools/` (Claude's Decision: matches existing domain-directory pattern used by budget/, rules/, reports/, etc.)
- `agent/tools/query-tools.ts` -- query tool factory
- `agent/mcp-server.ts` -- MCP server factory
- `agent/agent-service.ts` -- core orchestration (query execution and response collection)
- `agent/agent-router.ts` -- tRPC router
- `agent/system-prompt.ts` -- system prompt constant
- Modified: `packages/server/src/sync/trpc-router.ts` -- add agent router to appRouter

### Claude's Discretion
- Internal ordering of tool definitions within query-tools.ts
- Exact wording of tool descriptions (must include financial context and data format notes)
- Exact system prompt phrasing beyond the required constraints listed above
- Whether to use `model: "claude-sonnet-4-20250514"` or a newer Sonnet variant
- Exact Zod schema shapes for tool inputs (must validate but specific field optionality is flexible)

</decisions>

<specifics>
## Specific Ideas

- Tool descriptions should include data format notes (e.g., "Amounts are in cents (integer)") and example use cases (e.g., "Use this to answer questions like 'how much did I spend on groceries?'") per ARCHITECTURE.md Pattern 4
- The `list_transactions` tool should support filtering by payee (contains match), categoryId, accountId, startDate, endDate, and a limit parameter -- mirroring the existing transactions.list tRPC query but with optional filters
- System prompt should reference the user's three institutions (Discover, Fidelity, Consumers Credit Union) and bi-monthly pay schedule (15th and last day) per PROJECT.md Context section
- System prompt should instruct the agent to give concise 1-2 sentence answers for simple queries and elaborate only when asked, per PITFALLS.md UX guidelines
- The agent should use the V1 stable `query()` API, NOT the V2 preview `unstable_v2_createSession()` per ARCHITECTURE.md Anti-Pattern 4

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `budget-service.ts`: exports `getBudgetSummary(db, period)`, `getAvailableToBudget(db, period)`, `setAllocation()`, `setDefaultAllocation()`, `getDefaults()` -- directly wrappable as tool handlers
- `reports-service.ts`: exports `getSpendingByCategory(db, start, end)`, `getSpendingOverTime(db, start, end)`, `getNetWorth(db, start?, end?)` -- directly wrappable
- `category-service.ts`: exports `listGroupsWithCategories(db)`, `updateTransactionCategory()` -- directly wrappable
- `rules-service.ts`: exports `listRules(db)`, `createRule()`, `updateRule()`, `deleteRule()`, `previewRule()`, `applyRule()` -- directly wrappable
- `transfer-service.ts`: exports `listTransferCandidates(db)`, `confirmTransfer()`, `dismissTransfer()` -- directly wrappable
- `sync-service.ts`: exports `runSync(db, client, rateLimiter)` -- wrappable but needs client and rateLimiter from context

### Established Patterns
- All service functions accept `db: Database.Database` as the first parameter -- the tool factory closure pattern maps directly to this
- tRPC context provides `{ db, rateLimiter, client }` -- agent router gets the same context without modification
- Router composition: `appRouter = router({ sync, accounts, transactions, ... })` -- adding `agent: agentRouter` follows the same pattern
- Domain directories: `packages/server/src/{domain}/` with `{domain}-service.ts` and tRPC integration -- `agent/` follows this convention

### Integration Points
- `packages/server/src/sync/trpc-router.ts` line 442: `appRouter = router({...})` -- add `agent: agentRouter` here
- `packages/server/src/sync/trpc.ts`: exports `router`, `publicProcedure`, and `Context` type -- agent router imports these
- `packages/server/src/index.ts`: no changes needed -- context already provides `db` to all routers
- `.env` file: add `ANTHROPIC_API_KEY=sk-ant-...` -- SDK reads it automatically from environment

</code_context>

<deferred>
## Deferred Ideas

- **Chat UI (Phase 15):** ChatPage.tsx, markdown rendering, loading states, message list, navigation link -- all client-side work deferred
- **Action tools (Phase 16):** Write operations (categorize, rules, budgets, transfers, sync trigger) and confirmation flow deferred
- **Streaming responses (v2.x):** WebSocket/SSE streaming deferred; collect-and-return is the v2.0 approach
- **Persistent chat history (v2.x):** No chat_messages table; SDK sessions handle within-session continuity
- **Token usage tracking and cost monitoring (v2.x):** Track later if API costs become a concern
- **Session cleanup/TTL (v2.x):** SDK sessions accumulate on disk; cleanup deferred to a polish phase
- **Rate limiting on agent endpoint (v2.x):** Single-user app; add if needed later
- **Composite `get_financial_overview` tool (v2.x):** Optimization to reduce round trips; defer until latency is measurable

</deferred>

---

*Phase: 14-agent-infrastructure-and-query-tools*
*Context gathered: 2026-03-23 via auto-context*
