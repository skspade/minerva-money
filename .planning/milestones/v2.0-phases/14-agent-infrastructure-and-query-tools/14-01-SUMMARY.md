---
phase: 14-agent-infrastructure-and-query-tools
plan: 01
status: complete
completed: "2026-03-23"
duration: ~15min
---

# Plan 14-01 Summary: Agent Infrastructure

## What Was Built
- Installed `@anthropic-ai/claude-agent-sdk` (^0.2.81)
- Created system prompt with hallucination prevention, prompt injection defense, cents-to-dollars conversion instruction, domain knowledge (envelope budgeting, 3 institutions, bi-monthly pay schedule)
- Created MCP server factory (`createMcpServer(db)`) with per-request instantiation
- Created agent service (`chat(db, message, sessionId?)`) with collect-and-return pattern, 30s timeout, session resume via SDK
- Created tRPC agent router with `chat` mutation accepting `{ message, sessionId? }` and returning `{ response, sessionId }`
- Wired `agentRouter` into `appRouter` in trpc-router.ts

## Key Files

### Created
- `packages/server/src/agent/system-prompt.ts` — `getSystemPrompt()` with dynamic date
- `packages/server/src/agent/mcp-server.ts` — `createMcpServer(db)` factory
- `packages/server/src/agent/agent-service.ts` — `chat()` with SDK query, timeout, error handling
- `packages/server/src/agent/agent-router.ts` — tRPC router
- `packages/server/src/agent/tools/query-tools.ts` — tool factory (initial 6 tools)

### Modified
- `packages/server/package.json` — added SDK dependency
- `packages/server/src/sync/trpc-router.ts` — added agent router to appRouter

## Decisions
- Used `permissionMode: 'bypassPermissions'` + `allowDangerouslySkipPermissions: true` for headless execution
- Used `tools: []` to disable all built-in tools
- System prompt kept under 2K tokens
- Per-request MCP server creation (not singleton)
