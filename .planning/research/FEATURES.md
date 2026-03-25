# Feature Landscape: Streaming Chat Responses

**Domain:** AI chat streaming for personal finance assistant
**Researched:** 2026-03-24
**Confidence:** HIGH (verified against Claude Agent SDK official docs and established SSE patterns)

## Table Stakes

Features users expect from a streaming AI chat interface. Missing = the chat feels broken or outdated compared to ChatGPT/Claude.ai.

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| Token-by-token text streaming | ChatGPT normalized this; a 15-60s blank wait feels broken | Med | SSE endpoint, Agent SDK `includePartialMessages: true` |
| Incremental markdown rendering | Text must render as markdown while streaming, not raw text then sudden format | Low | Existing `react-markdown` + accumulating text state |
| Tool activity indicator | Users need to know the agent is working, not stalled, when tools execute silently | Low | `content_block_start` / `content_block_stop` events from SDK |
| Auto-scroll during streaming | New tokens must keep the latest text visible without manual scrolling | Low | Scroll anchor at bottom of message list |
| Smart scroll pause on user scroll-up | If user scrolls up to read earlier messages, stop auto-scrolling until they return to bottom | Med | `isAtBottom` state derived from scroll position |
| Error display mid-stream | If the stream fails partway, show what was received plus an error indicator | Low | SSE `error` event type, client error state |
| Input disabled during streaming | Prevent sending new messages while a response streams | Low | Existing pattern (already done with `chatMutation.isPending`) |
| Session continuity | Streaming must preserve the sessionId flow for multi-turn conversations | Low | Already implemented; pass sessionId through SSE endpoint |
| Graceful degradation to non-streaming | If SSE connection fails to establish, fall back to existing tRPC collect-and-return | Med | Keep existing tRPC mutation alongside new SSE path |

## Differentiators

Features that go beyond baseline. Not required for v2.6 but worth noting.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Human-readable tool name display | Shows "Looking up transactions..." instead of generic spinner -- builds trust | Low | Map MCP tool names to labels (e.g., `get_transactions` -> "Looking up transactions") |
| Multi-tool progress chain | Show sequential tool calls as compact activity log ("Checked balances -> Found transactions -> Calculated") | Med | Track array of tool events, render as collapsible list below message |
| Stop/cancel generation button | Let user abort a long streaming response mid-generation | High | Requires AbortController integration with Agent SDK, partial state handling |
| Streaming confirmation blocks | Parse confirmation JSON from partial stream and show buttons before stream completes | High | Fragmented JSON during streaming makes this very fragile; defer to post-stream |
| Typing speed normalization | Buffer tokens and release at consistent visual speed to avoid jerky fast/slow bursts | Med | requestAnimationFrame batching; not necessary in practice |
| Reconnection with resume | If SSE drops mid-stream, reconnect and resume from last event | High | Requires server-side event buffering, Last-Event-ID tracking |

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| WebSocket transport | Overkill for unidirectional server-to-client streaming; SSE is simpler, works over HTTP, auto-reconnects natively | Use SSE (`text/event-stream`) -- industry standard for LLM streaming |
| `EventSource` API on client | Cannot send POST body (need message + sessionId + model); requires GET with query params which leaks data in URLs and server logs | Use `fetch()` with `ReadableStream` for POST-based SSE |
| Client-side token buffering/debouncing | Adds complexity, makes responses feel artificially slow, solves a non-problem | Render tokens as they arrive; browsers handle rapid DOM updates fine |
| Extended thinking with streaming | Claude Agent SDK explicitly does NOT emit StreamEvents when `maxThinkingTokens` is set -- incompatible | Do not enable extended thinking if streaming is on |
| Structured output streaming | JSON result only appears in final `ResultMessage`, not as deltas per SDK docs | Parse confirmation blocks from completed messages only (existing pattern) |
| Persistent stream history/replay | Not needed for single-user app; session continuity handles multi-turn | Keep in-memory message state as-is |
| Server-Sent Events `id` field / `Last-Event-ID` resumption | Over-engineered for local network single-user; connection drops are rare | On failure, show error with partial text and let user retry |
| Streaming the tool input JSON to the user | Agent SDK streams `input_json_delta` for tool arguments; showing raw JSON to users is useless | Only show tool name and running/done status |

## Feature Dependencies

```
SSE event protocol definition (types/contract)
  -> Server SSE endpoint (POST /api/chat/stream)
    -> Server stream processing (Agent SDK includePartialMessages: true)
      -> Client stream consumer hook (useStreamingChat)
        -> Incremental text rendering in ChatPage
        -> Tool activity indicators in ChatPage
        -> Smart auto-scroll behavior

Existing tRPC mutation (keep unchanged as fallback)
  -> Graceful degradation (try SSE first, fall back to tRPC on failure)

Post-stream confirmation parsing (existing parseConfirmation)
  -> Triggered by SSE 'done' event carrying full response text
```

### Dependency Notes

- **SSE protocol must be defined first** because both server and client depend on the event type contract
- **Server endpoint before client hook** because the client needs a real endpoint to consume
- **Text rendering before tool indicators** because tool indicators overlay the streaming flow
- **Auto-scroll is independent** of streaming implementation but must be wired after text rendering works
- **Fallback path requires zero new work** -- existing tRPC mutation already works; just need a toggle in `useStreamingChat` to detect SSE failure and fall through
- **Confirmation flow is unchanged** -- `parseConfirmation()` runs on the completed response text delivered by the `done` SSE event, same as today's `onSuccess` callback

## MVP Recommendation

### Must Have (v2.6 scope)

1. **SSE event protocol** -- typed event contract shared between server and client:

   | Event | Data | When |
   |-------|------|------|
   | `session` | `{ sessionId: string }` | SDK system/init message |
   | `text-delta` | `{ text: string }` | `content_block_delta` with `text_delta` |
   | `tool-start` | `{ tool: string }` | `content_block_start` with `tool_use` type |
   | `tool-end` | `{ tool: string }` | `content_block_stop` after tool block |
   | `done` | `{ response: string }` | SDK `result` message; full text for confirmation parsing |
   | `error` | `{ message: string }` | Any error; includes partial text if available |

2. **Server SSE endpoint** -- `POST /api/chat/stream` on Express (not tRPC; tRPC does not natively support SSE). Validates input with Zod, sets SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`), iterates Agent SDK async iterable with `includePartialMessages: true`, maps SDK events to SSE events.

3. **Client stream hook** -- `useStreamingChat` using `fetch()` + `ReadableStream` + `TextDecoderStream` to consume SSE from POST endpoint. Manages streaming state (idle/streaming/error), accumulates text deltas, tracks active tools.

4. **Incremental text rendering** -- Accumulate `text-delta` events into growing string, feed to existing `react-markdown` + `remarkGfm`. Message bubble appears immediately on first token.

5. **Tool activity indicator** -- On `tool-start`: show compact indicator below streaming text (e.g., spinner + "Looking up transactions..."). On `tool-end`: mark as complete. Simple implementation -- not a collapsible log.

6. **Smart auto-scroll** -- Track `isAtBottom` via scroll event listener. Auto-scroll on new tokens only when user is at bottom. When user scrolls up, pause auto-scroll. Optionally show "scroll to bottom" button.

7. **Graceful degradation** -- Primary path: SSE streaming. If `fetch` fails to establish SSE connection (network error, non-200 response), fall back to existing `agent.chat` tRPC mutation transparently.

### Defer to Future

- **Stop/cancel button**: AbortController + Agent SDK abort adds complexity; low value for single-user with fast local network
- **Multi-tool collapsible log**: Simple "Using [tool]..." indicator is sufficient for v2.6
- **Reconnection with resume**: Over-engineered for local network; retry on failure is fine
- **Streaming confirmation parsing**: Too fragile with partial JSON; parse from completed message

## Existing Assets to Leverage

| Existing | Reuse Strategy |
|----------|---------------|
| `ChatPage.tsx` message rendering | Add streaming message type (`role: 'streaming'`) alongside existing types |
| `react-markdown` + `remarkGfm` | Same renderer, fed incrementally growing text string |
| `parseConfirmation()` | Run on completed message text from `done` event |
| `chatMutation` (tRPC) | Keep as fallback; `useStreamingChat` is primary path |
| `messagesEndRef` scroll anchor | Enhance with `isAtBottom` detection for smart scroll |
| Agent SDK `query()` async iterable | Already used in `collectResponse()`; add `includePartialMessages: true` |
| `models.ts` / model selector | Pass selected model through SSE endpoint identically |
| Confirmation flow (Confirm/Cancel) | Unchanged; triggered after stream `done` event |
| Express `app` instance | Add SSE route directly; already serves health check and static files |

## Agent SDK Streaming Details (from official docs)

The Claude Agent SDK's `query()` returns an `AsyncIterable<SDKMessage>`. With `includePartialMessages: true`, it yields `stream_event` messages containing raw Claude API streaming events. The message flow is:

```
StreamEvent (message_start)
StreamEvent (content_block_start) -- text block
StreamEvent (content_block_delta) -- text chunks (accumulate these)
StreamEvent (content_block_stop)
StreamEvent (content_block_start) -- tool_use block (tool name here)
StreamEvent (content_block_delta) -- tool input JSON chunks (ignore for UI)
StreamEvent (content_block_stop)  -- tool execution begins
StreamEvent (message_delta)
StreamEvent (message_stop)
AssistantMessage -- complete message with all content
... tool executes ...
... more streaming events for next turn ...
ResultMessage -- final result (extract full text here)
```

TypeScript type for stream events:
```typescript
type SDKPartialAssistantMessage = {
  type: "stream_event";
  event: RawMessageStreamEvent; // from @anthropic-ai/sdk
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
};
```

Key event types to handle:
- `event.type === "content_block_start"` + `event.content_block.type === "tool_use"` -> tool-start
- `event.type === "content_block_delta"` + `event.delta.type === "text_delta"` -> text-delta
- `event.type === "content_block_stop"` (when in tool) -> tool-end
- `message.type === "system"` with `subtype === "init"` -> session ID
- `message.type === "result"` with `subtype === "success"` -> done with full text

**Known limitation**: Streaming is incompatible with `maxThinkingTokens`. Do not enable extended thinking.

## Sources

- [Claude Agent SDK - Stream responses in real-time](https://platform.claude.com/docs/en/agent-sdk/streaming-output) -- HIGH confidence, official docs, verified TypeScript types and event flow
- [Claude Agent SDK - TypeScript reference](https://platform.claude.com/docs/en/agent-sdk/typescript) -- HIGH confidence, official docs
- [MDN - Using Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) -- HIGH confidence, official docs
- [Streaming AI with SSE - Technical Case Study](https://akanuragkumar.medium.com/streaming-ai-agents-responses-with-server-sent-events-sse-a-technical-case-study-f3ac855d0755) -- MEDIUM confidence
- [SSE Backbone of LLMs 2025/2026](https://procedure.tech/blogs/the-streaming-backbone-of-llms-why-server-sent-events-(sse)-still-wins-in-2025) -- MEDIUM confidence
- [AI UI Patterns - patterns.dev](https://www.patterns.dev/react/ai-ui-patterns/) -- MEDIUM confidence
- [Intuitive Scrolling for Chatbot Streaming](https://tuffstuff9.hashnode.dev/intuitive-scrolling-for-chatbot-message-streaming) -- MEDIUM confidence
- [SSE Deep Dive - Agent Factory](https://agentfactory.panaversity.org/docs/TypeScript-Language-Realtime-Interaction/async-patterns-streaming/server-sent-events-deep-dive) -- MEDIUM confidence
