---
phase: 16-action-tools-and-confirmation-flow
plan: 02
status: complete
started: 2026-03-23
completed: 2026-03-23
duration: ~5min
---

# Plan 02 Summary: Wire Action Tools and Update System Prompt

## What Was Built
Wired the 10 action tools from Plan 01 into the MCP server alongside existing query tools. Expanded the call chain to pass tRPC context (needed for sync tool). Updated system prompt with write operation rules and budget confirmation flow instructions.

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | Wire action tools into MCP server and pass context through | Done |
| 2 | Update system prompt with write operation and confirmation rules | Done |

## Key Files

### Modified
- `packages/server/src/agent/mcp-server.ts` — Imports createActionTools, expanded signature to accept Context, spreads action tools into tools array
- `packages/server/src/agent/agent-service.ts` — Added Context parameter to chat(), passes ctx to createMcpServer()
- `packages/server/src/agent/agent-router.ts` — Passes full tRPC ctx to chat()
- `packages/server/src/agent/system-prompt.ts` — Added rules 8-12: write operation behavior, rule delete confirmation, budget confirmation JSON block format, dollar-to-cents conversion

## Decisions Made
- System prompt rules numbered 8-12 continuing from existing 1-7
- Budget confirmation block format matches existing ChatPage regex exactly: `{ "type": "confirmation", "action": "...", "description": "..." }`
- Rule delete confirmation is prompt-driven (agent states name and asks before calling delete_rule)

## Test Results
- All 258 tests passing (no regressions)

## Self-Check: PASSED
- [x] Action tools registered in MCP server alongside query tools
- [x] tRPC context flows from router -> service -> mcp-server -> action tools
- [x] System prompt instructs agent on write operation behavior
- [x] System prompt includes exact confirmation JSON block format
- [x] All existing tests continue to pass
