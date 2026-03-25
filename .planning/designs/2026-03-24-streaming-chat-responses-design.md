# Streaming Chat Responses — Design

**Date:** 2026-03-24
**Approach:** Server-Sent Events (SSE) via Express endpoint

## SSE Event Protocol

The server emits newline-delimited SSE events with typed JSON payloads. Each event has a `type` field that the client switches on.

| Event | Payload | Description |
|-------|---------|-------------|
| `session` | `{ sessionId: string }` | Sent first — provides session ID for conversation continuity |
| `text-delta` | `{ text: string }` | Incremental text token(s) — client appends to current message |
| `tool-start` | `{ tool: string }` | Agent started calling a tool — client shows activity indicator |
| `tool-end` | `{ tool: string }` | Tool call completed — client can dismiss indicator |
| `done` | `{ fullText: string }` | Stream complete — includes final assembled text for confirmation parsing |
| `error` | `{ message: string }` | Error occurred — client shows error state |

Wire format (standard SSE):
```
event: text-delta
data: {"text":"Your budget for "}

event: text-delta
data: {"text":"Groceries is "}

event: tool-start
data: {"tool":"get_budget_summary"}

event: tool-end
data: {"tool":"get_budget_summary"}

event: text-delta
data: {"text":"$450 this month."}

event: done
data: {"fullText":"Your budget for Groceries is $450 this month."}
```

The `done` event carries the full assembled text so the client can do confirmation JSON parsing on the complete response (same logic as today) without needing to perfectly reconstruct from deltas.

## Server SSE Endpoint

A new Express route at `POST /api/chat/stream` registered directly on the Express app (not through tRPC). This endpoint validates input, sets SSE headers, and streams events.

Route registration (in a new `packages/server/src/agent/agent-sse.ts`):

```typescript
// POST because we're sending a message body (message, sessionId, model)
app.post('/api/chat/stream', express.json(), async (req, res) => {
  const { message, sessionId, model } = req.body;

  // Validate with Zod (same schema as tRPC input)
  const input = chatInputSchema.parse({ message, sessionId, model });

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Stream the agent response
  await streamChat(db, ctx, input, res);

  res.end();
});
```

Why POST instead of GET with EventSource:
- `EventSource` API only supports GET — can't send a JSON body
- We use `fetch()` with `ReadableStream` on the client instead, which supports POST
- This lets us send the message, sessionId, and model in the request body naturally

Input validation reuses the same Zod schema from the tRPC router, extracted to a shared location in the agent module. If validation fails, respond with a standard JSON error (before SSE headers are sent). If the stream fails mid-way, emit an `error` event and close.

## Server Stream Processing

The core `streamChat` function replaces `collectResponse`. Instead of awaiting the full result, it iterates the Agent SDK's async iterable and emits SSE events as messages arrive.

```typescript
export async function streamChat(
  db: Database.Database,
  ctx: Context,
  input: ChatInput,
  res: Response,
): Promise<void> {
  const mcpServer = createMcpServer(db, ctx);
  const systemPrompt = getSystemPrompt();

  const stream = query({
    prompt: input.message,
    model: getModelConfig(input.model).id,
    systemPrompt,
    mcpServers: [mcpServer],
    maxTurns: 10,
    resume: input.sessionId ? { sessionId: input.sessionId } : undefined,
    permissionMode: 'bypassPermissions',
  });

  let fullText = '';

  for await (const msg of stream) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      emit(res, 'session', { sessionId: msg.session_id });
    }

    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          emit(res, 'text-delta', { text: block.text });
          fullText += block.text;
        }
        if (block.type === 'tool_use') {
          emit(res, 'tool-start', { tool: block.name });
        }
      }
    }

    if (msg.type === 'tool_result') {
      emit(res, 'tool-end', { tool: msg.tool_name });
    }

    if (msg.type === 'result' && msg.subtype === 'success') {
      fullText = msg.result;
    }
  }

  emit(res, 'done', { fullText });
}

function emit(res: Response, event: string, data: object) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
```

Key decisions:
- The exact `SDKMessage` types need to be mapped by reading the Agent SDK's actual message shapes — the sketch above shows the pattern, implementation will inspect the real types
- `fullText` uses the SDK's final `result` field as source of truth (not concatenated deltas)
- Timeout handling wraps the entire `for await` loop with the same per-model timeout logic as today
- The existing `chat()` function stays for now as a non-streaming fallback

## Client Stream Consumer

A new React hook `useStreamingChat` replaces the current tRPC mutation for sending messages. It uses `fetch()` with a `ReadableStream` reader to consume SSE events from the POST endpoint.

Hook API:

```typescript
interface UseStreamingChatReturn {
  sendMessage: (message: string) => void;
  streamingText: string;        // Current accumulated text (updates on each delta)
  activeTool: string | null;    // Currently executing tool name, or null
  isStreaming: boolean;          // True while stream is active
  error: string | null;
}

function useStreamingChat(
  sessionId: string | null,
  model: string,
  onComplete: (fullText: string, sessionId: string) => void,
): UseStreamingChatReturn;
```

Implementation uses `fetch()` with `response.body.getReader()` to consume the SSE stream. A small SSE parser utility (~30 lines) splits the buffer on `\n\n`, extracts `event:` and `data:` fields, and returns parsed events. No external dependency needed.

The `onComplete` callback is where the ChatPage adds the final message to the messages array and handles confirmation JSON parsing — same logic as today, just triggered at stream end instead of mutation success.

## Client Incremental Rendering & Tool Activity UI

**Streaming message rendering:**
- While `isStreaming` is true, render `streamingText` through `react-markdown` in real-time as it accumulates
- The message bubble appears immediately on first `text-delta` (no bouncing dots needed once text starts flowing)
- Keep the bouncing dots animation only for the brief period between sending a message and receiving the first text delta (or during tool calls before any text has arrived)

**Tool activity indicator:**
- When `activeTool` is non-null, show a subtle inline indicator below the streaming text: a small spinner + human-readable tool label
- Map tool names to friendly labels: `get_budget_summary` → "Checking your budget...", `list_transactions` → "Looking up transactions...", etc.
- The indicator appears/disappears as `tool-start`/`tool-end` events arrive

**Tool label mapping:**

```typescript
const TOOL_LABELS: Record<string, string> = {
  get_account_balances: 'Checking account balances...',
  get_budget_summary: 'Reviewing your budget...',
  list_transactions: 'Looking up transactions...',
  get_spending_by_category: 'Analyzing spending...',
  trigger_sync: 'Syncing accounts...',
  // ... etc for all 21 tools, with a fallback
};

export function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Working on ${toolName.replace(/_/g, ' ')}...`;
}
```

**Confirmation flow** stays unchanged — the `onComplete` callback receives `fullText` from the `done` event, parses it for JSON confirmation blocks, and renders Confirm/Cancel buttons.

**Scroll behavior:** Auto-scroll to bottom as new text deltas arrive.

## Migration & Coexistence

**Phased approach — no big bang:**

1. Add SSE endpoint alongside existing tRPC mutation — both work simultaneously
2. Add `useStreamingChat` hook as the new default path in ChatPage
3. Keep the tRPC `chat` mutation as-is — useful as simpler code path and fallback
4. Remove the old collect-and-return path later if streaming proves stable — not in this milestone

**What changes:**
- `packages/server/src/agent/agent-service.ts` — add `streamChat()` function alongside existing `chat()`
- `packages/server/src/agent/agent-sse.ts` — new file for the Express SSE route
- `packages/server/src/index.ts` — register the SSE route on the Express app
- `packages/client/src/hooks/useStreamingChat.ts` — new hook
- `packages/client/src/pages/ChatPage.tsx` — swap to `useStreamingChat`, add tool indicator, streaming text rendering
- `packages/client/src/utils/sse.ts` — SSE event parser utility
- `packages/client/src/utils/tool-labels.ts` — tool name → friendly label map

**What doesn't change:**
- tRPC router and `agent-router.ts` — untouched
- MCP server, tools, system prompt — untouched
- Session management pattern — sessionId still flows the same way
- Confirmation flow logic — same parsing, just triggered from stream `done` event

**Testing approach:**
- Server: test `streamChat` with a mock response stream, verify correct SSE event sequence
- Client: test `useStreamingChat` hook with a mock fetch response
- E2E: manual testing of the streaming UX with each model (Haiku/Sonnet/Opus)
