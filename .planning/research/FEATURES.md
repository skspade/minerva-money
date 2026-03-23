# Feature Landscape

**Domain:** AI conversational agent for personal envelope budgeting app (Claude Agent SDK)
**Researched:** 2026-03-23
**Confidence:** HIGH (Claude Agent SDK docs verified via official sources; financial chatbot patterns verified across multiple sources)

## Table Stakes

Features users expect from any AI financial assistant. Missing these = the agent feels like a toy.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Natural language balance queries | "How much is in my checking?" is the #1 question users ask any finance chatbot (Cleo, Monarch AI, etc.) | LOW | accounts table, no service fn needed (direct query) | Return formatted dollar amounts with account names |
| Spending queries by category and period | "How much did I spend on groceries this month?" -- the core value of a finance chatbot | LOW | `reports-service.getSpendingByCategory()` | Must handle natural date expressions ("this month", "last 30 days", "in February") |
| Budget summary queries | "How's my budget looking?" / "Am I over budget on dining out?" | LOW | `budget-service.getSpentForCategory()`, `budget-service.getAllocation()` | Show allocated vs spent vs remaining per category |
| Transaction listing with filters | "Show me my last 5 Amazon transactions" / "What did I spend at Costco?" | LOW | Transactions table with payee/amount/date filters | Paginated or limited results; avoid dumping 500 transactions into context |
| Net worth query | "What's my net worth?" | LOW | `reports-service.getNetWorthOverTime()` | Return current total and optionally trend direction |
| Sync status check | "When was the last sync?" / "Are there any sync errors?" | LOW | sync_log table | Surface last sync time, status, and recent errors |
| Markdown-rendered chat UI | Users expect formatted responses (tables, bold, lists) -- raw text feels broken | MEDIUM | New React page, markdown renderer | Full-height chat page with message bubbles, scrolling |
| Message history in session | Users expect to scroll up and see prior messages in current conversation | LOW | Session state in React, SDK session resumption | Persist across page navigations within a session |
| Tool result transparency | When the agent queries data, users want to see what it looked up (builds trust in a financial context) | LOW | Message stream parsing for tool calls | Show collapsible "looked up: account balances" indicators |
| Error handling with graceful fallback | Agent must not crash on bad queries; should explain what went wrong | LOW | SDK `isError: true` pattern in tool handlers | Catch DB errors, return user-friendly messages |

## Differentiators

Features that make this agent genuinely useful rather than a gimmick. Not expected, but valued.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Transaction categorization via chat | "Categorize all Starbucks transactions as Dining Out" -- faster than clicking through UI for bulk operations | MEDIUM | `rules-service.createRule()`, `rules-service.categorizeNewTransactions()` | Creates a rule AND applies retroactively; agent explains what it did |
| Rule management via chat | "Create a rule: anything from Amazon over $50 goes to Shopping" | MEDIUM | `rules-service.createRule()`, `rules-service.updateRule()`, `rules-service.deleteRule()` | Agent must validate inputs (category exists, no conflicting rules) |
| Budget adjustment via chat | "Increase my Groceries budget to $600 this month" | LOW | `budget-service.setAllocation()`, `budget-service.setDefaultAllocation()` | Confirmation required for amount changes per PROJECT.md |
| Transfer management via chat | "Mark these two transactions as a transfer" / "Show pending transfer suggestions" | MEDIUM | `transfer-service.confirmTransfer()`, `transfer-service.rejectCandidate()` | Agent shows both sides of the transfer pair for confirmation |
| Trigger sync via chat | "Sync my accounts now" | LOW | `sync-service.runSync()` | Fire-and-forget; report result when complete |
| Spending insights via natural language | "What's my biggest expense category?" / "Am I spending more on dining this month vs last?" | MEDIUM | `reports-service.getSpendingByCategory()`, `reports-service.getSpendingOverTime()` | Agent computes comparisons, not just raw data dumps |
| Confirmation flow for destructive actions | Agent auto-executes reads and safe writes; requires explicit "yes" for budget amount changes | MEDIUM | SDK `canUseTool` callback or hooks | Per PROJECT.md: auto-execute most actions, confirm amount changes |
| System prompt with financial context | Agent knows about envelope budgeting philosophy, account structure, category groups -- speaks the user's language | LOW | System prompt with app context injected | Include current month, pay schedule, category list |
| Multi-turn conversation with context | "How much did I spend on groceries?" -> "Compare that to last month" -- agent remembers prior context | LOW | SDK session management (`resume` option) | SDK handles this natively via session persistence |

## Anti-Features

Features to explicitly NOT build for the v2.0 agent.

| Anti-Feature | Why It Seems Good | Why Avoid | What to Do Instead |
|--------------|-------------------|-----------|-------------------|
| Financial advice / recommendations | AI finance chatbots like Cleo offer "should you buy this?" coaching | Liability risk even for personal use; Claude's training data is stale for financial advice; adds hallucination risk | Agent answers data questions only; "Here's what you spent" not "Here's what you should do" |
| Streaming token-by-token responses | Feels responsive in ChatGPT-style UIs | PROJECT.md explicitly chose collect-and-return for simplicity; streaming adds WebSocket complexity, partial message handling, and UI state management | Collect full response then render; add streaming in v2.x if response times are problematic |
| Persistent chat history across sessions | Some chatbots save full conversation history permanently | Adds a chat_messages table, storage growth, search over history; SDK sessions already persist on disk | Start fresh conversations; SDK session resume handles within-session continuity |
| Agent-initiated proactive alerts | "Hey, you're 90% through your dining budget!" | Requires background monitoring, notification system, push mechanism; completely different architecture from request-response chat | User asks the agent when they want to know; dashboard already shows budget status |
| Voice input/output | Feels futuristic for a finance assistant | Massive scope (speech-to-text, text-to-speech APIs, audio handling); web Speech API is flaky | Text-only chat; users can use OS-level dictation if they want |
| Agent modifying the database schema | "Add a new category called Travel" via agent creating categories | Agent should use existing service functions, not evolve the data model; category creation is a UI concern with sort ordering | Agent can suggest creating a category; user does it in the UI, or add a category-creation tool in v2.x |
| Multi-agent orchestration | One agent for queries, another for actions, a coordinator | SDK supports subagents but single-agent with multiple tools is simpler and sufficient for this scope | Single agent with all tools; partition via tool naming conventions |
| File system access for the agent | SDK built-in tools (Read, Write, Bash, etc.) are powerful | Agent should NOT have filesystem access; it's a financial data assistant, not a code assistant; filesystem tools are a security risk | Only expose custom MCP tools wrapping service functions; set `tools: []` to remove all built-ins |

## Feature Dependencies

```
[Claude Agent SDK Setup]
    |-- requires --> [Anthropic API Key in .env]
    |-- requires --> [Custom MCP Server with Tools]
    |                   |-- requires --> [Query Tools wrapping service fns]
    |                   |                   |-- wraps --> reports-service
    |                   |                   |-- wraps --> budget-service (read)
    |                   |                   |-- wraps --> category-service (read)
    |                   |                   |-- wraps --> rules-service (read)
    |                   |                   |-- wraps --> sync_log queries
    |                   |                   |-- wraps --> accounts/transactions queries
    |                   |
    |                   |-- requires --> [Action Tools wrapping service fns]
    |                                       |-- wraps --> rules-service (create/update/delete)
    |                                       |-- wraps --> budget-service (set allocation)
    |                                       |-- wraps --> transfer-service (confirm/reject)
    |                                       |-- wraps --> sync-service (trigger sync)
    |                                       |-- wraps --> transaction categorization
    |
    |-- requires --> [System Prompt]
    |                   |-- includes --> envelope budgeting context
    |                   |-- includes --> available tools description
    |                   |-- includes --> confirmation rules
    |
    |-- requires --> [tRPC Agent Endpoint]
    |                   |-- exposes --> POST /agent.chat
    |                   |-- handles --> collect-and-return response pattern
    |                   |-- handles --> session management
    |
    |-- enables --> [Chat UI Page]
                       |-- requires --> tRPC agent endpoint
                       |-- requires --> markdown rendering library
                       |-- requires --> message state management
                       |-- requires --> tool call display components

[Confirmation Flow]
    |-- requires --> [Action Tools]
    |-- requires --> [SDK canUseTool or PreToolUse hook]
    |-- triggers for --> budget amount changes
```

### Dependency Notes

- **Custom MCP tools require existing service functions:** The v1.0 service layer was designed with agent exposure in mind (per PROJECT.md key decision). All business logic lives in service functions that accept a `db` parameter -- these are directly wrappable as tool handlers.
- **Chat UI requires tRPC endpoint first:** Build the server-side agent integration before the UI; test with direct API calls initially.
- **Confirmation flow requires tool classification:** Must categorize each tool as "auto-approve" or "needs confirmation" before building the UI confirmation dialog.
- **System prompt requires category/account data:** The system prompt should include current categories and account names so the agent can resolve natural language references like "my checking account" or "groceries."

## MVP Recommendation

### Build First (v2.0 Core)

1. **Query tools** (all read-only tools) -- immediate value with zero risk; users can ask questions about their finances
2. **tRPC agent endpoint** with collect-and-return -- server-side agent execution keeps API key secure
3. **Chat UI with markdown rendering** -- the interface for interacting with the agent
4. **System prompt with financial context** -- makes the agent knowledgeable about the user's specific setup

### Build Second (v2.0 Actions)

5. **Action tools** (categorize, rules, budgets, transfers, sync) -- the agent can now DO things, not just answer questions
6. **Confirmation flow** for budget amount changes -- safety net for the one category of destructive action
7. **Tool call transparency in UI** -- users see what the agent looked up or changed

### Defer (v2.x)

- **Streaming responses** -- only if collect-and-return response times are unacceptable (likely 3-8 seconds per query)
- **Persistent chat history** -- start fresh each time; revisit if users want conversation continuity
- **Category creation via agent** -- add as a tool later if frequently requested
- **Spending comparison insights** -- agent can already compute these with existing tools; add dedicated comparison tools if needed

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Risk | Priority |
|---------|------------|---------------------|------|----------|
| Balance/spending/budget query tools | HIGH | LOW | LOW | P1 |
| tRPC agent endpoint | HIGH | MEDIUM | MEDIUM | P1 |
| Chat UI with markdown | HIGH | MEDIUM | LOW | P1 |
| System prompt with context | HIGH | LOW | LOW | P1 |
| Transaction listing tool | HIGH | LOW | LOW | P1 |
| Sync status tool | MEDIUM | LOW | LOW | P1 |
| Rule management tools | MEDIUM | MEDIUM | LOW | P2 |
| Budget adjustment tools | MEDIUM | LOW | MEDIUM | P2 |
| Confirmation flow | MEDIUM | MEDIUM | MEDIUM | P2 |
| Transfer management tools | MEDIUM | MEDIUM | LOW | P2 |
| Trigger sync tool | LOW | LOW | LOW | P2 |
| Tool call transparency UI | MEDIUM | LOW | LOW | P2 |
| Spending insights/comparisons | MEDIUM | MEDIUM | LOW | P3 |
| Streaming responses | LOW | HIGH | MEDIUM | P3 |
| Persistent chat history | LOW | MEDIUM | LOW | P3 |

**Priority key:**
- P1: Core agent that answers financial questions (query-only agent + chat UI)
- P2: Agent that takes actions (write tools + confirmation flow)
- P3: Polish and enhancements (defer to v2.x)

## Agent Tool Inventory

Concrete mapping of tools to existing service layer.

### Query Tools (Read-Only, Auto-Approve)

| Tool Name | Description | Service/Source | Input | Output |
|-----------|-------------|----------------|-------|--------|
| `get_account_balances` | List all accounts with current balances | accounts table | none | account name, type, balance |
| `get_budget_summary` | Budget status for current or specified month | `budget-service` fns | period (optional) | per-category: allocated, spent, remaining |
| `get_spending_by_category` | Spending breakdown by category | `reports-service.getSpendingByCategory()` | startDate, endDate | category, group, total |
| `get_spending_over_time` | Monthly spending trend | `reports-service.getSpendingOverTime()` | startDate, endDate | period, total |
| `get_net_worth` | Net worth over time | `reports-service.getNetWorthOverTime()` | startDate, endDate | date, total |
| `list_transactions` | Search/filter transactions | transactions table | payee, category, dateRange, limit | transaction list |
| `list_categories` | All categories and groups | `category-service.listGroupsWithCategories()` | none | groups with categories |
| `list_rules` | All categorization rules | `rules-service` | none | rules with conditions |
| `get_sync_status` | Last sync time and errors | sync_log table | none | last sync time, status, errors |
| `get_uncategorized_transactions` | Transactions without a category | transactions table | limit | transaction list |
| `get_transfer_suggestions` | Pending transfer candidates | `transfer-service` | none | transfer pairs |

### Action Tools (Write, Most Auto-Approve)

| Tool Name | Description | Service/Source | Confirmation Required |
|-----------|-------------|----------------|----------------------|
| `categorize_transaction` | Set category on a single transaction | transactions UPDATE | No |
| `create_rule` | Create a categorization rule | `rules-service.createRule()` + retroactive apply | No |
| `update_rule` | Modify an existing rule | `rules-service.updateRule()` | No |
| `delete_rule` | Remove a categorization rule | `rules-service.deleteRule()` | No |
| `set_budget_allocation` | Set budget amount for category/period | `budget-service.setAllocation()` | YES -- amount change |
| `set_default_allocation` | Set default monthly budget for category | `budget-service.setDefaultAllocation()` | YES -- amount change |
| `confirm_transfer` | Confirm a suggested transfer pair | `transfer-service.confirmTransfer()` | No |
| `reject_transfer` | Reject a suggested transfer pair | `transfer-service.rejectCandidate()` | No |
| `trigger_sync` | Run a SimpleFIN sync now | `sync-service.runSync()` | No |

## Sources

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) -- official SDK capabilities, built-in tools, session management (HIGH confidence)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) -- `query()`, `tool()`, `createSdkMcpServer()` API, Options type (HIGH confidence)
- [Claude Agent SDK Custom Tools Guide](https://platform.claude.com/docs/en/agent-sdk/custom-tools) -- tool definition pattern, MCP server creation, error handling, annotations (HIGH confidence)
- [Claude Agent SDK Quickstart](https://platform.claude.com/docs/en/agent-sdk/quickstart) -- agent loop pattern, permission modes, streaming (HIGH confidence)
- [@anthropic-ai/claude-agent-sdk npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) -- v0.2.81, Node.js 18+ required (HIGH confidence)
- [Cleo AI Financial Assistant](https://web.meetcleo.com/) -- personal finance chatbot feature patterns (MEDIUM confidence)
- [Finance AI Chatbot: Use Cases & Best Solutions 2026](https://www.gptbots.ai/blog/finance-ai-chatbot) -- industry feature expectations (MEDIUM confidence)
- [How to Build an AI-Powered Financial Assistant App in 2026](https://intellias.com/ai-financial-assistant-app-development/) -- architecture patterns (MEDIUM confidence)
- [Using AI chatbots for personal finance management](https://medium.com/@PedalsUp/using-ai-chatbots-for-personal-finance-management-c87b2fa4cbb7) -- NLP query patterns, budget management features (LOW confidence)
- [How I Built a Personal Finance AI Assistant with Local Language Models](https://medium.com/@sunbyrne/how-i-built-a-personal-finance-ai-assistant-with-local-language-models-2c0603b95cdc) -- implementation patterns (LOW confidence)

---
*Feature research for: AI conversational agent for personal envelope budgeting app*
*Researched: 2026-03-23*
