# Milestone Context

**Source:** Brainstorm session (Claude Agent SDK Integration)
**Design:** .planning/designs/2026-03-23-claude-agent-sdk-integration-design.md

## Milestone Goal

Add a Claude-powered conversational agent to Minerva Money using the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`). The agent runs server-side in Express, exposes Minerva's existing service functions as custom tools, and is accessible through a chat UI in the web app. The agent can query financial data (balances, budgets, spending, net worth) and take actions (categorize transactions, create rules, adjust budgets) — auto-executing most actions but requiring confirmation for amount changes.

## Features

### Agent Tool Definitions

Custom tools that map to existing service functions, grouped by domain:

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
- `categorize_transaction`, `create_rule`, `update_rule`, `delete_rule`, `apply_rule`
- `set_budget_allocation`, `set_default_allocation`
- `confirm_transfer`, `dismiss_transfer`
- `trigger_sync`

**Confirmation-Required Tools:**
- `create_manual_transaction` — requires confirmation due to amount

### Server Architecture

- New `packages/server/src/agent/` directory with `agent-tools.ts`, `agent-service.ts`, `agent-router.ts`
- tRPC `agent.chat` mutation: `{ message: string, sessionId?: string }` → `{ content: string, sessionId: string, needsConfirmation?: object }`
- Agent SDK sessions managed in-memory with expiration
- System prompt with Minerva Money domain knowledge
- `ANTHROPIC_API_KEY` in `.env`

### Chat UI

- New `/chat` route in the React app
- Components: `ChatPage.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `ChatInput.tsx`
- Markdown rendering for agent responses
- Inline confirmation buttons for amount-changing actions
- Tailwind styling consistent with existing app

### Streaming & Response Handling

- Simple collect-and-return approach (upgrade to streaming later if needed)
- Response format: `{ content, sessionId, needsConfirmation? }`
- Error handling for SDK errors, tool execution errors, and network failures

### Permissions & Safety

- Auto-execute: all reads, categorization, rules, budgets, transfers, sync
- Confirmation required: manual transaction creation, amount modifications
- Guardrails: no account/transaction deletion, no raw SQL, input validation on all tools
