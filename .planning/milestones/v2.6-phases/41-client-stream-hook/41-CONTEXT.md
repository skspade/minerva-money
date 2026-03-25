# Phase 41: Client Stream Hook - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

React components can consume streaming chat responses through a clean hook interface without knowing SSE details. This phase creates a `useStreamingChat` hook that sends a POST to `/api/chat/stream`, reads the SSE response via `fetch()` with `ReadableStream`, accumulates text deltas into reactive state, tracks active tool names, fires an onComplete callback on the `done` event, and falls back to the existing tRPC chat mutation if the SSE connection fails. The hook is a pure data layer -- no UI changes (Phase 42 scope).

</domain>

<decisions>
## Implementation Decisions

### Hook API Shape
- Custom hook named `useStreamingChat` exported from a new file `packages/client/src/hooks/useStreamingChat.ts` (Claude's Decision: client has no hooks directory yet but separating the hook from ChatPage keeps it testable and follows React best practices for custom hooks)
- Hook accepts a configuration object: `{ onComplete: (text: string, sessionId: string) => void }` (from ROADMAP.md success criteria 4)
- Hook returns: `{ send: (message, sessionId?, model?) => void, streamingText: string, activeTool: string | null, isStreaming: boolean, error: string | null }` (Claude's Decision: exposes minimal reactive state that Phase 42 needs -- text accumulation, tool tracking, streaming status, and error state)
- The `send` function is the imperative trigger; it is not auto-invoked on mount (Claude's Decision: mirrors the existing `chatMutation.mutate()` call pattern in ChatPage for easy swap-in)

### SSE Stream Consumption (CLNT-01)
- Use `fetch()` with `response.body.getReader()` to read the `ReadableStream` as chunks (from REQUIREMENTS.md CLNT-01 -- EventSource only supports GET)
- POST to `/api/chat/stream` with JSON body `{ message, sessionId, model }` matching the server's Zod schema
- Parse SSE `data:` lines from the text stream by splitting on `\n\n` boundaries and extracting JSON after `data: ` prefix (Claude's Decision: the server emits `data: <json>\n\n` format per chat-stream-handler.ts -- simple line parsing is sufficient without an SSE library)
- Use `TextDecoder` to decode `Uint8Array` chunks from the reader (Claude's Decision: ReadableStream returns raw bytes; TextDecoder handles UTF-8 decoding including multi-byte characters that may span chunks)

### Text Accumulation (CLNT-02)
- Maintain a `streamingText` state via `useState` that grows with each `text-delta` event
- Append `event.text` to the accumulated string on each delta (from REQUIREMENTS.md CLNT-02)
- Reset `streamingText` to empty string when `send()` is called to start a new request (Claude's Decision: prevents stale text from previous responses bleeding into new ones)

### Tool Activity Tracking (CLNT-03)
- Track `activeTool: string | null` state that is set on `tool-start` events and cleared on `tool-end` events (from REQUIREMENTS.md CLNT-03)
- Only the most recently started tool name is tracked -- not a stack/set (Claude's Decision: the UI in Phase 42 shows a single activity label, not a list; simple string state is sufficient)

### Completion Handling (CLNT-04)
- On `done` event, call the `onComplete` callback with `event.text` (full response) and the `sessionId` captured from the `session` event (from REQUIREMENTS.md CLNT-04)
- Set `isStreaming` to `false` and clear `activeTool` on `done` event (Claude's Decision: marks the stream as complete so the UI can transition to idle state)

### Fallback to tRPC (CLNT-05)
- If the `fetch()` call throws or returns a non-200/non-streaming response, fall back to the existing tRPC `agent.chat` mutation (from REQUIREMENTS.md CLNT-05)
- Fallback is triggered by: network error, HTTP error status, or missing `text/event-stream` content type in response (Claude's Decision: covers the three failure modes before SSE data starts flowing)
- The hook internally creates and manages the tRPC fallback mutation using `useMutation` from TanStack Query (Claude's Decision: keeps the fallback self-contained within the hook so ChatPage doesn't need dual code paths)
- On fallback, `onComplete` is called with the tRPC response data, maintaining the same callback contract (Claude's Decision: ChatPage sees identical completion behavior regardless of transport)

### SSE Event Parsing
- Import `SSEEvent` type from `@minerva/shared` and use a `switch` on `event.type` for exhaustive handling (Claude's Decision: leverages the discriminated union from Phase 38 for type-safe parsing)
- Handle `session` event by storing the sessionId in a local ref for use in the `done` callback (Claude's Decision: sessionId arrives once at stream start but is needed at stream end -- a ref avoids stale closure issues)
- Handle `error` event by setting error state with `event.message` and stopping the stream (Claude's Decision: surface server-side errors to the UI layer)

### Abort/Cleanup
- Use an `AbortController` to cancel the fetch when the component unmounts or a new `send()` is called (Claude's Decision: prevents memory leaks and stale state updates from abandoned streams)
- Store the controller in a ref and abort it in the hook's cleanup function returned by `useEffect` or in `send()` before starting a new request (Claude's Decision: React refs persist across renders without causing re-renders)

### Testing Approach
- Unit tests in `packages/client/src/hooks/useStreamingChat.test.ts` using vitest (Claude's Decision: matches the existing test file pattern in the client package)
- Mock `fetch` to return a `ReadableStream` that emits SSE-formatted events (Claude's Decision: tests the parsing and state management logic without a real server)
- Test cases: text accumulation, tool start/end tracking, done callback, error handling, fetch failure triggers fallback (Claude's Decision: covers each requirement CLNT-01 through CLNT-05)

### Claude's Discretion
- Internal state variable naming (e.g., `buffer` vs `pending` for partial SSE line accumulation)
- Whether to extract SSE line parsing into a separate utility function or keep it inline
- Exact chunk boundary handling strategy for split `data:` lines
- Whether to use `useReducer` vs multiple `useState` calls for the hook's internal state
- Whether to wrap the hook in `useCallback`/`useMemo` for send function stability

</decisions>

<specifics>
## Specific Ideas

- The server handler (`chat-stream-handler.ts`) emits events as `data: <json>\n\n` -- no `event:` line is used, so parsing only needs to handle the `data:` prefix. The `type` field is inside the JSON payload.
- The existing ChatPage uses `chatMutation.isPending` to disable input and show loading dots -- the hook's `isStreaming` boolean serves the same purpose for the streaming path.
- The existing `parseConfirmation()` function in ChatPage extracts confirmation blocks from the full response text -- this happens after `onComplete` fires with the full text from the `done` event, so the existing flow is preserved.
- The client does not have a `hooks/` directory yet -- this phase creates it with the first hook file.
- No `@minerva/shared` import exists in the client yet (only server imports it for `Cents`). The client `package.json` does not list it as a dependency, but npm workspaces resolve it -- may need to add explicit dependency.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared/src/sse-events.ts`: Defines `SSEEvent` discriminated union with 6 event types -- the hook imports this for type-safe event parsing.
- `packages/client/src/trpc.ts`: Exports `useTRPC()` hook that provides typed tRPC client -- used for the fallback mutation path.
- `packages/client/src/pages/ChatPage.tsx`: Contains the existing `chatMutation` pattern using `useMutation(trpc.agent.chat.mutationOptions(...))` -- the hook's fallback replicates this internally.
- `packages/client/src/pages/ChatPage.tsx` `parseConfirmation()`: Extracts confirmation blocks from completed response text -- not part of this phase but confirms that `onComplete` must provide the full assembled text.

### Established Patterns
- Client tests live alongside source files (e.g., `ImportPage.test.ts` next to `ImportPage.tsx`) -- the hook test follows this pattern in the hooks directory.
- All client code uses ESM with TypeScript strict mode.
- State management uses React `useState`/`useRef` hooks -- no external state library (Redux, Zustand, etc.).
- TanStack Query `useMutation` is the established pattern for imperative async operations with loading/error states.

### Integration Points
- `ChatPage.tsx` will consume `useStreamingChat` in Phase 42, replacing or wrapping the current `chatMutation` for the streaming path while preserving the tRPC fallback.
- The hook POSTs to `/api/chat/stream` which is registered in `packages/server/src/agent/chat-stream-handler.ts` (Phase 40 output).
- The Vite dev server proxy (port 5173 -> 3001) must forward `/api/chat/stream` to the Express server -- the existing Vite config likely already proxies `/api/*` paths.

</code_context>

<deferred>
## Deferred Ideas

- ChatPage UI integration (swapping chatMutation for useStreamingChat, incremental rendering) -- Phase 42 scope
- Tool label mapping (tool name to human-readable string like "Checking your budget...") -- Phase 42 scope
- Stop button / user-initiated cancel via AbortController -- STOP-01, explicitly deferred from v2.6 per REQUIREMENTS.md
- Reconnection on mid-stream disconnect -- RESUME-01, explicitly deferred from v2.6 per REQUIREMENTS.md
- Stream event buffering or speed normalization -- explicitly out of scope per REQUIREMENTS.md

</deferred>

---

*Phase: 41-client-stream-hook*
*Context gathered: 2026-03-25 via auto-context*
