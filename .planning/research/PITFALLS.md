# Domain Pitfalls

**Domain:** Adding SSE streaming to an Express/React chat app with Claude Agent SDK
**Researched:** 2026-03-24

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Using EventSource API for POST Requests

**What goes wrong:** The browser `EventSource` API only supports GET requests. The chat endpoint needs `message`, `sessionId`, and `model` in a request body. Attempting to use EventSource forces encoding all parameters in query strings, which is fragile, has URL length limits, and leaks conversation content into server logs.
**Why it happens:** EventSource is the "obvious" SSE client API, but it was designed for subscription-style GET endpoints, not request-response patterns like chat.
**Consequences:** Either you hack parameters into query strings or you abandon EventSource mid-implementation and rewrite the client.
**Prevention:** Use `fetch()` with `ReadableStream` from the start. The pattern is: `fetch('/api/chat/stream', { method: 'POST', body: JSON.stringify(payload) })` then read from `response.body.getReader()` with a `TextDecoder`. Parse SSE format manually (split on `\n\n`, extract `data:` lines).
**Detection:** If you find yourself building a GET endpoint for chat, stop -- you are on the wrong path.
**Confidence:** HIGH -- EventSource GET-only limitation is a spec constraint (MDN, WHATWG spec).

### Pitfall 2: Agent SDK Timeout Race Condition with Streaming

**What goes wrong:** The current `agent-service.ts` (lines 43-49) uses `Promise.race()` with a monolithic timeout (15s/30s/60s per model). With streaming, the first token may arrive within the timeout, but the full response takes much longer. If the timeout fires mid-stream, the server aborts the Agent SDK iterator while the client is still reading SSE events.
**Why it happens:** The existing collect-and-return pattern treats the entire agent response as one unit. Streaming breaks this assumption -- the "response" is now a long-lived stream with tokens spread over the full duration.
**Consequences:** Partial responses cut off abruptly. The client receives an error mid-sentence. The Agent SDK async iterator may not be properly cleaned up, leaking resources. Opus responses (which are slower) get cut off more frequently than Haiku responses.
**Prevention:** Replace the monolithic timeout with two timeouts: (a) a **first-token timeout** (e.g., 15s) that fires if no events arrive at all, and (b) an **idle timeout** (e.g., 10s between events) that fires if the stream stalls mid-response. Reset the idle timeout on each received event. Do NOT use a total wall-clock timeout for streaming.
**Detection:** Send a complex multi-tool query with Opus selected and observe whether it completes or gets truncated.
**Confidence:** HIGH -- this is a direct consequence of the existing timeout architecture in `agent-service.ts`.

### Pitfall 3: Memory Leak from Unclosed Server-Side Streams

**What goes wrong:** If the client disconnects (navigates away, closes tab, network drop) while the Agent SDK is still iterating, the server-side `for await` loop keeps running, consuming API tokens and memory. The response object is closed but the Agent SDK async iterator is not.
**Why it happens:** Express does not automatically abort async iterators when the client disconnects. The `for await` loop on `query()` continues until the iterator completes or throws.
**Consequences:** Wasted Anthropic API credits. Memory accumulates from orphaned iterators. Under repeated disconnects, the server process grows unbounded.
**Prevention:** Listen for the `close` event on the Express request object:
```typescript
let aborted = false;
req.on('close', () => { aborted = true; });

for await (const msg of queryStream) {
  if (aborted) break;
  // ... process message
}
```
Additionally, call `.return()` on the async iterator after breaking to signal the Agent SDK to stop cleanly.
**Detection:** Monitor server memory over time during development. Navigate away from ChatPage mid-response repeatedly and check if memory grows.
**Confidence:** HIGH -- standard server-side streaming issue (Express #2248), directly applicable to the existing `collectResponse` pattern.

### Pitfall 4: react-markdown Rendering Incomplete Markdown During Streaming

**What goes wrong:** `react-markdown` (currently used in ChatPage.tsx line 156) is designed for complete markdown documents. When fed partial streaming content, it produces visual artifacts: unclosed `**bold**` shows literal asterisks, partial code blocks show raw backticks, incomplete tables resize chaotically, and partial links show bracket soup.
**Why it happens:** Markdown is context-sensitive -- `**` means bold only when the closing `**` arrives. During streaming, the closing delimiter has not arrived yet.
**Consequences:** The UI looks broken and janky during streaming. Users see raw markdown syntax flickering until each element completes.
**Prevention:** Two options:
1. **Use `streamdown`** -- Vercel's drop-in replacement for react-markdown, purpose-built for streaming AI content. It auto-completes unclosed markdown syntax before rendering using the `remend` package. This is the recommended approach.
2. **Add a markdown "healer" function** that detects and closes unclosed markdown elements before passing to react-markdown. This is more fragile and requires maintaining the healer logic.
Both approaches should be combined with a stable container width to prevent layout shifts as table/code content streams in.
**Detection:** Stream a response that includes a code block or table -- watch for visual jank as it renders incrementally.
**Confidence:** HIGH -- documented issue (remarkjs/discussions#1262, remarkjs/discussions#1342, markedjs/marked#3657).

### Pitfall 5: Confirmation Flow Breaks During Streaming

**What goes wrong:** The current ChatPage has a confirmation flow for budget changes (lines 27-47). The `parseConfirmation()` regex looks for a JSON code block with `"type": "confirmation"`. During streaming, this JSON block arrives incrementally. The parser either fails to match the partial content or triggers prematurely on incomplete JSON.
**Why it happens:** The `parseConfirmation()` regex runs against incomplete markdown. A partial JSON block like ````json\n{"type": "conf` matches nothing, but the regex is designed for complete content.
**Consequences:** Confirmation buttons never appear (regex does not match partial content), or they flicker as the JSON block streams in.
**Prevention:** Only run confirmation parsing on the **final complete message**, not on the streaming text. During streaming, display text as-is. When the `done` SSE event arrives, run `parseConfirmation()` on the full accumulated text and update the message in place. This is a clean separation: streaming = display text, done = parse structure.
**Detection:** Test with a budget change request that triggers the confirmation flow while streaming is active.
**Confidence:** HIGH -- directly derived from examining the existing `parseConfirmation()` implementation in ChatPage.tsx.

## Moderate Pitfalls

### Pitfall 6: Not Flushing Response Headers Immediately

**What goes wrong:** Node.js/Express may buffer response writes internally. Calling `res.write()` for each SSE event does not guarantee immediate delivery to the client. Without explicit header flushing, the client's fetch call may not resolve `response.body` until enough data accumulates.
**Why it happens:** Node.js HTTP response streams have internal buffering. Without explicit flushing, small writes may be held.
**Consequences:** Events arrive in unpredictable batches. Text appears to "jump" forward in chunks rather than streaming token-by-token. The client may hang waiting for the response to start.
**Prevention:** Call `res.flushHeaders()` immediately after writing SSE headers:
```typescript
res.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
});
res.flushHeaders();
```
The `X-Accel-Buffering: no` header is forward-compatible if a reverse proxy is ever added. The `no-transform` directive also prevents any future compression middleware from buffering (the project does not currently use compression middleware).
**Detection:** Text arrives in bursts of 5-10 tokens instead of individual tokens.
**Confidence:** HIGH -- standard SSE implementation requirement.

### Pitfall 7: Tool Execution Gaps Appear as Stream Freezes

**What goes wrong:** The Agent SDK yields `content_block_start` with `tool_use` type, then the tool executes (potentially taking seconds for DB queries), then streaming resumes. During tool execution, no text events arrive. Without a tool activity indicator, the user sees the stream "freeze" and thinks it is broken.
**Why it happens:** Tool execution is a server-side gap with no text output. It is easy to forget this is a visible UX gap that needs its own UI treatment.
**Prevention:** Emit dedicated `tool-start` and `tool-end` SSE events when the Agent SDK yields `content_block_start` with type `tool_use` and when the corresponding content block stops. The client should display a tool activity indicator (e.g., "Looking up account balances...") using the tool name from `content_block.name`. The project spec already calls for this (PROJECT.md line 55).
**Detection:** Ask a question that requires tool use (e.g., "What is my checking account balance?"). The stream should show the tool indicator, not just freeze.
**Confidence:** HIGH -- directly informed by Agent SDK streaming docs showing the tool_use content block flow.

### Pitfall 8: State Update Storms from High-Frequency Token Deltas

**What goes wrong:** Each `text_delta` event from the Agent SDK triggers a React state update. With fast models (Haiku), tokens can arrive every 10-30ms. Even with React 18's automatic batching, the rendering cost of re-rendering the entire message list plus markdown parsing on every single token is significant.
**Why it happens:** The streaming reader loop runs asynchronously. Each iteration appends text to state. Markdown parsing and DOM reconciliation on every token adds up.
**Consequences:** UI becomes sluggish. Scroll jank. High CPU usage, especially on mobile devices.
**Prevention:** Use `requestAnimationFrame` batching: accumulate text deltas in a `ref` and flush to state on each animation frame (~16ms intervals). This naturally throttles updates to 60fps:
```typescript
const bufferRef = useRef('');
const rafRef = useRef<number>();

function appendText(chunk: string) {
  bufferRef.current += chunk;
  if (!rafRef.current) {
    rafRef.current = requestAnimationFrame(() => {
      setStreamingText(prev => prev + bufferRef.current);
      bufferRef.current = '';
      rafRef.current = undefined;
    });
  }
}
```
This reduces re-renders by 80-95% while maintaining smooth visual streaming.
**Detection:** Profile the ChatPage with React DevTools during a streaming response. If you see 100+ renders per second, you need batching.
**Confidence:** HIGH -- well-documented React streaming performance pattern.

### Pitfall 9: SSE Event Parsing Edge Cases with Chunk Boundaries

**What goes wrong:** When reading from `ReadableStream` via `TextDecoder`, chunk boundaries can split multi-byte UTF-8 characters or split SSE events mid-line. A naive parser that splits on `\n\n` may produce malformed events when a chunk boundary falls inside an event.
**Why it happens:** Network chunks are arbitrary byte boundaries. A single SSE event like `data: Hello\n\n` may arrive as `data: Hel` in one chunk and `lo\n\n` in the next. Multi-byte characters (e.g., currency symbols) can split mid-byte.
**Consequences:** Garbled text, missed events, or parser errors that silently drop tokens.
**Prevention:** Use `TextDecoder` with `{ stream: true }` to handle multi-byte splitting. Maintain a line buffer across chunks -- only process complete lines (ending in `\n`). Hold incomplete lines until the next chunk arrives:
```typescript
const decoder = new TextDecoder();
let buffer = '';

// In the read loop:
buffer += decoder.decode(chunk, { stream: true });
const lines = buffer.split('\n');
buffer = lines.pop() ?? '';  // Last element may be incomplete
// Process complete lines...
```
**Detection:** Test with non-ASCII content. Also test by asking questions that produce long responses where chunk boundaries are more likely to fall mid-event.
**Confidence:** HIGH -- fundamental streaming text parsing issue.

### Pitfall 10: Error Handling Mid-Stream (HTTP 200 Already Sent)

**What goes wrong:** If the Agent SDK throws an error after streaming has started, the server has already sent SSE headers with status 200. It cannot change the HTTP status code. If the error is silently swallowed, the client sees an incomplete response with no indication of failure.
**Why it happens:** HTTP status codes are set before the response body begins. SSE responses commit to 200 immediately. Errors during streaming (API rate limit, network failure to Anthropic, tool execution crash) cannot change the status code.
**Consequences:** Silent data loss. The user sees a partial response and thinks it is complete.
**Prevention:** Define an `error` SSE event type in the protocol. When the server catches an error during streaming, emit `event: error\ndata: {"message": "..."}\n\n` before closing the stream. The client must handle this event by displaying an error indicator on the partial message. The `done` event should include a status field so the client knows whether the stream completed successfully or was terminated by error.
**Detection:** Simulate an API error mid-stream and verify the client shows an error state, not a truncated response.
**Confidence:** HIGH -- fundamental SSE error handling pattern.

### Pitfall 11: Duplicate Message on Stream Completion

**What goes wrong:** The Agent SDK yields both `stream_event` deltas (text chunks) AND a final `AssistantMessage` with the complete text after all stream events. If the server emits both the streamed deltas and then the complete text from AssistantMessage, the client receives the response content twice.
**Why it happens:** The Agent SDK streaming docs show that `AssistantMessage` follows all `StreamEvent` messages for each turn. This is useful for collect-and-return but dangerous for streaming where the client has already accumulated the text.
**Consequences:** The response appears duplicated in the chat, or the final message replaces the streamed one causing a visual flash.
**Prevention:** On the server, only emit `text-delta` SSE events from `stream_event` messages. When the `AssistantMessage` arrives, do NOT emit its content. When the `ResultMessage` arrives, emit the `done` SSE event. The client has already accumulated the full text from deltas.
**Detection:** Watch for a flash or duplication at the end of each streamed response.
**Confidence:** HIGH -- directly from Agent SDK streaming docs showing that AssistantMessage follows StreamEvent messages.

## Minor Pitfalls

### Pitfall 12: tRPC Route Conflict with Raw Express SSE Endpoint

**What goes wrong:** The new SSE endpoint (`POST /api/chat/stream`) is a raw Express route, not a tRPC procedure. The current server setup (index.ts) mounts tRPC at `/trpc` then has a catch-all `app.get('*')` for SPA routing. If the SSE route is registered after the catch-all or static middleware, it could be shadowed.
**Prevention:** Register the SSE route BEFORE the static file middleware and catch-all route in `index.ts`. The registration order should be: (1) health check, (2) JSON body parser, (3) tRPC middleware, (4) SSE streaming endpoint, (5) static files, (6) SPA catch-all. Since the SSE endpoint is POST and the catch-all is GET, there is no strict conflict, but maintaining correct order prevents future confusion.
**Detection:** If the SSE endpoint returns HTML content or 404, check route registration order.
**Confidence:** HIGH -- directly observed from index.ts route setup.

### Pitfall 13: Auto-Scroll Fighting User During Streaming

**What goes wrong:** The current ChatPage scrolls to bottom on message changes (lines 78-80). During streaming, content updates continuously. If `scrollIntoView` fires on every state update, it fights with the user trying to scroll up to read earlier messages.
**Prevention:** Only auto-scroll if the user is already near the bottom. Track scroll position and set a "stick to bottom" flag. If the user scrolls up more than ~100px from bottom, stop auto-scrolling. Resume when they scroll back down.
**Confidence:** MEDIUM -- UX concern, not a correctness bug. But very noticeable during streaming.

### Pitfall 14: Session ID Timing with Streaming

**What goes wrong:** The Agent SDK's `session_id` arrives in the `system` init message at the very start of the stream. If the server does not extract and emit it as the first SSE event, the client cannot store it. If the user sends a second message before the first stream completes, there is no session ID to send, breaking conversation continuity.
**Prevention:** Emit the session ID as the very first SSE event (`event: session\ndata: {"sessionId": "..."}\n\n`). The client hook must capture and store this before processing any text events. This aligns with the existing pattern in `collectResponse()` (agent-service.ts line 74) and the PROJECT.md spec (line 55: "session" event type).
**Confidence:** HIGH -- directly from the existing session_id extraction pattern.

### Pitfall 15: Keeping Both tRPC and SSE Paths Functional

**What goes wrong:** The PROJECT.md spec requires both tRPC mutation and SSE working during migration (line 60). If the SSE endpoint duplicates logic from the tRPC agent router without sharing the service layer, bug fixes and model validation changes must be applied in two places.
**Prevention:** Extract shared logic (model validation, MCP server creation, system prompt loading) into `agent-service.ts`. The tRPC mutation calls existing `chat()` (collect-and-return). The SSE endpoint calls a new `chatStream()` that yields events. Both share the same service infrastructure. Do NOT copy-paste the agent setup code.
**Confidence:** HIGH -- standard code reuse concern, verified against the existing architecture split between agent-router.ts and agent-service.ts.

### Pitfall 16: Compression Middleware Added Later Breaks SSE

**What goes wrong:** The project does not currently use Express compression middleware (verified by searching the codebase). But if compression is added in a future milestone, it will silently buffer and break SSE streaming.
**Prevention:** Add a defensive comment on the SSE endpoint explaining that it is incompatible with global compression middleware. Set `Cache-Control: no-cache, no-transform` on SSE responses -- the `no-transform` directive causes compression middleware to skip the response automatically.
**Confidence:** HIGH -- documented Express issue (expressjs/compression#17).

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| SSE protocol definition | Over-engineering event types | Start with 6 event types from spec (session, text-delta, tool-start, tool-end, done, error). Do not add more until needed. |
| Server SSE endpoint | Route registration order (Pitfall 12) | Register before static middleware and catch-all in index.ts |
| Server SSE endpoint | Response header flushing (Pitfall 6) | Call `res.flushHeaders()` immediately after writing headers |
| Server stream processing | Timeout architecture mismatch (Pitfall 2) | Replace monolithic timeout with first-token + idle timeouts |
| Server stream processing | Client disconnect leak (Pitfall 3) | Listen for `req.on('close')` and break the Agent SDK iterator |
| Server stream processing | Duplicate message (Pitfall 11) | Only emit text from stream_event, ignore AssistantMessage text |
| Client stream consumer | EventSource API trap (Pitfall 1) | Use fetch + ReadableStream from day one, never EventSource |
| Client stream consumer | SSE parse edge cases (Pitfall 9) | Use TextDecoder with `{ stream: true }`, maintain line buffer |
| Client stream consumer | Mid-stream error handling (Pitfall 10) | Handle error SSE events, show error state on partial message |
| Incremental text rendering | react-markdown partial content (Pitfall 4) | Evaluate streamdown or add markdown healer |
| Incremental text rendering | State update storms (Pitfall 8) | Use requestAnimationFrame batching with ref buffer |
| Incremental text rendering | Confirmation flow breakage (Pitfall 5) | Parse confirmations only on stream completion |
| Incremental text rendering | Auto-scroll fighting (Pitfall 13) | Stick-to-bottom logic with scroll position tracking |
| Tool activity indicators | Silent tool execution gaps (Pitfall 7) | Emit tool-start/tool-end SSE events, show indicator in UI |
| Migration path | Code duplication (Pitfall 15) | Share service layer between tRPC and SSE endpoints |
| Migration path | Session ID timing (Pitfall 14) | Emit session as first SSE event, client captures immediately |

## Sources

- [Claude Agent SDK Streaming Output Docs](https://platform.claude.com/docs/en/agent-sdk/streaming-output) -- HIGH confidence, official docs on `includePartialMessages`, `StreamEvent` types, message flow, and known limitations
- [MDN: Using Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) -- HIGH confidence, EventSource GET-only limitation
- [expressjs/compression#17](https://github.com/expressjs/compression/issues/17) -- HIGH confidence, SSE incompatibility with compression middleware
- [remarkjs Discussion #1262](https://github.com/orgs/remarkjs/discussions/1262) -- HIGH confidence, streaming markdown rendering issues in Safari
- [remarkjs Discussion #1342](https://github.com/orgs/remarkjs/discussions/1342) -- HIGH confidence, react-markdown with streaming AI responses
- [Vercel Streamdown](https://github.com/vercel/streamdown) -- MEDIUM confidence, drop-in react-markdown replacement for streaming
- [SitePoint: Streaming Backends and React Re-render Chaos](https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/) -- MEDIUM confidence, requestAnimationFrame batching pattern
- [Express #2248: Memory Leak with EventSource Stream](https://github.com/expressjs/express/issues/2248) -- HIGH confidence, server-side stream cleanup
- [SSE POST via Fetch ReadableStream](https://medium.com/@david.richards.tech/sse-server-sent-events-using-a-post-request-without-eventsource-1c0bd6f14425) -- MEDIUM confidence, fetch-based SSE client pattern
- Direct code analysis: `packages/server/src/agent/agent-service.ts` -- timeout architecture (lines 43-49), session extraction (line 74), collect-and-return pattern
- Direct code analysis: `packages/client/src/pages/ChatPage.tsx` -- react-markdown usage (line 156), confirmation parsing (lines 27-47), auto-scroll (lines 78-80)
- Direct code analysis: `packages/server/src/index.ts` -- route registration order, no compression middleware

---
*Pitfalls research for: SSE streaming chat (v2.6)*
*Researched: 2026-03-24*
