# Technology Stack

**Project:** Minerva Money v2.0 -- Claude Agent Integration
**Researched:** 2026-03-23
**Scope:** NEW dependencies only. Existing v1.0 stack is validated and unchanged.

## Existing Stack (Reference Only -- DO NOT CHANGE)

| Technology | Version | Purpose |
|------------|---------|---------|
| React | ^19.2.4 | UI framework |
| Tailwind CSS | ^4.2.2 | Styling |
| Vite | ^6.0.0 | Build tool |
| Express | ^4.21.0 | HTTP server |
| tRPC | ^11.14.1 | Type-safe API |
| better-sqlite3 | ^11.7.0 | SQLite database |
| TanStack Query | ^5.95.0 | Server state |
| Zod | ^4.3.6 | Schema validation |
| croner | ^10.0.1 | Cron scheduling |

## New Dependencies for v2.0

### Server: `@anthropic-ai/claude-agent-sdk`

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@anthropic-ai/claude-agent-sdk` | ^0.2.81 | Agent runtime with built-in tool loop, session management, and custom tool support via in-process MCP servers | Handles the entire agent loop (prompt -> tool calls -> tool results -> repeat -> final response), session persistence, and context management. Custom tools defined with `tool()` + `createSdkMcpServer()` using Zod schemas -- same Zod 4 already in the project. |

**Confidence:** HIGH -- verified via official Anthropic documentation at platform.claude.com and npm registry.

**Why Agent SDK over `@anthropic-ai/sdk` (Client SDK):**

The Client SDK gives you raw API access where you implement the tool loop yourself:

```typescript
// Client SDK: YOU manage the loop
let response = await client.messages.create({ ...params });
while (response.stop_reason === "tool_use") {
  const result = yourToolExecutor(response.tool_use);
  response = await client.messages.create({ tool_result: result, ...params });
}
```

The Agent SDK handles all of this internally:

```typescript
// Agent SDK: SDK manages the loop
for await (const message of query({ prompt: "...", options: { ... } })) {
  if (message.type === "result") console.log(message.result);
}
```

Additional Agent SDK advantages for this project:
- **Session management built-in:** Resume conversations with `resume: sessionId`. Sessions persist to disk automatically. Critical for multi-turn chat.
- **Custom tools via in-process MCP:** `tool()` helper uses Zod schemas for type-safe input validation. `createSdkMcpServer()` bundles tools into an in-process server (no separate process). Tools are called as `mcp__minerva__get_account_balances`.
- **Tool access control:** `tools: []` removes ALL built-in tools (Read, Bash, Edit, etc.). `allowedTools: ["mcp__minerva__*"]` pre-approves only your custom tools. The financial agent never gets file system or shell access.
- **Error handling:** Tool handlers returning `{ isError: true }` let the agent retry or explain the failure without crashing the loop.

**Zod compatibility:** The `tool()` function explicitly supports both Zod 3 and Zod 4 (documented in TypeScript API reference). The project's Zod ^4.3.6 works without any adapter or compatibility layer.

### Client: Markdown Rendering

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `react-markdown` | ^10.1.0 | Render agent markdown responses as React components | Converts markdown to React virtual DOM (not `dangerouslySetInnerHTML`). Safe by default -- blocks raw HTML. Custom component overrides via `components` prop for applying Tailwind classes to headings, tables, lists, code blocks. The standard React markdown library. |
| `remark-gfm` | ^4.0.1 | GitHub Flavored Markdown plugin | Agent responses will include tables (financial data summaries), task lists (confirmation flows), and strikethrough text. GFM is not built into react-markdown -- this plugin adds tables, strikethrough, autolinks, and task lists. |

**Confidence:** HIGH -- react-markdown is the dominant React markdown library (12M+ weekly downloads), maintained by the unified/remark ecosystem. remark-gfm is the standard GFM plugin.

**Why react-markdown over alternatives:**
- **Over `marked`:** marked outputs HTML strings requiring `dangerouslySetInnerHTML`. react-markdown outputs React components -- safer, more customizable, better Tailwind integration.
- **Over `markdown-it`:** Same dangerouslySetInnerHTML problem as marked.
- **Over `markdown-to-jsx`:** Less ecosystem support, fewer plugins, smaller community.

## Dependencies NOT Needed

| Library | Why Skip |
|---------|----------|
| `@anthropic-ai/sdk` | Agent SDK handles the tool loop. Client SDK would mean reimplementing orchestration that Agent SDK already provides. |
| `socket.io` / `ws` | PROJECT.md specifies collect-and-return for v2.0. A tRPC mutation awaiting the full response is simpler. Upgrade to streaming later if response times are slow. |
| `react-syntax-highlighter` | Financial assistant will not produce code blocks. Defer until needed. Avoids ~200KB bundle addition. |
| `@ai-sdk/anthropic` (Vercel AI SDK) | Unnecessary abstraction layer. Agent SDK provides everything needed directly. |
| `marked` / `markdown-it` | Outputs HTML strings, requires dangerouslySetInnerHTML. react-markdown is safer. |
| Any auth library | Single user on private home server (unchanged from v1.0). |
| `@anthropic-ai/bedrock-sdk` | Not using AWS. Direct API key auth via ANTHROPIC_API_KEY in .env. |

## Integration Architecture

### Server-Side Agent Execution

The Agent SDK runs server-side inside the Express process. The Anthropic API key stays on the server, never exposed to the client.

```
Express + tRPC (existing)
  |
  +-- New tRPC router: agent.chat (mutation)
  |     |
  |     +-- Calls query() with user prompt + session options
  |     +-- Collects all result messages (collect-and-return)
  |     +-- Returns { response: string, sessionId: string }
  |
  +-- Custom MCP Server (in-process via createSdkMcpServer)
        |
        +-- Query tools (readOnlyHint: true):
        |     get_account_balances   --> accountsService
        |     get_budget_summary     --> budgetService
        |     get_spending_by_category --> transactionsService
        |     get_net_worth          --> snapshotService
        |     get_transactions       --> transactionsService
        |     get_categories         --> categoriesService
        |     get_rules              --> rulesService
        |     get_sync_status        --> syncService
        |
        +-- Action tools (destructiveHint: true):
              categorize_transaction --> rulesService
              create_rule            --> rulesService
              update_rule            --> rulesService
              adjust_budget          --> budgetService
              confirm_transfer       --> transferService
              trigger_sync           --> syncService
```

### Custom Tool Definition Pattern

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { accountsService } from "../accounts/accounts-service";

const getAccountBalances = tool(
  "get_account_balances",
  "Get current balances for all accounts or a specific account by name",
  {
    accountName: z.string().optional()
      .describe("Account name to filter by, or omit for all accounts")
  },
  async (args) => {
    const accounts = args.accountName
      ? accountsService.getByName(args.accountName)
      : accountsService.getAll();
    return {
      content: [{ type: "text", text: JSON.stringify(accounts) }]
    };
  },
  { annotations: { readOnlyHint: true } }
);

const minervaServer = createSdkMcpServer({
  name: "minerva",
  version: "1.0.0",
  tools: [getAccountBalances, /* ... */]
});
```

### tRPC Integration Pattern

```typescript
export const agentRouter = router({
  chat: publicProcedure
    .input(z.object({
      message: z.string(),
      sessionId: z.string().optional()
    }))
    .mutation(async ({ input }) => {
      const messages: string[] = [];
      let sessionId: string | undefined;

      for await (const msg of query({
        prompt: input.message,
        options: {
          ...(input.sessionId ? { resume: input.sessionId } : {}),
          mcpServers: { minerva: minervaServer },
          allowedTools: ["mcp__minerva__*"],
          tools: [],                              // CRITICAL: removes ALL built-in tools
          systemPrompt: "You are Minerva, a personal finance assistant...",
          maxTurns: 10,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          persistSession: true
        }
      })) {
        if (msg.type === "assistant") {
          for (const block of msg.message.content) {
            if ("text" in block) messages.push(block.text);
          }
        }
        if (msg.type === "result") {
          sessionId = msg.session_id;
        }
      }

      return { response: messages.join("\n"), sessionId };
    })
});
```

**Critical configuration notes:**
- `tools: []` -- Removes ALL built-in tools (Read, Edit, Bash, Glob, Grep, WebSearch, WebFetch). The financial agent should ONLY access data through custom tools that wrap service functions. Never give it file system or shell access.
- `allowedTools: ["mcp__minerva__*"]` -- Wildcard pre-approves all tools on the minerva MCP server. No permission prompts.
- `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true` -- Required for headless server execution where no human is present to approve tool calls.
- `maxTurns: 10` -- Prevents runaway loops. A budget query might need 2-3 tool calls; a complex multi-step action might need 5-6. 10 is a safe ceiling.

### Session Management

The Agent SDK persists sessions to `~/.claude/projects/<encoded-cwd>/` automatically.

- **First message:** `query()` creates a new session. Capture `session_id` from the result message.
- **Follow-up messages:** Pass `resume: sessionId` to continue the conversation with full context.
- **Storage:** Store `sessionId` in server memory (single user, single process). No need for database storage. If the server restarts, the user starts a new conversation -- acceptable for v2.0.
- **Cleanup:** Sessions accumulate on disk. Consider a periodic cleanup of sessions older than 7 days.

### Client-Side Chat UI Pattern

```tsx
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

function ChatMessage({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => (
          <table className="w-full border-collapse text-sm">{children}</table>
        ),
        th: ({ children }) => (
          <th className="border-b px-3 py-2 text-left font-medium">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border-b px-3 py-2">{children}</td>
        ),
        // ... other component overrides for Tailwind styling
      }}
    >
      {content}
    </Markdown>
  );
}
```

## Environment Variables

Add to `.env` (already gitignored):

```
ANTHROPIC_API_KEY=sk-ant-...
```

The Agent SDK reads `ANTHROPIC_API_KEY` from the environment automatically. The server already loads `.env` via `tsx watch --env-file=../../.env`, so the key will be available to the Agent SDK running in the same process.

## Installation

```bash
# Server (from packages/server)
npm install @anthropic-ai/claude-agent-sdk

# Client (from packages/client)
npm install react-markdown remark-gfm
```

Total new dependencies: 3 packages (plus their transitive deps).

## Version Pinning Strategy

| Package | Range | Rationale |
|---------|-------|-----------|
| `@anthropic-ai/claude-agent-sdk` | `^0.2.81` | Pre-1.0, actively developed. Caret is acceptable for a single-user app where you control deploys. Pin to exact version if stability is critical. |
| `react-markdown` | `^10.1.0` | Stable, mature. Caret is safe. |
| `remark-gfm` | `^4.0.1` | Stable plugin. Caret is safe. |

## Sources

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview) -- Official documentation, capabilities, comparison with Client SDK
- [Claude Agent SDK TypeScript API Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) -- Full types, Options interface, query() function, tool() helper
- [Claude Agent SDK Custom Tools Guide](https://platform.claude.com/docs/en/agent-sdk/custom-tools) -- tool(), createSdkMcpServer(), error handling, annotations
- [Claude Agent SDK Sessions Guide](https://platform.claude.com/docs/en/agent-sdk/sessions) -- resume, continue, fork, session persistence
- [Claude Agent SDK Streaming vs Single Mode](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) -- Input mode comparison
- [Claude Agent SDK Quickstart](https://platform.claude.com/docs/en/agent-sdk/quickstart) -- Installation, prerequisites (Node.js 18+)
- [@anthropic-ai/claude-agent-sdk on npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) -- v0.2.81, last published 2026-03-21
- [Zod 4 compatibility issue #38](https://github.com/anthropics/claude-agent-sdk-typescript/issues/38) -- Confirmed both Zod 3 and Zod 4 supported as peer deps
- [react-markdown on GitHub](https://github.com/remarkjs/react-markdown) -- v10.1.0, React component-based rendering
- [remark-gfm on npm](https://www.npmjs.com/package/remark-gfm) -- v4.0.1, GFM support plugin
