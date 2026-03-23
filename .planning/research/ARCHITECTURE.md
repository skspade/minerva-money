# Architecture Patterns

**Domain:** Claude Agent SDK integration into existing Express/tRPC personal budgeting app
**Researched:** 2026-03-23

## Recommended Architecture

### High-Level Data Flow

```
React Chat UI (ChatPage.tsx)
    |
    | POST /trpc/agent.chat (tRPC mutation)
    |
Express + tRPC Router (agent-router.ts)
    |
    | Creates/resumes Agent SDK session
    | Collects messages until result
    |
Claude Agent SDK (query() — V1 stable API)
    |  - systemPrompt: budgeting assistant persona
    |  - tools: [] (all built-ins REMOVED)
    |  - mcpServers: { minerva: inProcessMcpServer }
    |  - allowedTools: ["mcp__minerva__*"]
    |
In-Process MCP Server (createSdkMcpServer)
    |  - 10+ query tools (readOnlyHint: true)
    |  - 9+ action tools (mutations)
    |  - Each tool handler closes over db instance
    |
Existing Service Layer
    |  budget-service, rules-service, reports-service,
    |  category-service, transfer-service, sync-service
    |
SQLite via better-sqlite3
```

### Key Architectural Decision: Agent SDK with Custom MCP Tools Only

The Claude Agent SDK (formerly Claude Code SDK) is a general-purpose agent runtime with built-in tools for file I/O, bash commands, web search, and code editing. **None of these are appropriate for a budgeting chatbot.** The architecture disables all built-in tools via `tools: []` and exclusively uses custom MCP tools defined with `tool()` and served through an in-process MCP server via `createSdkMcpServer()`.

**Confidence: HIGH** -- The `tools: []` option removes all built-ins from context. Custom tools via in-process MCP server are a first-class, documented pattern. See the official [Custom Tools Guide](https://platform.claude.com/docs/en/agent-sdk/custom-tools).

### Component Boundaries

| Component | Responsibility | New/Modified | Communicates With |
|-----------|---------------|-------------|-------------------|
| `packages/server/src/agent/tools/query-tools.ts` | Read-only MCP tool definitions | **NEW** | Service layer functions |
| `packages/server/src/agent/tools/action-tools.ts` | Mutation MCP tool definitions | **NEW** | Service layer functions |
| `packages/server/src/agent/mcp-server.ts` | Create in-process MCP server via `createSdkMcpServer` | **NEW** | tools, agent-service |
| `packages/server/src/agent/agent-service.ts` | Manage SDK sessions, execute queries, collect responses | **NEW** | mcp-server, tRPC context |
| `packages/server/src/agent/agent-router.ts` | tRPC router for chat endpoint | **NEW** | agent-service |
| `packages/server/src/agent/system-prompt.ts` | System prompt constant for budgeting assistant | **NEW** | agent-service |
| `packages/server/src/sync/trpc-router.ts` | Add `agent: agentRouter` to `appRouter` | **MODIFIED** (add 1 import + 1 line) | agent-router |
| `packages/server/src/index.ts` | No changes needed -- context already has db | **UNCHANGED** | -- |
| `packages/client/src/pages/ChatPage.tsx` | Chat UI with message list, input, markdown | **NEW** | tRPC client |
| `packages/client/src/app.tsx` | Add `/chat` route | **MODIFIED** (add route) | ChatPage |
| `packages/client/src/components/Layout.tsx` | Add Chat nav link | **MODIFIED** (add link) | -- |

### Data Flow: Chat Request Lifecycle

**Step 1: User sends message from React UI**
```typescript
// ChatPage.tsx
const chatMutation = trpc.agent.chat.useMutation();
chatMutation.mutate({
  message: "How much did I spend on groceries this month?",
  sessionId: sessionId ?? undefined,
});
```

**Step 2: tRPC router receives request, calls agent service**
```typescript
// agent-router.ts
const agentRouter = router({
  chat: publicProcedure
    .input(z.object({
      message: z.string().min(1),
      sessionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return executeAgentQuery(ctx.db, input.message, input.sessionId);
    }),
});
```

**Step 3: Agent service creates SDK session and collects response**
```typescript
// agent-service.ts
import { query } from "@anthropic-ai/claude-agent-sdk";

export async function executeAgentQuery(
  db: Database.Database,
  message: string,
  sessionId?: string,
): Promise<{ response: string; sessionId: string }> {
  const mcpServer = createMinervaServer(db);
  let resultSessionId = "";
  let resultText = "";

  for await (const msg of query({
    prompt: message,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      tools: [],                              // Remove ALL built-in tools
      mcpServers: { minerva: mcpServer },
      allowedTools: ["mcp__minerva__*"],       // Auto-approve all custom tools
      permissionMode: "bypassPermissions",
      resume: sessionId,                       // Resume if continuing conversation
      model: "claude-sonnet-4-20250514",
    },
  })) {
    if (msg.type === "system" && msg.subtype === "init") {
      resultSessionId = msg.session_id;
    }
    if (msg.type === "result" && msg.subtype === "success") {
      resultText = msg.result;
    }
  }

  return { response: resultText, sessionId: resultSessionId };
}
```

**Step 4: SDK calls custom MCP tools autonomously as needed**

Claude reads tool descriptions, decides which to call, receives results, and may call additional tools before producing a final text response. The `for await` loop in Step 3 processes all intermediate messages and captures the final result.

**Step 5: Response returned to client, rendered as markdown**

## Patterns to Follow

### Pattern 1: Tool Factory with DB Closure

All tools need `db: Database.Database` but the `tool()` helper signature does not support injecting context. Use a factory function that closes over `db`.

**Confidence: HIGH** -- This is the standard pattern. The `tool()` handler is an async function; closure is the natural way to provide dependencies.

```typescript
// mcp-server.ts
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { createQueryTools } from "./tools/query-tools.js";
import { createActionTools } from "./tools/action-tools.js";

export function createMinervaServer(db: Database.Database) {
  return createSdkMcpServer({
    name: "minerva",
    version: "1.0.0",
    tools: [
      ...createQueryTools(db),
      ...createActionTools(db),
    ],
  });
}
```

```typescript
// tools/query-tools.ts
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getBudgetSummary, getAvailableToBudget } from "../../budget/budget-service.js";

export function createQueryTools(db: Database.Database) {
  const getBudgetSummaryTool = tool(
    "get_budget_summary",
    "Get budget summary for a month showing allocated, spent, available, and rollover amounts per category. Amounts are in cents.",
    { period: z.string().regex(/^\d{4}-\d{2}$/).describe("Month in YYYY-MM format, e.g. 2026-03") },
    async ({ period }) => {
      const summary = getBudgetSummary(db, period);
      const available = getAvailableToBudget(db, period);
      return {
        content: [{ type: "text", text: JSON.stringify({ categories: summary, availableToBudget: available }) }],
      };
    },
    { annotations: { readOnlyHint: true } }
  );

  return [getBudgetSummaryTool, /* ... more tools */];
}
```

### Pattern 2: Session Persistence via SDK

The Agent SDK manages session persistence automatically (writes to `~/.claude/` by default). The server stores zero session state. The client tracks `sessionId` in React state and sends it on subsequent messages.

**Confidence: HIGH** -- `persistSession: true` is the default. The `resume` option accepts a prior `session_id` to continue conversations with full context.

```typescript
// Client-side
const [sessionId, setSessionId] = useState<string | null>(null);
const [messages, setMessages] = useState<ChatMessage[]>([]);

const chatMutation = trpc.agent.chat.useMutation({
  onSuccess: (data) => {
    setSessionId(data.sessionId);
    setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
  },
});

function sendMessage(text: string) {
  setMessages(prev => [...prev, { role: "user", content: text }]);
  chatMutation.mutate({ message: text, sessionId: sessionId ?? undefined });
}
```

### Pattern 3: Collect-and-Return (Not Streaming)

Per PROJECT.md's explicit decision: use collect-and-return over streaming for simplicity. The tRPC mutation waits for the full agent response before returning. This avoids WebSocket complexity.

**Confidence: HIGH** -- The `for await` loop naturally collects all SDK messages. The final `result` message contains the complete response text.

### Pattern 4: Rich Tool Descriptions with Financial Context

Tool descriptions are critical -- Claude reads them to decide which tools to call. Include financial domain context, data format notes, and example use cases.

```typescript
// Good: Rich description with domain context
tool(
  "get_spending_by_category",
  "Get total spending broken down by budget category for a date range. " +
  "Amounts are in cents (integer). Excludes confirmed transfers between owned accounts. " +
  "Returns categoryName, groupName, and total for each category with spending. " +
  "Use this to answer questions like 'how much did I spend on groceries?' or 'what are my top spending categories?'",
  { startDate: z.string().describe("Start date YYYY-MM-DD"), endDate: z.string().describe("End date YYYY-MM-DD") },
  handler,
  { annotations: { readOnlyHint: true } }
);
```

### Pattern 5: Read-Only Annotations for Parallel Execution

Mark all query tools with `readOnlyHint: true`. This tells the SDK that these tools can be executed in parallel, improving response time when Claude needs data from multiple sources.

```typescript
// Query tools: parallel-safe
{ annotations: { readOnlyHint: true } }

// Action tools: sequential (default)
// No annotations needed -- destructiveHint defaults to true
```

### Pattern 6: Error Handling in Tool Handlers

Return `isError: true` instead of throwing exceptions. This keeps the agent loop alive so Claude can explain the error to the user.

```typescript
async ({ transactionId, categoryId }) => {
  try {
    updateTransactionCategory(db, transactionId, categoryId);
    return { content: [{ type: "text", text: `Transaction ${transactionId} categorized successfully.` }] };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to categorize transaction: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Exposing Built-in Agent Tools
**What:** Allowing Read, Write, Edit, Bash, Glob, Grep, WebSearch tools.
**Why bad:** The agent could read/write arbitrary files, run shell commands, or access the internet. Completely inappropriate for a budgeting chatbot. Also wastes context window on irrelevant tool definitions.
**Instead:** Set `tools: []` to remove all built-ins. Use only custom MCP tools via `createSdkMcpServer`.

### Anti-Pattern 2: Direct DB Access in Tool Handlers
**What:** Writing raw SQL queries inside tool handlers instead of calling existing service functions.
**Why bad:** Duplicates logic, bypasses business rules (e.g., transfer exclusion from spending reports, specificity scoring for rules), creates inconsistencies between UI and agent behavior.
**Instead:** Tool handlers call existing service functions (`getBudgetSummary(db, period)`, `getSpendingByCategory(db, start, end)`, etc.). Only use direct queries for simple lookups not covered by existing services (e.g., `get_accounts` listing).

### Anti-Pattern 3: Fresh Sessions Per Turn
**What:** Ignoring session management -- creating a fresh `query()` call without `resume` for every user message.
**Why bad:** Claude loses all conversation context. Each message becomes independent. The user cannot have multi-turn conversations ("What about last month?" after discussing current month).
**Instead:** Capture `session_id` from the first `system.init` message, return it to the client, and pass it as `resume` on subsequent turns.

### Anti-Pattern 4: Using V2 Preview Interface in Production
**What:** Using `unstable_v2_createSession()` / `unstable_v2_prompt()`.
**Why bad:** Explicitly marked as **unstable preview** in official docs: "APIs may change based on feedback before becoming stable." Session forking is V1-only.
**Instead:** Use the stable V1 `query()` API with `resume` for multi-turn conversations.

### Anti-Pattern 5: Premature Streaming via WebSocket
**What:** Building WebSocket infrastructure before validating response times with collect-and-return.
**Why bad:** Adds significant complexity (WebSocket server, connection management, reconnection, client-side streaming state) that may not be needed for a single-user app.
**Instead:** Start with tRPC mutation (collect-and-return). Measure actual response times. Only add streaming if latency is unacceptable.

### Anti-Pattern 6: Putting Agent SDK in a Separate Process
**What:** Running the agent as a separate microservice or worker process.
**Why bad:** Unnecessary complexity. The in-process MCP server runs in the same Node.js process as Express. The SDK spawns its own subprocess internally -- no need for additional process management.
**Instead:** The agent service is a module imported by the tRPC router, running in the same Express process.

## New Components Detailed

### 1. Query Tools (`packages/server/src/agent/tools/query-tools.ts`)

Factory function returning read-only MCP tool definitions. Each wraps an existing service function or simple DB query.

| Tool Name | Wraps | Parameters | Service |
|-----------|-------|------------|---------|
| `get_accounts` | Direct query | none | (simple SQL) |
| `get_budget_summary` | `getBudgetSummary()` + `getAvailableToBudget()` | `period` | budget-service |
| `get_spending_by_category` | `getSpendingByCategory()` | `startDate, endDate` | reports-service |
| `get_spending_over_time` | `getSpendingOverTime()` | `startDate, endDate` | reports-service |
| `get_net_worth` | `getNetWorth()` | `startDate?, endDate?` | reports-service |
| `get_transactions` | Direct query with filters | `startDate?, endDate?, categoryId?, accountId?, limit?` | (filtered SQL) |
| `get_categories` | `listGroupsWithCategories()` | none | category-service |
| `get_rules` | `listRules()` | none | rules-service |
| `get_sync_status` | Direct query (sync_log) | none | (simple SQL) |
| `get_transfer_candidates` | `listTransferCandidates()` | none | transfer-service |
| `get_budget_defaults` | `getDefaults()` | none | budget-service |

### 2. Action Tools (`packages/server/src/agent/tools/action-tools.ts`)

Factory function returning mutation MCP tool definitions.

| Tool Name | Wraps | Parameters | Service |
|-----------|-------|------------|---------|
| `categorize_transaction` | `updateTransactionCategory()` | `transactionId, categoryId` | category-service |
| `create_rule` | `createRule()` + `applyRule()` | `name, merchantPattern, matchType, amountMin, amountMax, memoPattern, categoryId` | rules-service |
| `update_rule` | `updateRule()` | `id, ...ruleFields` | rules-service |
| `delete_rule` | `deleteRule()` | `id` | rules-service |
| `set_budget_allocation` | `setAllocation()` | `categoryId, period, amount` | budget-service |
| `set_default_allocation` | `setDefaultAllocation()` | `categoryId, amount` | budget-service |
| `confirm_transfer` | `confirmTransfer()` | `id` | transfer-service |
| `dismiss_transfer` | `dismissTransfer()` | `id` | transfer-service |
| `trigger_sync` | `runSync()` | none | sync-service |

### 3. MCP Server Factory (`packages/server/src/agent/mcp-server.ts`)

Creates the in-process MCP server. Called once per agent query.

```typescript
export function createMinervaServer(db: Database.Database) {
  return createSdkMcpServer({
    name: "minerva",
    version: "1.0.0",
    tools: [...createQueryTools(db), ...createActionTools(db)],
  });
}
```

### 4. System Prompt (`packages/server/src/agent/system-prompt.ts`)

Single exported string constant. Defines the agent persona and behavioral rules:
- Identity: Minerva Money financial assistant
- Envelope budgeting model awareness
- Amounts stored in cents -- convert to dollars for display
- Current date for default period calculations
- When to ask for clarification vs infer (e.g., "this month" means current YYYY-MM)
- Confirmation behavior: auto-execute most actions, ask user before budget amount changes

### 5. Agent Service (`packages/server/src/agent/agent-service.ts`)

Core orchestration. Single exported function:
- Creates in-process MCP server with `createMinervaServer(db)`
- Calls `query()` with system prompt, no built-in tools, custom MCP tools, session resume
- Iterates async generator, collects result text and session ID
- Returns `{ response: string, sessionId: string }`

### 6. Agent Router (`packages/server/src/agent/agent-router.ts`)

tRPC router with single `chat` mutation. Input: `{ message: string, sessionId?: string }`. Output: `{ response: string, sessionId: string }`.

### 7. Chat Page (`packages/client/src/pages/ChatPage.tsx`)

Full-height chat page:
- Message list (user right-aligned, assistant left-aligned)
- Markdown rendering for assistant responses (`react-markdown`)
- Text input with send button
- Session state in `useState` (sessionId)
- Loading indicator during mutation
- Error display
- "New conversation" button to reset sessionId

## Integration Points Summary

### Files Modified (3 total, minimal changes)

1. **`packages/server/src/sync/trpc-router.ts`** -- Add `agent: agentRouter` to `appRouter`
2. **`packages/client/src/app.tsx`** -- Add `/chat` route
3. **`packages/client/src/components/Layout.tsx`** -- Add Chat nav link

### Files Created (7 total)

1. `packages/server/src/agent/tools/query-tools.ts`
2. `packages/server/src/agent/tools/action-tools.ts`
3. `packages/server/src/agent/mcp-server.ts`
4. `packages/server/src/agent/agent-service.ts`
5. `packages/server/src/agent/agent-router.ts`
6. `packages/server/src/agent/system-prompt.ts`
7. `packages/client/src/pages/ChatPage.tsx`

### Dependencies Added

- `@anthropic-ai/claude-agent-sdk` (server)
- `react-markdown` (client, for rendering assistant responses)

### Shared Context

The agent router uses the same tRPC context (`{ db, rateLimiter, client }`) as all existing routers. No changes to context creation in `index.ts`.

## Build Order (Considering Dependencies)

```
1. system-prompt.ts          (no dependencies)
2. query-tools.ts            (depends on: service layer functions, zod)
3. action-tools.ts           (depends on: service layer functions, zod)
4. mcp-server.ts             (depends on: query-tools, action-tools)
5. agent-service.ts          (depends on: mcp-server, system-prompt, @anthropic-ai/claude-agent-sdk)
6. agent-router.ts           (depends on: agent-service)
7. trpc-router.ts mod        (depends on: agent-router)
8. ChatPage.tsx              (depends on: agent router types, react-markdown)
9. app.tsx + Layout.tsx mods  (depends on: ChatPage)
```

**Recommended grouping into phases:**
- Phase 1: Server-side agent (steps 1-7) -- testable via direct function calls before UI exists
- Phase 2: Chat UI (steps 8-9) -- connect to working agent

## Scalability Considerations

| Concern | Current (single user) | Notes |
|---------|----------------------|-------|
| Concurrent requests | Not an issue | Agent SDK spawns subprocess per query; sequential is fine |
| Session storage | SDK persists to `~/.claude/` | Automatic, no management needed |
| Context window | ~20 tools at ~100 tokens each = ~2K tokens | Well within limits; tool search not needed |
| Response time | 3-15 seconds for collect-and-return | Acceptable for single user; add streaming later if needed |
| API costs | ~$0.01-0.05 per query (Sonnet) | Minimal for personal use |
| Memory | SDK spawns node subprocess | ~50-100MB additional per active query |

## Sources

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) -- HIGH confidence
- [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) -- HIGH confidence
- [Custom Tools Guide](https://platform.claude.com/docs/en/agent-sdk/custom-tools) -- HIGH confidence
- [MCP Integration Guide](https://platform.claude.com/docs/en/agent-sdk/mcp) -- HIGH confidence
- [TypeScript V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview) -- HIGH confidence (confirmed unstable)
- [Agent SDK Quickstart](https://platform.claude.com/docs/en/agent-sdk/quickstart) -- HIGH confidence
