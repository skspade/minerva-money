# Project Research Summary

**Project:** Minerva Money v2.6 — Streaming Chat (SSE)
**Domain:** SSE streaming integration for LLM chat in Express + React monorepo
**Researched:** 2026-03-24
**Confidence:** HIGH

## Executive Summary

Adding real-time token streaming to the existing Minerva chat feature is a well-bounded problem with a clear implementation path that requires zero new npm dependencies. The Claude Agent SDK already supports streaming via `includePartialMessages: true` on the `query()` call, Express natively supports SSE via `res.write()`, and the browser Fetch API with `ReadableStream` handles the client side. The correct architecture is a standalone `POST /api/chat/stream` Express route that sits alongside the existing tRPC middleware — not a replacement for it.

The recommended approach is a 6-step build sequence: define the shared SSE event type contract first, then add the server-side `chatStream()` async generator, wire it to an Express handler, build the `useStreamingChat` client hook, integrate it into `ChatPage`, and finish with hardening (cancellation, timeouts, fallback). This order ensures each step is independently testable and the existing tRPC mutation path remains functional throughout as a fallback.

The key risks are not architectural — they are operational details that silently produce broken behavior if missed: the existing monolithic timeout will cut off streaming responses mid-sentence, unclosed server-side iterators leak memory on client disconnect, `react-markdown` renders visual artifacts on partial content during streaming, and the confirmation parsing flow will never fire unless explicitly deferred to stream completion. All five critical pitfalls have clear prevention strategies documented in the research.

## Key Findings

### Recommended Stack

No new dependencies are needed. The entire implementation uses existing tooling: Express 4.x `res.write()` for SSE headers and event emission, the Agent SDK's `includePartialMessages: true` option for token-by-token stream events, `fetch()` + `ReadableStream` on the client instead of the GET-only `EventSource` API, and existing `react-markdown` (with the option to swap for `streamdown` if partial-markdown rendering artifacts become unacceptable).

Full details: `.planning/research/STACK.md`

**Core technologies:**
- `Express res.write()` (existing, 4.21.x): SSE event emission — native capability, no middleware needed
- `@anthropic-ai/claude-agent-sdk` (existing, ^0.2.81): Streaming via `includePartialMessages: true` — one option change enables token-by-token output
- `fetch()` + `ReadableStream` (browser native): SSE client — required because `EventSource` is GET-only and cannot send the message body
- `Zod` (existing): Validate POST body on the stream endpoint — same pattern used everywhere else
- `react-markdown` (existing, 10.1.0): Incremental rendering of growing text — works today, may need `streamdown` swap for cleaner partial-markdown handling

### Expected Features

Full details: `.planning/research/FEATURES.md`

**Must have (table stakes — without these, streaming feels broken):**
- Token-by-token text streaming — the blank-wait UX is what this milestone replaces
- Incremental markdown rendering — text must render as markdown while streaming, not as raw syntax
- Tool activity indicator — users need visual feedback during tool execution gaps (which can be multiple seconds)
- Auto-scroll during streaming — new tokens must stay visible without user action
- Smart scroll pause — stop auto-scrolling when the user deliberately scrolls up to read earlier content
- Error display mid-stream — show partial text plus error indicator when stream fails
- Input disabled during streaming — prevent concurrent messages (already done for tRPC, must carry forward)
- Session continuity — streaming must thread the sessionId through for multi-turn conversation
- Graceful degradation — fall back to existing tRPC mutation if SSE connection cannot establish

**Should have (differentiators, within scope but lower priority):**
- Human-readable tool name display ("Looking up transactions..." not raw tool ID)

**Defer to future:**
- Stop/cancel generation button — AbortController + Agent SDK abort adds complexity, low value for single-user
- Multi-tool collapsible progress log — simple "Using [tool]..." indicator is sufficient for v2.6
- Reconnection with resume (Last-Event-ID) — over-engineered for local network; show error and retry
- Streaming confirmation block parsing — too fragile with partial JSON; parse after `done` event only

### Architecture Approach

The SSE endpoint is a pure Express POST route, not a tRPC procedure. It is registered at `POST /api/chat/stream` between the health check and tRPC middleware in `index.ts`. A new `chatStream()` async generator in `agent-service.ts` runs alongside the existing `chat()` collect-and-return function — both share the same MCP server setup and system prompt loading. The shared package gains a `sse-events.ts` type definition file that both server (emit) and client (parse) import, enforcing the protocol contract at compile time.

Full details: `.planning/research/ARCHITECTURE.md`

**Major components:**
1. `packages/shared/src/sse-events.ts` (NEW) — TypeScript union type for the 6-event SSE protocol (session, text-delta, tool-start, tool-end, done, error); zero dependencies; everything else imports from here
2. `packages/server/src/agent/agent-service.ts` (MODIFIED) — adds `chatStream()` async generator alongside existing `chat()`; passes `includePartialMessages: true` to SDK, maps SDK stream events to typed `SSEEvent` objects
3. `packages/server/src/agent/stream-handler.ts` (NEW) — Express handler: Zod validation, SSE headers + `res.flushHeaders()`, iterates `chatStream()`, writes events, handles client disconnect via `req.on('close')`
4. `packages/server/src/index.ts` (MODIFIED) — mounts `POST /api/chat/stream` before tRPC middleware
5. `packages/client/src/hooks/useStreamingChat.ts` (NEW) — custom React hook: `fetch` POST, `ReadableStream` consumer, line buffer with `TextDecoder({ stream: true })`, `requestAnimationFrame` batching for state updates, tool activity state
6. `packages/client/src/pages/ChatPage.tsx` (MODIFIED) — replaces `chatMutation` with `useStreamingChat`; adds tool indicator UI; defers `parseConfirmation()` to `done` event

### Critical Pitfalls

Full details: `.planning/research/PITFALLS.md`

1. **EventSource API trap** — EventSource is GET-only; cannot send message body. Use `fetch()` + `ReadableStream` from day one. Never EventSource.
2. **Monolithic timeout cuts off streaming** — existing `Promise.race()` with 15/30/60s timeouts fires mid-stream on longer responses. Replace with first-token timeout + per-event idle timeout that resets on each received event.
3. **Memory leak on client disconnect** — Express does not abort async iterators when client disconnects. Add `req.on('close', () => { aborted = true; })` and check `aborted` in the `for await` loop.
4. **react-markdown partial rendering artifacts** — unclosed `**bold**`, raw backticks, chaotic table resizing during streaming. Evaluate `streamdown` (Vercel's drop-in) or add a markdown healer; combine with fixed container width to prevent layout shifts.
5. **Confirmation flow never fires** — `parseConfirmation()` runs on the full `onSuccess` response today. During streaming it must be deferred to run only when the `done` SSE event arrives with the complete text.

## Implications for Roadmap

Based on combined research, the natural build sequence groups into 6 phases that follow a strict dependency order. Each phase is fully testable before the next begins.

### Phase 1: SSE Event Protocol (Shared Types)

**Rationale:** Zero dependencies — everything else imports from here. Defining the contract first prevents interface drift between server and client.
**Delivers:** `packages/shared/src/sse-events.ts` with the 6-event union type; re-exported from `packages/shared/src/index.ts`. TypeScript build passes with type-only validation.
**Addresses:** Session continuity (session event type), tool visibility (tool-start/tool-end types), error handling (error event type)
**Avoids:** Protocol drift between server emitter and client parser (Pitfall 9 — chunk boundary parsing is simpler when the event shape is locked first)

### Phase 2: Server Stream Generator

**Rationale:** Core streaming logic; independent of HTTP concerns. Can be unit tested by mocking the Agent SDK `query()` and asserting yielded events match expected sequence.
**Delivers:** `chatStream()` async generator in `agent-service.ts`; includes `includePartialMessages: true`, maps SDK events to typed SSE events, handles session init, text deltas, tool start/end, and done/error
**Uses:** Agent SDK `includePartialMessages`, SSE event types from Phase 1
**Avoids:** Duplicate message (Pitfall 11 — ignore `AssistantMessage` text; use only `stream_event` deltas), timeout mismatch (Pitfall 2 — monolithic timeout does not apply to the generator itself)

### Phase 3: Express SSE Endpoint

**Rationale:** Wires the generator to HTTP. Testable with `curl` before any client changes exist.
**Delivers:** `stream-handler.ts` Express handler + route mount in `index.ts`. Returns `text/event-stream` with correct headers; handles client disconnect; applies stall-based timeout replacing monolithic timeout.
**Implements:** Stream handler component, Express app modification
**Avoids:** Response header flushing (Pitfall 6 — call `res.flushHeaders()` immediately), memory leak (Pitfall 3 — `req.on('close')`), route ordering (Pitfall 12 — mount before static middleware), compression future-proofing (Pitfall 16 — `no-transform` in Cache-Control)

### Phase 4: Client Stream Hook

**Rationale:** Client-side SSE consumer built against the working server endpoint from Phase 3. Isolated from UI concerns; testable independently.
**Delivers:** `useStreamingChat` hook managing streaming state (streamingText, activeTools, isStreaming, sessionId), fetch-based SSE consumer with proper line buffering, `requestAnimationFrame` batching for state updates
**Avoids:** EventSource trap (Pitfall 1 — fetch + ReadableStream only), chunk boundary issues (Pitfall 9 — `TextDecoder({ stream: true })` + line buffer), state update storms (Pitfall 8 — RAF batching reduces re-renders 80-95%), mid-stream error handling (Pitfall 10 — handle error SSE event type)

### Phase 5: ChatPage Integration

**Rationale:** UI rendering layer; depends on the working hook from Phase 4. All streaming behavior is visible and testable end-to-end.
**Delivers:** `ChatPage.tsx` updated to use `useStreamingChat`; streaming message bubble that grows token by token; tool activity indicator with human-readable names; smart auto-scroll (stick-to-bottom); `parseConfirmation()` deferred to `done` event; graceful fallback to tRPC mutation on SSE failure
**Addresses:** All table-stakes features (token streaming, markdown rendering, tool indicator, auto-scroll, smart scroll pause, session continuity, input disabled, graceful degradation)
**Avoids:** react-markdown artifacts (Pitfall 4 — evaluate streamdown), confirmation flow breakage (Pitfall 5 — parse only on done), auto-scroll fighting (Pitfall 13 — stick-to-bottom logic), session ID timing (Pitfall 14 — capture session from first SSE event), code duplication (Pitfall 15 — share service layer)

### Phase 6: Hardening

**Rationale:** Error handling and edge cases are only meaningful after the happy path works end-to-end. This phase addresses everything that does not block the primary user flow.
**Delivers:** AbortController for component unmount cleanup, stall timeout tuning across models, network failure testing, non-ASCII content verification, performance profiling confirmation of RAF batching effectiveness, streamdown evaluation if markdown artifacts observed in Phase 5

### Phase Ordering Rationale

- Phases 1-3 are server-only and independently testable with curl; no client changes required
- Phases 4-5 build on a working server endpoint; Phase 4 before Phase 5 because ChatPage depends on the hook
- Phase 6 is hardening; only meaningful after end-to-end happy path is confirmed
- The shared SSE type contract (Phase 1) must precede all other phases because both server and client import from it
- The existing tRPC `agent.chat` mutation is preserved throughout all phases as a fallback; it is never touched until Phase 5 adds the SSE-first path alongside it

### Research Flags

Phases with standard, well-documented patterns (no additional research needed):
- **Phase 1:** Pure TypeScript type definition. Standard discriminated union pattern.
- **Phase 2:** Agent SDK streaming is fully documented with TypeScript examples.
- **Phase 3:** SSE over Express is a solved problem. Pattern verified against MDN, official Express docs.
- **Phase 4:** fetch + ReadableStream SSE client is industry-standard (used by OpenAI, Anthropic APIs). Pattern verified.
- **Phase 5:** React state management for streaming is well-documented. `requestAnimationFrame` batching is established.

Phases that may need targeted investigation during implementation:
- **Phase 5 (streamdown evaluation):** `streamdown` is a relatively new Vercel package (MEDIUM confidence on its drop-in compatibility with existing `remarkGfm` plugins). Test early in Phase 5 before committing to it.
- **Phase 6 (AbortController + Agent SDK cleanup):** Whether the Agent SDK async iterator terminates cleanly on `AbortController.abort()` needs runtime verification — not confirmed in docs (MEDIUM confidence on cleanup behavior).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies confirmed; all tooling verified against official docs and current codebase |
| Features | HIGH | Feature set derived from official Agent SDK streaming docs + direct ChatPage.tsx code inspection |
| Architecture | HIGH | Pattern verified against MDN, official tRPC v11 docs, Express behavior, and existing codebase inspection |
| Pitfalls | HIGH | 12 of 16 pitfalls are HIGH confidence; derived from official docs and direct code analysis |

**Overall confidence:** HIGH

### Gaps to Address

- **streamdown compatibility:** The `streamdown` package is recommended as a drop-in for `react-markdown` to handle partial-markdown rendering. Its compatibility with the existing `remarkGfm` plugin configuration needs a quick test in Phase 5. If it does not integrate cleanly, fall back to a markdown healer function. Low risk — the fallback is clear.
- **Agent SDK iterator cleanup on abort:** Documentation does not explicitly state what happens to the `for await` loop in `chatStream()` when `AbortController.abort()` fires on the fetch side. The server-side `req.on('close')` pattern is the reliable path; treat AbortController as client-side cleanup only. Verify in Phase 6.
- **Stall timeout values:** The first-token and idle timeout values (suggested: 15s first-token, 10s idle) are reasonable starting points but may need tuning based on actual tool execution latency (especially complex multi-tool queries with Opus). Treat Phase 6 as the calibration point.

## Sources

### Primary (HIGH confidence)
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) — `includePartialMessages`, `SDKPartialAssistantMessage` type, `BetaRawMessageStreamEvent` types
- [Claude Agent SDK Streaming Output](https://platform.claude.com/docs/en/agent-sdk/streaming-output) — `stream_event` type, `content_block_delta`/`text_delta` patterns, extended thinking limitation, `AssistantMessage` follows `StreamEvent` sequence
- [Anthropic Messages Streaming API](https://docs.anthropic.com/en/api/messages-streaming) — `content_block_delta`, `text_delta`, `message_stop` event types
- [MDN Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) — SSE wire format, EventSource GET-only limitation
- [MDN ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) — `pipeThrough(TextDecoderStream)` + `getReader()` pattern
- [tRPC v11 Subscriptions docs](https://trpc.io/docs/server/subscriptions) — subscriptions are GET-based SSE, confirmed incompatibility with POST body
- [Express #2248](https://github.com/expressjs/express/issues/2248) — server-side stream cleanup on disconnect
- [expressjs/compression#17](https://github.com/expressjs/compression/issues/17) — SSE incompatibility with compression middleware
- [remarkjs Discussion #1262](https://github.com/orgs/remarkjs/discussions/1262) and [#1342](https://github.com/orgs/remarkjs/discussions/1342) — react-markdown streaming artifacts
- Direct code inspection: `agent-service.ts`, `agent-router.ts`, `models.ts`, `mcp-server.ts`, `index.ts`, `ChatPage.tsx`, `packages/client/src/trpc.ts`

### Secondary (MEDIUM confidence)
- [Express SSE patterns](https://masteringjs.io/tutorials/express/server-sent-events) — Express 4 native SSE with `res.writeHead()` + `res.write()`
- [Vercel streamdown](https://github.com/vercel/streamdown) — drop-in react-markdown replacement for streaming AI content
- [SitePoint: Streaming Backends and React Re-render Chaos](https://www.sitepoint.com/streaming-backends-react-controlling-re-render-chaos/) — requestAnimationFrame batching pattern
- [SSE POST via Fetch ReadableStream](https://medium.com/@david.richards.tech/sse-server-sent-events-using-a-post-request-without-eventsource-1c0bd6f14425) — POST-based SSE client pattern
- [tRPC Streaming Mutations Issue #4477](https://github.com/trpc/trpc/issues/4477) — streaming mutations discussion

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*
