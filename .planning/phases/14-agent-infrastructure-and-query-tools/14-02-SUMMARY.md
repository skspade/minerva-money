---
phase: 14-agent-infrastructure-and-query-tools
plan: 02
status: complete
completed: "2026-03-23"
duration: ~10min
---

# Plan 14-02 Summary: Core Query Tools

## What Was Built
6 query tools wrapping existing service functions:
1. `get_account_balances` — direct SQL on accounts table
2. `get_budget_summary` — wraps `getBudgetSummary()` + `getAvailableToBudget()`
3. `get_spending_by_category` — wraps `getSpendingByCategory()`
4. `get_spending_over_time` — wraps `getSpendingOverTime()`
5. `get_net_worth` — wraps `getNetWorth()`
6. `get_available_to_budget` — wraps `getAvailableToBudget()`

All tools use Zod schemas for input validation and return structured JSON via `{ content: [{ type: "text", text: JSON.stringify(data) }] }`. Error handling returns `{ isError: true }`.

## Key Files

### Created/Modified
- `packages/server/src/agent/tools/query-tools.ts` — 6 tools in `createQueryTools(db)`
- `packages/server/src/agent/mcp-server.ts` — wired tools into MCP server

## Decisions
- Combined creation of tools with Wave 1 commit since mcp-server.ts imports query-tools.ts
