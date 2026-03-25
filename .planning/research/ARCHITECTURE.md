# Architecture Patterns

**Domain:** SSE streaming for LLM chat in Express + tRPC monorepo
**Researched:** 2026-03-24

## Recommended Architecture

**Approach:** Add a standalone Express POST endpoint (`/api/chat/stream`) alongside the existing tRPC middleware. Do NOT use tRPC subscriptions or streaming mutations for this -- use raw Express with SSE. The tRPC chat mutation remains as a fallback.

### Why raw Express SSE, not tRPC streaming

tRPC v11 (currently at 11.14.1 in this project) does support SSE subscriptions and streaming mutations via `httpBatchStreamLink`, but the chat streaming use case is a poor fit for tRPC streaming for three reasons:

1. **POST with body required.** SSE via `EventSource` is GET-only. tRPC subscriptions use GET-based SSE. Our chat needs to send a message body (message text, sessionId, model), which requires a POST request consumed via `fetch` + `ReadableStream` on the client.
2. **No type-safety benefit.** The SSE event stream is a sequence of typed JSON events parsed client-side. The tRPC type-safety wrapper adds no value over a Zod-validated POST body + typed SSE event parser. Type safety comes from the shared `SSEEvent` union type instead.
3. **Simpler integration.** A raw Express route avoids coupling streaming lifecycle to tRPC's middleware chain and batch link configuration. The existing tRPC setup stays completely untouched.

**Confidence:** HIGH -- verified tRPC v11 subscription docs (GET-based SSE), confirmed EventSource limitation (MDN), and validated the POST+fetch pattern is the standard approach for LLM streaming (used by OpenAI, Anthropic APIs).

### Component Boundaries

| Component | Location | Responsibility | New/Modified |
|-----------|----------|----------------|--------------|
| SSE event types | `packages/shared/src/sse-events.ts` | TypeScript union type for all SSE events | **NEW** |
| Stream handler | `packages/server/src/agent/stream-handler.ts` | Express handler: validate input, set SSE headers, iterate chatStream generator, write SSE events | **NEW** |
| Agent service | `packages/server/src/agent/agent-service.ts` | New `chatStream()` async generator alongside existing `chat()` | **MODIFIED** |
| Express app | `packages/server/src/index.ts` | Mount `POST /api/chat/stream` route before tRPC middleware | **MODIFIED** |
| Client stream hook | `packages/client/src/hooks/useStreamingChat.ts` | `fetch` POST, read SSE via `ReadableStream`, parse events, manage state | **NEW** |
| Chat page | `packages/client/src/pages/ChatPage.tsx` | Replace `chatMutation` with `useStreamingChat`, add tool activity indicators, incremental text | **MODIFIED** |
| Agent router | `packages/server/src/agent/agent-router.ts` | tRPC mutation kept as-is for fallback | **UNCHANGED** |
| Shared index | `packages/shared/src/index.ts` | Re-export SSE event types | **MODIFIED** |

### Data Flow

**Current flow (collect-and-return):**
```
ChatPage -> tRPC mutation -> agent-router -> chat() -> collectResponse(query()) -> full response -> tRPC response -> ChatPage renders all at once
```

**New flow (streaming):**
```
ChatPage -> fetch POST /api/chat/stream -> stream-handler -> chatStream()
  -> query({ prompt, options: { includePartialMessages: true } })
     -> for await (msg of queryStream):
          system(init)                          -> SSE: session {sessionId}
          stream_event(content_block_start, tool_use) -> SSE: tool-start {toolName, toolCallId}
          stream_event(content_block_delta, text_delta) -> SSE: text-delta {text}
          stream_event(content_block_stop)       -> SSE: tool-end {toolCallId}
          result(success)                        -> SSE: done {sessionId}
     -> ChatPage renders incrementally via useStreamingChat state
```

## SSE Event Protocol

Six event types, all sent as `event: <type>\ndata: <json>\n\n`:

```typescript
// packages/shared/src/sse-events.ts

type SSESessionEvent = {
  type: 'session';
  sessionId: string;
};

type SSETextDeltaEvent = {
  type: 'text-delta';
  text: string;
};

type SSEToolStartEvent = {
  type: 'tool-start';
  toolName: string;   // e.g. "get_balances", "create_rule"
  toolCallId: string; // unique ID for matching start/end
};

type SSEToolEndEvent = {
  type: 'tool-end';
  toolCallId: string;
};

type SSEDoneEvent = {
  type: 'done';
  sessionId: string;
};

type SSEErrorEvent = {
  type: 'error';
  message: string;
};

type SSEEvent =
  | SSESessionEvent
  | SSETextDeltaEvent
  | SSEToolStartEvent
  | SSEToolEndEvent
  | SSEDoneEvent
  | SSEErrorEvent;
```

**Design rationale:** These six event types map directly to the Claude Agent SDK's `stream_event` subtypes (`content_block_start`, `content_block_delta`, `content_block_stop`) plus the `system` init and `result` messages. No intermediate translation layer needed.

**Confidence:** HIGH -- event types map directly to Claude Agent SDK stream event types documented at https://platform.claude.com/docs/en/agent-sdk/streaming-output.

## Patterns to Follow

### Pattern 1: POST-based SSE with fetch + ReadableStream

**What:** Client sends POST with JSON body, server responds with `text/event-stream`. Client reads via `fetch` + `pipeThrough(TextDecoderStream)` + `getReader()`, not `EventSource` (which is GET-only).

**When:** Any time you need SSE with a request body (LLM chat, search-as-you-type).

**Server side:**
```typescript
// packages/server/src/agent/stream-handler.ts
import type { Request, Response } from 'express';
import { z } from 'zod';

const StreamRequestSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional(),
  model: z.string().optional(),
});

export function createStreamHandler(db: Database.Database, ctx: Context) {
  return async (req: Request, res: Response) => {
    const parsed = StreamRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',  // Disable proxy buffering if ever fronted by nginx
    });

    // Helper to write typed SSE events
    function sendEvent(event: SSEEvent) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }

    try {
      for await (const sseEvent of chatStream(db, ctx, parsed.data)) {
        sendEvent(sseEvent);
      }
    } catch (err) {
      sendEvent({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
    }

    res.end();
  };
}
```

**Client side:**
```typescript
// packages/client/src/hooks/useStreamingChat.ts
async function* readSSEStream(response: Response): AsyncGenerator<SSEEvent> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    // Split on double newline (SSE event boundary)
    const events = buffer.split('\n\n');
    buffer = events.pop()!; // Keep incomplete last chunk in buffer

    for (const raw of events) {
      const dataLine = raw.split('\n').find(l => l.startsWith('data: '));
      if (dataLine) {
        yield JSON.parse(dataLine.slice(6)) as SSEEvent;
      }
    }
  }
}
```

**Confidence:** HIGH -- this is the standard pattern used by OpenAI, Anthropic, and every major LLM API. Verified via MDN ReadableStream docs and multiple production implementations.

### Pattern 2: Agent SDK includePartialMessages for streaming

**What:** Pass `includePartialMessages: true` in Agent SDK options to receive `stream_event` messages containing raw Claude API streaming events (`content_block_start`, `content_block_delta`, `content_block_stop`).

**When:** You need token-by-token text and tool activity from the Agent SDK.

**Key SDK details (from official docs):**

- TypeScript type: `SDKPartialAssistantMessage` with `type: 'stream_event'`
- Contains `event: RawMessageStreamEvent` from the Anthropic SDK
- Also includes `session_id: string` and `parent_tool_use_id: string | null`
- Text arrives as `content_block_delta` events where `delta.type === 'text_delta'`
- Tool calls arrive as `content_block_start` (with `content_block.type === 'tool_use'` and `content_block.name`)
- Message flow: `message_start` -> `content_block_start` -> `content_block_delta`(s) -> `content_block_stop` -> `message_delta` -> `message_stop`

**Server-side generator (the core new function in agent-service.ts):**
```typescript
export async function* chatStream(
  db: Database.Database,
  ctx: Context,
  input: { message: string; sessionId?: string; model?: string },
): AsyncGenerator<SSEEvent> {
  const mcpServer = createMcpServer(db, ctx);
  const model = (input.model as ModelId) || DEFAULT_MODEL_ID;

  const options = {
    model,
    systemPrompt: getSystemPrompt(),
    mcpServers: { minerva: mcpServer },
    allowedTools: ['mcp__minerva__*'],
    tools: [],
    maxTurns: 10,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,  // <-- THE KEY CHANGE: enables streaming
    ...(input.sessionId ? { resume: input.sessionId } : {}),
  };

  let currentToolCallId: string | null = null;
  let inTool = false;

  for await (const msg of query({ prompt: input.message, options })) {
    // Session init
    if (msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init') {
      yield { type: 'session', sessionId: (msg as any).session_id };
    }

    // Stream events (text deltas, tool calls)
    if (msg.type === 'stream_event') {
      const event = msg.event;

      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        currentToolCallId = event.content_block.id;
        inTool = true;
        yield {
          type: 'tool-start',
          toolName: event.content_block.name,
          toolCallId: currentToolCallId,
        };
      }

      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && !inTool) {
        yield { type: 'text-delta', text: event.delta.text };
      }

      if (event.type === 'content_block_stop' && inTool) {
        yield { type: 'tool-end', toolCallId: currentToolCallId! };
        inTool = false;
        currentToolCallId = null;
      }
    }

    // Final result
    if (msg.type === 'result' && 'subtype' in msg && msg.subtype === 'success') {
      yield { type: 'done', sessionId: (msg as any).session_id || '' };
    }
  }
}
```

**Confidence:** HIGH -- verified against official Agent SDK streaming docs at https://platform.claude.com/docs/en/agent-sdk/streaming-output. The `stream_event` type, `content_block_delta`, and `text_delta` patterns are documented with TypeScript examples.

### Pattern 3: Mount Express route before tRPC middleware

**What:** Register the SSE endpoint as a standard Express route in `index.ts` before the tRPC middleware, so it is handled by Express directly.

**Current index.ts structure:**
```typescript
app.use(express.json({ limit: '10mb' }));     // line 18
app.get('/health', ...);                        // line 20
app.use('/trpc', trpcExpress.createExpressMiddleware(...)); // line 29
app.use(express.static(clientDist));            // line 38
app.get('*', ...);                              // line 39 (SPA catch-all)
```

**New route insertion point -- between health check and tRPC:**
```typescript
app.get('/health', ...);
app.post('/api/chat/stream', createStreamHandler(db, ctx));  // <-- NEW
app.use('/trpc', trpcExpress.createExpressMiddleware(...));
```

**Why this position:** The `/api/chat/stream` path does not conflict with `/trpc/*`, but placing it before tRPC makes the intent clear. It MUST be before the SPA catch-all `app.get('*', ...)` which would swallow it.

**Confidence:** HIGH -- standard Express routing behavior, verified by reading the current index.ts.

### Pattern 4: AbortController for client-side cancellation

**What:** Use `AbortController` with the fetch request so the user can cancel a streaming response or the component can clean up on unmount.

**Example:**
```typescript
// In useStreamingChat hook
const abortControllerRef = useRef<AbortController | null>(null);

async function sendMessage(message: string) {
  abortControllerRef.current?.abort(); // Cancel any in-flight request
  const controller = new AbortController();
  abortControllerRef.current = controller;

  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId, model }),
    signal: controller.signal,
  });
  // ... read stream
}

// Cleanup on unmount
useEffect(() => {
  return () => abortControllerRef.current?.abort();
}, []);
```

**Server-side detection:**
```typescript
// In stream-handler.ts
req.on('close', () => {
  // Client disconnected -- the for-await loop will naturally end
  // when res.write() fails on the next iteration
});
```

**Confidence:** MEDIUM -- the fetch AbortController is well-documented. The Agent SDK query generator cleanup on client disconnect needs testing to confirm it terminates cleanly rather than leaking.

### Pattern 5: Per-model timeout on streaming

**What:** Apply per-model timeouts matching the existing `TIMEOUT_MS` config in `models.ts` (Haiku: 15s, Sonnet: 30s, Opus: 60s).

**Note:** For streaming, the timeout semantics change. With collect-and-return, timeout means "total time to get complete response." With streaming, timeout should mean "maximum time with no events" (stall detection), since a multi-tool response legitimately takes longer than a single text response.

**Recommended approach:** Use a stall timeout that resets on each received event, rather than a total duration timeout.

```typescript
// In stream-handler.ts
const STALL_TIMEOUT_MS = TIMEOUT_MS[model]; // Reuse existing per-model config

let stallTimer: NodeJS.Timeout;
function resetStallTimer() {
  clearTimeout(stallTimer);
  stallTimer = setTimeout(() => {
    sendEvent({ type: 'error', message: `No response for ${STALL_TIMEOUT_MS / 1000}s` });
    res.end();
  }, STALL_TIMEOUT_MS);
}

resetStallTimer();
for await (const sseEvent of chatStream(db, ctx, parsed.data)) {
  resetStallTimer();
  sendEvent(sseEvent);
}
clearTimeout(stallTimer);
```

**Confidence:** MEDIUM -- the stall-based timeout approach is sound, but the exact timeout values may need tuning. Tool execution (e.g., database queries) adds internal latency between stream events that is not stalling.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using EventSource for POST requests
**What:** Trying to use the browser's `EventSource` API to connect to the SSE endpoint.
**Why bad:** `EventSource` only supports GET requests. Cannot send a JSON body with message, sessionId, model.
**Instead:** Use `fetch` with `ReadableStream` + `getReader()` as shown in Pattern 1.

### Anti-Pattern 2: tRPC subscription for chat streaming
**What:** Using tRPC v11's SSE subscription feature for the chat stream.
**Why bad:** tRPC subscriptions are GET-based SSE designed for server-push scenarios (live updates, notifications). Chat requires sending a message body. Would need a two-step flow (POST mutation to start, then GET subscription to receive) adding unnecessary complexity and a race condition window.
**Instead:** Single POST endpoint that returns an SSE stream.

### Anti-Pattern 3: Buffering events before sending
**What:** Collecting stream events into an array then sending them in a batch.
**Why bad:** Defeats the entire purpose of streaming. User sees the same delay as the current collect-and-return approach.
**Instead:** Write each SSE event to the response immediately as it arrives from the Agent SDK.

### Anti-Pattern 4: Parsing SSE events with complex regex
**What:** Complex regex patterns to parse the SSE text format on the client.
**Why bad:** Fragile, doesn't handle edge cases (multi-line data, buffered/split chunks across reads).
**Instead:** Split on `\n\n` boundaries, find `data:` lines, parse JSON. Keep it simple and buffer-aware (see Pattern 1 client example).

### Anti-Pattern 5: Removing the existing tRPC chat mutation
**What:** Deleting the tRPC `agent.chat` mutation when adding SSE streaming.
**Why bad:** Removes fallback path. If streaming fails (network issues, proxy buffering), the user has no way to chat. Also breaks the migration path -- both should work during development.
**Instead:** Keep both paths. ChatPage uses SSE by default. The tRPC mutation remains available and functional.

### Anti-Pattern 6: Using httpBatchStreamLink for the whole app
**What:** Switching the tRPC client to use `httpBatchStreamLink` to enable streaming across all tRPC calls.
**Why bad:** Changes the transport for every tRPC call in the app, not just chat. Risk of breaking existing working queries/mutations. Overkill for one streaming endpoint.
**Instead:** The SSE endpoint is completely separate from tRPC. No tRPC configuration changes needed.

## Integration Points (Detailed)

### 1. Shared SSE Event Types
- **File:** `packages/shared/src/sse-events.ts` (NEW)
- **Also:** `packages/shared/src/index.ts` (MODIFIED -- add re-export)
- **What:** Export the `SSEEvent` union type and individual event types
- **Why shared:** Both server (to emit events) and client (to parse events) import the same type definitions, ensuring the protocol contract is enforced at compile time
- **Dependency on:** Nothing. This is a pure type definition file.

### 2. Server: Agent Service Extension
- **File:** `packages/server/src/agent/agent-service.ts` (MODIFIED)
- **What:** Add `chatStream()` async generator function alongside the existing `chat()` function
- **Key change:** Pass `includePartialMessages: true` to SDK options, iterate stream events, yield typed `SSEEvent` objects
- **Dependencies:** Same as `chat()` -- `query` from SDK, `createMcpServer`, `getSystemPrompt`, `models.ts`
- **Existing `chat()` function:** Completely unchanged. Kept as fallback path.
- **Dependency on:** Shared SSE event types (for `SSEEvent` type)

### 3. Server: Stream Handler
- **File:** `packages/server/src/agent/stream-handler.ts` (NEW)
- **What:** Express request handler that validates input with Zod, sets SSE headers, iterates `chatStream()` generator, writes events to response
- **Responsibilities:** HTTP concerns only -- input validation, SSE header setup, event serialization, error handling, connection cleanup
- **Dependencies:** `agent-service.chatStream()`, shared SSE event types, Zod, Express types, `isValidModelId` from models.ts
- **Why separate from agent-service:** Separates HTTP transport concerns from agent logic. `chatStream()` is a pure generator that could be reused by a WebSocket handler or CLI.

### 4. Server: Express App Mount
- **File:** `packages/server/src/index.ts` (MODIFIED)
- **What:** Import `createStreamHandler` and add `app.post('/api/chat/stream', createStreamHandler(db, ctx))` between health check and tRPC middleware
- **Lines affected:** ~3 lines (1 import + 1 route registration + maybe 1 blank line)
- **Critical ordering:** Must be AFTER `express.json()` (needs parsed body) and BEFORE the SPA catch-all `app.get('*', ...)`

### 5. Client: Streaming Chat Hook
- **File:** `packages/client/src/hooks/useStreamingChat.ts` (NEW)
- **What:** Custom React hook that manages the full streaming lifecycle
- **State managed:**
  - `messages: ChatMessage[]` -- complete message history (same type as current ChatPage)
  - `streamingText: string` -- current partial response being built from text-delta events
  - `activeTools: { toolName: string; toolCallId: string }[]` -- tools currently executing
  - `sessionId: string | undefined` -- agent session for multi-turn conversation
  - `isStreaming: boolean` -- whether a stream is in progress
- **Returns:** `{ messages, streamingText, activeTools, isStreaming, sendMessage, sessionId }`
- **No TanStack Query dependency:** Raw `fetch` -- TanStack Query's mutation model (single request/response) does not fit streaming
- **Dependency on:** Shared SSE event types (for parsing)

### 6. Client: ChatPage Modifications
- **File:** `packages/client/src/pages/ChatPage.tsx` (MODIFIED)
- **What:** Replace `chatMutation` usage with `useStreamingChat` hook
- **Key UI changes:**
  - Bouncing dots replaced with live streaming text as it arrives
  - New tool activity indicator (e.g., animated pill showing "Looking up balances...") during tool execution
  - `streamingText` rendered in an assistant bubble that grows as text arrives
  - When stream completes (`done` event), `streamingText` is finalized into a `ChatMessage` in the `messages` array
  - Confirmation flow (JSON block parsing) moves to happen after stream completes, since the full response text is needed to detect confirmation blocks
- **Preserved:** Model selector, session management, example questions, mobile-friendly layout

## Suggested Build Order

Build in this order to enable incremental testing at each step:

| Step | What | Files | Why This Order | Testable? |
|------|------|-------|----------------|-----------|
| 1 | SSE event types in shared package | `shared/src/sse-events.ts`, `shared/src/index.ts` | Zero dependencies. Everything else imports from here. | `npm run build` passes (type-only) |
| 2 | `chatStream()` generator in agent-service.ts | `server/src/agent/agent-service.ts` | Core streaming logic. Can be unit tested by mocking the SDK query and verifying yielded events. | Unit test: mock query, check yields |
| 3 | Stream handler + Express mount | `server/src/agent/stream-handler.ts`, `server/src/index.ts` | Wires generator to HTTP. Testable with curl. | `curl -X POST -H 'Content-Type: application/json' -d '{"message":"test"}' http://localhost:3001/api/chat/stream` |
| 4 | `useStreamingChat` hook | `client/src/hooks/useStreamingChat.ts` | Client-side SSE consumer. Testable against running server from step 3. | Manual: call hook from console or minimal test page |
| 5 | ChatPage integration | `client/src/pages/ChatPage.tsx` | UI rendering of streaming text + tool indicators. Requires hook from step 4. | Visual: send message, see streaming text appear |
| 6 | Polish: cancellation, timeouts, fallback | All files | Error handling and edge cases after happy path works. | Manual: test abort, test timeout, test network failure |

**Step ordering rationale:**
- Steps 1-3 are server-only -- fully testable without any client changes
- Steps 4-5 are client-only -- build on a working server endpoint
- Step 6 is hardening -- only meaningful after the happy path works end-to-end
- Steps 2 and 3 must be sequential (handler depends on generator)
- Steps 4 and 5 must be sequential (ChatPage depends on hook)

## Known Limitation: Extended Thinking

The Agent SDK docs explicitly state that `StreamEvent` messages are **not emitted** when `maxThinkingTokens` is set. Since the current Minerva agent does not use extended thinking (no `maxThinkingTokens` in the options), this is not an issue. If extended thinking is added later, streaming would need to fall back to the collect-and-return path for those requests.

**Confidence:** HIGH -- explicitly documented limitation at https://platform.claude.com/docs/en/agent-sdk/streaming-output.

## Sources

- [Claude Agent SDK streaming output docs](https://platform.claude.com/docs/en/agent-sdk/streaming-output) -- HIGH confidence, official Anthropic documentation. Verified `includePartialMessages`, `stream_event` type, `content_block_delta`/`text_delta` patterns, and the extended thinking limitation.
- [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) -- HIGH confidence, authoritative web standard reference. Confirmed EventSource is GET-only.
- [MDN: ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) -- HIGH confidence, authoritative. Confirmed `pipeThrough(TextDecoderStream)` + `getReader()` pattern.
- [tRPC v11 Subscriptions docs](https://trpc.io/docs/server/subscriptions) -- HIGH confidence, official tRPC docs. Confirmed subscriptions use GET-based SSE.
- [tRPC Streaming Mutations Issue #4477](https://github.com/trpc/trpc/issues/4477) -- MEDIUM confidence, GitHub discussion on streaming mutations.
- [SSE POST without EventSource](https://medium.com/@david.richards.tech/sse-server-sent-events-using-a-post-request-without-eventsource-1c0bd6f14425) -- MEDIUM confidence, community pattern validation.
- [Consuming Streamed LLM Responses on the Frontend](https://tpiros.dev/blog/streaming-llm-responses-a-deep-dive/) -- MEDIUM confidence, practical implementation guide for fetch+SSE with LLMs.
- Direct code inspection of: `packages/server/src/agent/agent-service.ts`, `agent-router.ts`, `models.ts`, `mcp-server.ts`, `index.ts`, `trpc.ts`, `trpc-router.ts`, `packages/client/src/pages/ChatPage.tsx`, `packages/client/src/trpc.ts`

---
*Architecture research for: v2.6 Streaming Chat (SSE integration with Express + tRPC)*
*Researched: 2026-03-24*
