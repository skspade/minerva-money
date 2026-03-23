# Claude Agent SDK Integration — Design

**Date:** 2026-03-23
**Approach:** Direct Service Binding

## Agent Tool Definitions

The agent will have custom tools that map to existing service functions. Each tool gets a name, description, and JSON schema for parameters. Tools are grouped by domain:

**Query Tools (read-only):**
- `get_account_balances` — List all accounts with current balances
- `get_budget_summary` — Get budget allocations, spent, and remaining for a given month
- `get_available_to_budget` — Get unallocated income for a period
- `get_spending_by_category` — Spending breakdown by category for a date range
- `get_spending_over_time` — Spending trends over time periods
- `get_net_worth` — Net worth with historical snapshots
- `list_transactions` — Search/filter transactions (by date, category, amount, merchant)
- `list_categories` — List all category groups and categories
- `list_rules` — List all categorization rules
- `get_sync_status` — Last sync time, errors, account statuses

**Action Tools (auto-execute):**
- `categorize_transaction` — Set category on a transaction
- `create_rule` — Create a new categorization rule
- `update_rule` / `delete_rule` — Modify or remove rules
- `apply_rule` — Apply a rule retroactively to matching transactions
- `set_budget_allocation` — Set budget amount for a category/period
- `set_default_allocation` — Set default monthly budget for a category
- `confirm_transfer` / `dismiss_transfer` — Handle transfer suggestions
- `trigger_sync` — Manually trigger a SimpleFIN sync

**Confirmation-Required Tools:**
- `create_manual_transaction` — Creates a transaction with an amount (requires confirmation)
- `edit_transaction_amount` — If added later (requires confirmation)

Each tool implementation is a thin wrapper: parse input → call the service function with `db` → return the result as JSON.

## Server Architecture

The agent runs server-side in the Express process. A new tRPC procedure handles chat:

**New packages/modules:**
- `packages/server/src/agent/` — New directory for agent code
  - `agent-tools.ts` — Tool definitions and implementations (wraps service functions)
  - `agent-service.ts` — Session management, creates Agent SDK `query()` calls
  - `agent-router.ts` — tRPC router with chat endpoint

**tRPC Endpoint:**
- `agent.chat` — Mutation that accepts `{ message: string, sessionId?: string }`
  - If `sessionId` provided, resumes an existing Agent SDK session
  - If not, starts a new session with the system prompt and tool definitions
  - Returns the agent's full response after processing completes

**Session Management:**
- Agent SDK sessions are identified by `sessionId` (returned from the SDK's `init` message)
- Sessions persist context across turns — the agent remembers previous questions in the conversation
- Sessions are ephemeral (in-memory) — no need to persist chat history to SQLite
- A simple Map stores active session IDs; sessions expire after inactivity

**System Prompt:**
The agent gets a system prompt explaining:
- What Minerva Money is and its core concepts (accounts, categories, budgets, rules, transfers)
- The user's financial setup (3 institutions, bi-monthly pay schedule)
- How to use the available tools to answer questions
- Permission rules (auto-execute most actions, confirm before amount changes)

**API Key:**
- `ANTHROPIC_API_KEY` added to `.env` (gitignored)
- Read at server startup, passed to Agent SDK `query()` calls

## Chat UI

A new page in the React app at `/chat` with a conversational interface:

**Layout:**
- Full-height page with a message list and input bar at the bottom
- Messages displayed as chat bubbles — user messages on the right, agent responses on the left
- Agent responses render markdown (for tables, lists, formatted numbers)
- Navigation sidebar gets a new "Chat" link

**Components:**
- `ChatPage.tsx` — Page component, manages conversation state
- `MessageList.tsx` — Scrollable list of messages with auto-scroll to bottom
- `MessageBubble.tsx` — Renders a single message (user or agent), with markdown support for agent messages
- `ChatInput.tsx` — Text input with send button, disabled while agent is processing

**State Management:**
- Local React state for messages array (`{ role: 'user' | 'agent', content: string }[]`)
- `sessionId` stored in state — sent with each message to maintain conversation context
- TanStack Query mutation for `agent.chat` — handles loading state
- Loading indicator (typing dots or spinner) while agent is processing

**Confirmation Flow:**
- When the agent needs confirmation (amount changes), the agent's response includes a confirmation prompt
- The UI renders approve/reject buttons inline in the agent's message
- User clicks approve → sends confirmation back to the agent as the next message

**Styling:**
- Tailwind, consistent with existing app design
- No external chat libraries — keep it simple with custom components

## Streaming & Response Handling

**Server-side response collection:**
- The `agent.chat` tRPC endpoint collects the agent's full response from the SDK async iterator
- Simple approach: collect and return the complete response. Client shows a loading spinner until done.
- Streaming can be added later via tRPC subscriptions (WebSocket) if response times feel slow.

**Response format:**
- Agent responses returned as `{ content: string, sessionId: string, needsConfirmation?: { action: string, details: string } }`
- `content` is markdown text — the agent's natural language response
- `sessionId` is passed back for session continuity
- `needsConfirmation` is populated when the agent wants to perform a confirmation-required action

**Error handling:**
- Agent SDK errors (API key issues, rate limits) caught and returned as error messages in chat
- Tool execution errors (e.g., invalid category ID) returned to the agent so it can self-correct and retry
- Network errors shown as a "Something went wrong, try again" message in the UI

## Permissions & Safety

**Auto-execute (no confirmation needed):**
- All read/query operations (balances, budget, spending, transactions, rules, sync status)
- Categorizing transactions (changing category assignment)
- Creating, updating, deleting categorization rules
- Applying rules retroactively
- Setting budget allocations and defaults
- Confirming/dismissing transfer suggestions
- Triggering a manual sync

**Requires confirmation:**
- Creating manual transactions (involves setting an amount)
- Any future operation that modifies transaction amounts

**Implementation:**
- Tools are defined with a `requiresConfirmation` flag in their metadata
- When a confirmation-required tool is invoked, the agent service intercepts the call, returns the action details to the client instead of executing, and waits for the next user message
- If user approves, the tool executes and the result is fed back to the agent
- If user rejects, the agent is told the action was denied and can adjust

**Guardrails:**
- The agent cannot delete accounts or transactions (no tool for it)
- The agent cannot modify the database schema or run raw SQL
- The agent's system prompt instructs it to explain what it's doing when taking actions
- Tool implementations validate inputs (e.g., category ID must exist) before executing
