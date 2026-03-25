# Requirements: Minerva Money

**Defined:** 2026-03-24
**Core Value:** Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## v2.6 Requirements

Requirements for streaming chat milestone. Each maps to roadmap phases.

### Protocol

- [ ] **PROTO-01**: Server emits typed SSE events (session, text-delta, tool-start, tool-end, done, error) over HTTP with standard SSE wire format
- [ ] **PROTO-02**: The `done` event carries the full assembled response text for confirmation parsing
- [ ] **PROTO-03**: The `error` event includes a user-friendly error message and any partial text received

### Server Streaming

- [ ] **SRVR-01**: Server exposes POST /api/chat/stream endpoint that accepts message, sessionId, and model in JSON body
- [ ] **SRVR-02**: Server validates input with Zod and returns standard error response before SSE headers if validation fails
- [ ] **SRVR-03**: Server iterates the Agent SDK async iterable with `includePartialMessages: true` and emits SSE events for each SDK message
- [ ] **SRVR-04**: Server emits `tool-start` events when the agent begins a tool call and `tool-end` when it completes
- [ ] **SRVR-05**: Server handles client disconnect by cleaning up the Agent SDK iterator to prevent memory leaks
- [ ] **SRVR-06**: Server applies per-model idle timeout (no events for extended period) rather than monolithic request timeout

### Client Streaming

- [ ] **CLNT-01**: Client consumes SSE stream via `fetch()` with `ReadableStream` reader (not EventSource, which only supports GET)
- [ ] **CLNT-02**: Client accumulates text-delta events into a growing string and exposes it as reactive state
- [ ] **CLNT-03**: Client tracks the currently active tool name from tool-start/tool-end events
- [ ] **CLNT-04**: Client calls onComplete callback with full response text and sessionId when done event arrives
- [ ] **CLNT-05**: Client falls back to existing tRPC chat mutation if SSE connection fails to establish

### Chat UI

- [ ] **UI-01**: User sees text tokens appear incrementally in the chat message bubble as they stream in
- [ ] **UI-02**: User sees a tool activity indicator with human-readable label (e.g., "Checking your budget...") when the agent calls a tool
- [ ] **UI-03**: Chat auto-scrolls to show new tokens while streaming, but pauses auto-scroll if user scrolls up to read earlier messages
- [ ] **UI-04**: Bouncing dots loading animation shows only before the first text token arrives (not during the entire response)
- [ ] **UI-05**: Confirmation buttons (Confirm/Cancel) appear after stream completes, parsed from the full response text (same as today)
- [ ] **UI-06**: User input is disabled while a response is streaming (same pattern as today)

## Future Requirements

### Deferred from v2.6

- **STOP-01**: User can click a stop button to cancel a streaming response mid-generation
- **MTOOL-01**: User sees a collapsible log of all tool calls made during a response
- **RESUME-01**: If SSE connection drops mid-stream, client reconnects and resumes from last event

## Out of Scope

| Feature | Reason |
|---------|--------|
| WebSocket transport | SSE is simpler and sufficient for unidirectional streaming |
| EventSource API | Only supports GET; chat needs POST with message body |
| Token buffering/speed normalization | Adds complexity, makes responses feel artificially slow |
| Extended thinking with streaming | Agent SDK does not emit StreamEvents when maxThinkingTokens is set |
| Streaming confirmation block parsing | Too fragile with partial JSON; parse from completed message |
| Persistent stream history/replay | Not needed for single-user app |
| SSE event ID / Last-Event-ID resumption | Over-engineered for local network |
| Streaming tool input JSON to user | Raw JSON is useless to display |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROTO-01 | — | Pending |
| PROTO-02 | — | Pending |
| PROTO-03 | — | Pending |
| SRVR-01 | — | Pending |
| SRVR-02 | — | Pending |
| SRVR-03 | — | Pending |
| SRVR-04 | — | Pending |
| SRVR-05 | — | Pending |
| SRVR-06 | — | Pending |
| CLNT-01 | — | Pending |
| CLNT-02 | — | Pending |
| CLNT-03 | — | Pending |
| CLNT-04 | — | Pending |
| CLNT-05 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| UI-04 | — | Pending |
| UI-05 | — | Pending |
| UI-06 | — | Pending |

**Coverage:**
- v2.6 requirements: 20 total
- Mapped to phases: 0
- Unmapped: 20 ⚠️

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after initial definition*
