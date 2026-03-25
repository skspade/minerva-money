# Technology Stack

**Project:** Minerva Money v2.6 - Streaming Chat (SSE)
**Researched:** 2026-03-24
**Confidence:** HIGH

## Core Finding: No New Dependencies Required

SSE streaming for this project requires **zero new npm packages**. Everything needed is already available through Express 4.x native capabilities, the Claude Agent SDK's existing `includePartialMessages` option, and the browser Fetch API with ReadableStream.

---

## Server-Side: Express Native SSE

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Express `res.write()` | 4.21.x (existing) | SSE event stream | Express supports SSE natively via `res.writeHead()` + `res.write()`. Set three headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`) and write `data:` lines. No middleware needed. |
| `@anthropic-ai/claude-agent-sdk` | ^0.2.81 (existing) | Stream SDK messages | The `query()` function returns `AsyncGenerator<SDKMessage>`. Adding `includePartialMessages: true` to options causes emission of `SDKPartialAssistantMessage` events (type `"stream_event"`) containing `BetaRawMessageStreamEvent` from the Anthropic SDK. This provides token-by-token text deltas and tool use events. |
| Zod | ^4.3.6 (existing) | Validate SSE request body | Validate the POST body on `/api/chat/stream` (message, sessionId, model). |

## Client-Side: Fetch + ReadableStream

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `fetch()` + `ReadableStream` | Browser native | Consume SSE stream | The Fetch API's `response.body` exposes a `ReadableStream`. Use `getReader()` + `TextDecoder` to read SSE chunks. Preferred over `EventSource` because `EventSource` only supports GET requests -- the chat endpoint needs POST with a JSON body. |
| React `useState` + `useRef` | 19.x (existing) | Accumulate streamed text | Standard React state management for building up the response string as text deltas arrive. |
| `react-markdown` | 10.1.0 (existing) | Render partial markdown | Already used for chat responses. Works with incrementally growing strings -- React re-renders as state updates. |

---

## Agent SDK Streaming Integration

### The `includePartialMessages` Option

The **only** change to agent SDK usage is adding `includePartialMessages: true` to the options object passed to `query()`. This causes the async generator to yield `SDKPartialAssistantMessage` events between the existing `SDKSystemMessage` (init) and `SDKResultMessage` (done) events.

**Confidence: HIGH** -- Verified in official Claude Agent SDK TypeScript reference (2026-03-24).

### SDKPartialAssistantMessage Structure

```typescript
type SDKPartialAssistantMessage = {
  type: "stream_event";
  event: BetaRawMessageStreamEvent; // From Anthropic SDK
  parent_tool_use_id: string | null;
  uuid: UUID;
  session_id: string;
};
```

### Relevant BetaRawMessageStreamEvent Types

The `event` field contains Anthropic streaming events. The relevant ones for SSE:

| Event Type | Key Fields | Maps To SSE Event | Purpose |
|------------|------------|-------------------|---------|
| `content_block_start` | `content_block.type === "text"` | (internal) | Text block starting, bookkeeping only |
| `content_block_delta` | `delta.type === "text_delta"`, `delta.text` | `text-delta` | Token-by-token text. This is the core streaming payload. |
| `content_block_start` | `content_block.type === "tool_use"`, `content_block.name` | `tool-start` | MCP tool invocation beginning |
| `content_block_stop` | (after a tool_use content block) | `tool-end` | Tool execution finished |

Additionally, the existing message types already handled by `collectResponse()`:

| SDK Message Type | Maps To SSE Event | Purpose |
|------------------|-------------------|---------|
| `SDKSystemMessage` (subtype `init`) | `session` | Session ID for resume capability |
| `SDKResultMessage` (subtype `success`) | `done` | Final result, cost, usage |
| `SDKResultMessage` (subtype `error_*`) | `error` | Error during execution |

**Confidence: HIGH** -- `content_block_delta` with `text_delta` is the standard Anthropic streaming format, documented in official API reference.

---

## SSE Protocol Design (Hand-Rolled, ~10 Lines)

### Wire Format

The SSE wire format is trivially simple. Each event:

```
event: session
data: {"sessionId":"abc-123"}

event: text-delta
data: {"text":"Hello"}

event: tool-start
data: {"tool":"get_account_balances","id":"toolu_123"}

event: tool-end
data: {"tool":"get_account_balances","id":"toolu_123"}

event: done
data: {"sessionId":"abc-123"}

```

### Server Helper

```typescript
function sendSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
```

### Client Parser

SSE line parsing is ~30 lines: split on `\n\n`, extract `event:` and `data:` lines, `JSON.parse()` the data. No library needed for a single endpoint with a controlled event format.

---

## Express Route Placement

The SSE endpoint is a plain Express POST route, registered **before** the tRPC middleware and the SPA catch-all in `index.ts`:

```
app.post('/api/chat/stream', streamHandler);  // NEW - SSE endpoint
app.use('/trpc', trpcMiddleware);              // EXISTING
app.use(express.static(clientDist));           // EXISTING
app.get('*', spaFallback);                     // EXISTING
```

It does NOT go through tRPC. SSE's long-lived connection model is incompatible with tRPC's request-response pattern.

---

## Client Hook Design

The streaming endpoint uses `fetch()` directly, **not** TanStack Query or tRPC. TanStack Query mutations expect a single response, not a stream. A custom `useStreamingChat` hook manages its own state (accumulated text, tool activity, loading/error) and calls `fetch('/api/chat/stream', ...)` directly.

The existing tRPC mutation path (`agent.chat`) remains functional as a fallback during migration.

---

## Timeout Handling Change

The existing per-model timeout scaling (Haiku 15s, Sonnet 30s, Opus 60s) needs adjustment for streaming:

- **Collect-and-return:** Timeout covers the entire request (appropriate since nothing visible happens until done)
- **Streaming:** Timeout should cover time-to-first-event, since streaming responses take longer overall but the user sees progress immediately

Use an `AbortController` with signal passed to both the SDK's `query()` and the client's `fetch()`.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Server SSE | Express native `res.write()` | `express-sse` npm | Adds dependency for ~5 lines of header setup. Last published 2019. |
| Server SSE | Express native `res.write()` | WebSocket (`ws`) | SSE is simpler, unidirectional, works through proxies. WebSocket adds bidirectional complexity for one-way data flow. |
| Server SSE | Express native `res.write()` | tRPC subscription (WebSocket) | Requires WebSocket adapter and wsLink. Major reconfiguration for one endpoint. |
| Client SSE | `fetch` + `ReadableStream` | `EventSource` API | `EventSource` only supports GET. Chat endpoint needs POST with JSON body. |
| Client SSE | `fetch` + `ReadableStream` | `eventsource-parser` (v3.0.6) | Solid library, overkill for one endpoint with simple format. 30 lines of hand-rolled parsing is clearer. |
| Client SSE | `fetch` + `ReadableStream` | `@microsoft/fetch-event-source` | Abandoned (last publish 2022). Unnecessary with modern fetch. |
| Streaming source | `includePartialMessages: true` | Anthropic Messages API directly | Bypasses Agent SDK, losing MCP tool integration, sessions, and existing tool infrastructure. |

## Libraries Explicitly NOT Needed

| Library/Tool | Why Not |
|--------------|---------|
| `express-sse` | Dead package (2019), trivial to do natively |
| `eventsource-parser` | Overkill for one endpoint with simple format |
| `@microsoft/fetch-event-source` | Abandoned, unnecessary with modern fetch |
| `ws` / WebSocket | Wrong tool for unidirectional streaming |
| `socket.io` | Massive overkill for single-user app |
| tRPC subscriptions | Requires WebSocket transport reconfiguration |
| Any SSE polyfill | Not using `EventSource` API; all target browsers support ReadableStream |

---

## Compatibility

| Concern | Status | Notes |
|---------|--------|-------|
| Browser ReadableStream | Supported | All modern browsers (Chrome 43+, Firefox 65+, Safari 10.1+). Home iMac Safari is well within range. |
| Express 4.x SSE | Supported | Native `res.write()` works. Express 4 does not buffer responses. |
| HTTP/1.1 SSE connection limit | Non-issue | Single user, single connection at a time. The 6-connection-per-domain limit only matters for multi-tab/multi-user. |
| Vite dev proxy | Needs config | Vite's dev server proxy needs the `/api/chat/stream` path proxied to port 3001. May need `changeOrigin: true` and response buffering disabled. |

---

## Installation

```bash
# Nothing to install. Zero new dependencies.
# Verify current SDK version:
cd /Users/seanspade/Documents/Source/minerva-money && npm ls @anthropic-ai/claude-agent-sdk express
```

---

## Sources

- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) -- HIGH confidence. Official docs confirming `includePartialMessages`, `SDKPartialAssistantMessage`, `BetaRawMessageStreamEvent` types.
- [Anthropic Streaming Messages API](https://docs.anthropic.com/en/api/messages-streaming) -- HIGH confidence. Official docs for `content_block_delta`, `text_delta`, `message_stop` event types.
- [MDN Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) -- HIGH confidence. SSE wire format specification.
- [Express SSE patterns](https://masteringjs.io/tutorials/express/server-sent-events) -- MEDIUM confidence. Confirms Express 4 native SSE with `res.writeHead()` + `res.write()`.
- [eventsource-parser on npm](https://www.npmjs.com/package/eventsource-parser) -- HIGH confidence. v3.0.6 confirmed, determined unnecessary for this use case.
- [Agent SDK streaming vs single mode](https://platform.claude.com/docs/en/agent-sdk/streaming-vs-single-mode) -- HIGH confidence. Official docs on streaming input mode.
- Existing codebase `agent-service.ts` -- HIGH confidence. Verified `query()` returns `AsyncIterable<SDKMessage>`, `collectResponse()` pattern.

---
*Stack research for: Minerva Money v2.6 Streaming Chat*
*Researched: 2026-03-24*
