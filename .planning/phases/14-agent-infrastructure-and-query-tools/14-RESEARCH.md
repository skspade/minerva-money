# Phase 14: Agent Infrastructure and Query Tools - Research

**Researched:** 2026-03-23
**Domain:** Claude Agent SDK integration, custom MCP tools, tRPC endpoint
**Confidence:** HIGH

## Summary

Phase 14 adds a Claude-powered conversational agent to Minerva Money. The agent uses the `@anthropic-ai/claude-agent-sdk` with custom MCP tools that wrap existing service functions. All 11 query tools are read-only and return structured JSON. The agent runs server-side inside the existing Express process, exposed via a single `agent.chat` tRPC mutation.

The Claude Agent SDK provides a `query()` function that manages the agent loop, tool execution, and session persistence. Custom tools are defined using `createSdkMcpServer` and the `tool()` helper with Zod schemas. Sessions resume via the `resume: sessionId` option. The V1 stable `query()` API is used (not the V2 preview).

**Primary recommendation:** Implement in 3 plans: (1) agent infrastructure + system prompt + tRPC endpoint, (2) query tools covering accounts/budgets/spending/net-worth, (3) remaining query tools covering transactions/categories/rules/sync/transfers + integration wiring.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use `@anthropic-ai/claude-agent-sdk` (^0.2.81) as the agent runtime
- Agent runs server-side inside the existing Express process
- Custom tools wrap existing service functions via direct service binding
- Collect-and-return via tRPC mutation, no WebSocket streaming
- Remove ALL built-in tools with `tools: []` and use only custom MCP tools via `createSdkMcpServer`
- Pre-approve all custom tools with `allowedTools: ["mcp__minerva__*"]` and bypass permissions for headless execution
- Set `maxTurns: 10` to prevent runaway API costs
- Single `agent.chat` mutation accepting `{ message: string, sessionId?: string }` returning `{ response: string, sessionId: string }`
- Resume multi-turn conversations via Agent SDK's `resume: sessionId` option
- System prompt defines Minerva Money assistant persona with envelope budgeting domain knowledge
- 11 query tools, all marked with `readOnlyHint: true`
- Tool factory pattern: `createQueryTools(db)` returns tool array with db closure
- Paginate transaction queries with default limit of 20, max 100
- New directory: `packages/server/src/agent/` with subdirectory `tools/`
- Use the V1 stable `query()` API, NOT the V2 preview

### Claude's Discretion
- Internal ordering of tool definitions within query-tools.ts
- Exact wording of tool descriptions (must include financial context and data format notes)
- Exact system prompt phrasing beyond the required constraints
- Whether to use `model: "claude-sonnet-4-20250514"` or a newer Sonnet variant
- Exact Zod schema shapes for tool inputs

### Deferred Ideas (OUT OF SCOPE)
- Chat UI (Phase 15)
- Action tools (Phase 16)
- Streaming responses (v2.x)
- Persistent chat history (v2.x)
- Token usage tracking (v2.x)
- Session cleanup/TTL (v2.x)
- Rate limiting on agent endpoint (v2.x)
- Composite `get_financial_overview` tool (v2.x)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGENT-01 | Server-side agent endpoint accepts chat messages and returns agent responses via tRPC | `query()` function collects messages; tRPC mutation wraps it |
| AGENT-02 | Agent uses only custom MCP tools wrapping existing service functions | `createSdkMcpServer` + `tool()` + `allowedTools: ["mcp__minerva__*"]` pattern |
| AGENT-03 | System prompt provides agent with domain knowledge | System prompt constant with persona, constraints, data format notes |
| AGENT-04 | Agent sessions persist across multiple turns | `resume: sessionId` option on `query()` |
| AGENT-05 | Agent enforces maxTurns limit | `maxTurns: 10` option on `query()` |
| QUERY-01 | Account balances query | Direct SQL on accounts table |
| QUERY-02 | Spending by category query | Wraps `getSpendingByCategory()` |
| QUERY-03 | Budget summary query | Wraps `getBudgetSummary()` |
| QUERY-04 | Net worth query | Wraps `getNetWorth()` |
| QUERY-05 | Transaction search/filter | Direct SQL with optional filters |
| QUERY-06 | Sync status query | Direct SQL on sync_log |
| QUERY-07 | Uncategorized transactions | Direct SQL with category_id IS NULL filter |
| QUERY-08 | Transfer suggestions | Wraps `listTransferCandidates()` |
| QUERY-09 | Categorization rules list | Wraps `listRules()` |
| QUERY-10 | Available-to-budget amount | Wraps `getAvailableToBudget()` |
| SAFE-01 | Agent auto-executes all read queries without confirmation | All tools use `readOnlyHint: true`; `allowedTools` pre-approves them |
| SAFE-03 | No delete tools for accounts or transactions | Tool inventory is explicitly read-only; no delete handlers |
| SAFE-04 | Tool inputs validated via Zod schemas | `tool()` helper accepts Zod schema for input validation |
| SAFE-05 | API key never exposed to client | Key stays in `.env`; agent runs server-side; Vite only exposes VITE_ prefix |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/claude-agent-sdk | ^0.2.81 | Agent runtime with tool execution, sessions, agent loop | Official SDK; provides `query()`, `tool()`, `createSdkMcpServer` |
| zod | ^4.3.6 | Tool input schema validation | Already in project; `tool()` helper accepts Zod schemas natively |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | ^11.7.0 | Database access for direct SQL tools | Already in project; tools that don't wrap service functions use direct queries |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Claude Agent SDK | Raw Anthropic API + manual tool loop | SDK handles agent loop, retries, tool execution automatically |
| Custom MCP tools | Built-in SDK tools | Custom tools are safer — no filesystem/shell access |

**Installation:**
```bash
cd packages/server && npm install @anthropic-ai/claude-agent-sdk@^0.2.81
```

## Architecture Patterns

### Recommended Project Structure
```
packages/server/src/agent/
├── tools/
│   └── query-tools.ts    # Tool factory: createQueryTools(db) → tool[]
├── mcp-server.ts          # MCP server factory: createMcpServer(db) → SdkMcpServer
├── agent-service.ts       # Core: chat(db, message, sessionId?) → { response, sessionId }
├── agent-router.ts        # tRPC router with agent.chat mutation
└── system-prompt.ts       # System prompt constant
```

### Pattern 1: Tool Factory with DB Closure
**What:** `createQueryTools(db)` accepts a database handle and returns an array of `tool()` definitions that close over `db`.
**When to use:** All query tools.
**Example:**
```typescript
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export function createQueryTools(db: Database.Database) {
  return [
    tool(
      "get_account_balances",
      "List all accounts with current balances. Amounts in cents (integer).",
      {},
      async () => {
        const rows = db.prepare("SELECT ...").all();
        return { content: [{ type: "text", text: JSON.stringify(rows) }] };
      }
    ),
    // ... more tools
  ];
}
```

### Pattern 2: MCP Server Factory
**What:** `createMcpServer(db)` creates the `SdkMcpServer` with all tools pre-registered.
**Example:**
```typescript
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";

export function createMcpServer(db: Database.Database) {
  return createSdkMcpServer({
    name: "minerva",
    version: "1.0.0",
    tools: createQueryTools(db),
  });
}
```

### Pattern 3: Collect-and-Return Query Wrapper
**What:** The `chat()` function calls `query()`, iterates the async generator, collects messages, extracts session ID and final text response.
**Example:**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

export async function chat(db: Database.Database, message: string, sessionId?: string) {
  const mcpServer = createMcpServer(db);
  let resultSessionId: string | undefined;
  let resultText = "";

  for await (const msg of query({
    prompt: message,
    options: {
      model: "claude-sonnet-4-20250514",
      systemPrompt: SYSTEM_PROMPT,
      mcpServers: { minerva: mcpServer },
      allowedTools: ["mcp__minerva__*"],
      maxTurns: 10,
      ...(sessionId ? { resume: sessionId } : {}),
    },
  })) {
    if (msg.type === "system" && msg.subtype === "init") {
      resultSessionId = msg.session_id;
    }
    if (msg.type === "assistant") {
      const text = msg.message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (text) resultText = text;
    }
    if (msg.type === "result" && msg.subtype === "success") {
      resultText = msg.result;
    }
  }

  return { response: resultText, sessionId: resultSessionId! };
}
```

### Anti-Patterns to Avoid
- **Using V2 preview API:** Stick to stable `query()` — V2 `unstable_v2_createSession()` is not production-ready
- **Singleton MCP server:** Create a new MCP server per request to avoid shared state issues
- **Returning raw SDK errors to client:** Catch at tRPC boundary, return sanitized error messages
- **Exposing ANTHROPIC_API_KEY to client:** Never prefix with VITE_; keep in .env only

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent loop (tool calls, retries) | Custom message loop | SDK `query()` | Handles multi-turn tool execution, retries, context management |
| Tool input validation | Manual type checking | Zod schemas in `tool()` | SDK validates automatically; consistent with project patterns |
| Session persistence | Custom sessions table | SDK's built-in session persistence | Writes to `~/.claude/`; single-user app doesn't need DB sessions |
| MCP server protocol | Raw JSON-RPC | `createSdkMcpServer()` | Handles MCP protocol, tool registration, response formatting |

## Common Pitfalls

### Pitfall 1: Hallucinated Financial Data
**What goes wrong:** Agent states dollar amounts without calling tools, making up numbers.
**Why it happens:** LLMs generate plausible-sounding numbers from training data.
**How to avoid:** System prompt explicitly says "NEVER state financial amounts without first calling a tool." Tool results return structured JSON, not prose.
**Warning signs:** Agent responses with specific dollar amounts that don't match tool call results.

### Pitfall 2: Context Window Bloat from Transaction Dumps
**What goes wrong:** Agent returns thousands of transactions, filling the context window and degrading quality.
**Why it happens:** No pagination on transaction queries.
**How to avoid:** Default limit of 20, max 100 on `list_transactions`. Paginated results include total count so agent can inform user.
**Warning signs:** Slow responses, truncated output, degraded quality on follow-up questions.

### Pitfall 3: Prompt Injection via Merchant Names
**What goes wrong:** Bank-provided merchant names or memos contain text that the agent interprets as instructions.
**Why it happens:** User data (merchant names) mixed into prompt context without delimiters.
**How to avoid:** Wrap bank-sourced strings in XML delimiters in tool output: `<merchant>COSTCO #123</merchant>`.
**Warning signs:** Agent behavior changes based on transaction data content.

### Pitfall 4: API Key Exposure
**What goes wrong:** ANTHROPIC_API_KEY leaks to client bundle.
**Why it happens:** Accidental VITE_ prefix or inclusion in client-accessible config.
**How to avoid:** Never prefix with VITE_. Agent runs entirely server-side. Key loaded via `tsx --env-file`.
**Warning signs:** Key visible in browser network tab or client bundle.

### Pitfall 5: Cents vs Dollars Display
**What goes wrong:** Agent shows amounts in cents (e.g., "$125000") instead of dollars ("$1,250.00").
**Why it happens:** All internal values are integer cents; agent doesn't know to convert.
**How to avoid:** System prompt instructs agent to convert cents to dollars. Tool descriptions note "Amounts in cents (integer)."
**Warning signs:** Unreasonably large dollar amounts in agent responses.

## Code Examples

### Existing Service Functions to Wrap

```typescript
// budget-service.ts
getBudgetSummary(db, period: string): BudgetCategorySummary[]
getAvailableToBudget(db, period: string): number

// reports-service.ts
getSpendingByCategory(db, startDate: string, endDate: string): SpendingByCategory[]
getSpendingOverTime(db, startDate: string, endDate: string): SpendingOverTime[]
getNetWorth(db, startDate?: string, endDate?: string): NetWorthPoint[]

// category-service.ts
listGroupsWithCategories(db): CategoryGroup[]

// rules-service.ts
listRules(db): RuleWithCategory[]

// transfer-service.ts
listTransferCandidates(db): TransferPair[]
```

### tRPC Router Integration Point

```typescript
// trpc-router.ts line 442
export const appRouter = router({
  sync: syncRouter,
  accounts: accountsRouter,
  transactions: transactionsRouter,
  categories: categoriesRouter,
  rules: rulesRouter,
  transfers: transfersRouter,
  budget: budgetRouter,
  reports: reportsRouter,
  // ADD: agent: agentRouter
});
```

### Tool Definition Pattern (from Context7)

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Tool with Zod schema validation
tool(
  "tool_name",
  "Tool description with data format notes",
  { param: z.string().describe("Parameter description") },
  async (args) => {
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
);
```

### Query with Sessions (from Context7)

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Initial query — captures sessionId from init message
for await (const msg of query({
  prompt: "user message",
  options: { mcpServers: { minerva: server }, allowedTools: ["mcp__minerva__*"] }
})) {
  if (msg.type === "system" && msg.subtype === "init") sessionId = msg.session_id;
  if (msg.type === "result" && msg.subtype === "success") result = msg.result;
}

// Resume query — passes sessionId
for await (const msg of query({
  prompt: "follow-up",
  options: { resume: sessionId }
})) { ... }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| V2 preview `unstable_v2_createSession()` | Exists but unstable | 2025 | Use V1 `query()` for production |
| Manual MCP server protocol | `createSdkMcpServer()` helper | SDK 0.2.x | No need to implement JSON-RPC manually |
| `permissionMode` config | `allowedTools` array | SDK 0.2.x | Fine-grained tool access control |

## Open Questions

1. **`allowDangerouslySkipPermissions` vs `permissionMode`**
   - What we know: Context states to bypass permissions for headless execution
   - What's unclear: Exact API option name may vary by SDK version
   - Recommendation: Check SDK types at implementation time; likely handled by `allowedTools` alone

2. **MCP server per-request vs singleton**
   - What we know: Context says per-request instantiation (not singleton)
   - What's unclear: Whether there's a performance cost to creating per-request
   - Recommendation: Create per-request — safer, avoids shared state, negligible cost

3. **System prompt token format**
   - What we know: `query()` may accept `systemPrompt` option
   - What's unclear: Whether system prompt is passed via options or prepended to prompt
   - Recommendation: Check SDK types; likely `systemPrompt` option on `query()`

## Sources

### Primary (HIGH confidence)
- Context7 /websites/platform_claude_en_agent-sdk — `query()` API, `tool()` helper, `createSdkMcpServer`, `allowedTools`, session resume, message types
- Existing codebase — service function signatures, tRPC patterns, database schema

### Secondary (MEDIUM confidence)
- CONTEXT.md / PROJECT.md — user decisions, architecture patterns, constraints

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - SDK docs verified via Context7, existing deps confirmed
- Architecture: HIGH - patterns derived from existing codebase + SDK docs
- Pitfalls: HIGH - documented in CONTEXT.md with specific mitigations

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable SDK, low churn expected)
