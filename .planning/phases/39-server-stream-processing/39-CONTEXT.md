# Phase 39: Server Stream Processing - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

The agent service can stream LLM responses as a sequence of typed events, handling tool calls and errors in real-time. This phase adds a `chatStream()` async generator to `agent-service.ts` that iterates the Agent SDK with `includePartialMessages: true`, yields typed SSE events (from Phase 38's shared types), emits tool-start/tool-end events for tool calls, and terminates cleanly on abort signal or idle timeout. The Express SSE endpoint (Phase 40) and client consumption (Phase 41) are out of scope -- this phase produces only the server-side generator function.

</domain>

<decisions>
## Implementation Decisions

### Generator Function Signature
- New `chatStream()` async generator function in `packages/server/src/agent/agent-service.ts` alongside existing `chat()` function
- Yields `SSEEvent` type from `@minerva/shared` (the discriminated union defined in Phase 38)
- Accepts the same parameters as `chat()`: `db`, `ctx`, `message`, `sessionId?`, `model?`, plus an `AbortSignal` parameter for client disconnect handling
- Returns `AsyncGenerator<SSEEvent>` so the Express handler (Phase 40) can iterate and serialize each event (Claude's Decision: async generator is the natural fit for yielding a sequence of typed events from an async iterable source)

### Agent SDK Streaming Integration (SRVR-03)
- Call `query()` with `includePartialMessages: true` in the options to receive `SDKPartialAssistantMessage` events (type `stream_event`) during generation
- `SDKPartialAssistantMessage.event` contains a `BetaRawMessageStreamEvent` from the Anthropic API -- extract text deltas from `content_block_delta` events with `delta.type === 'text_delta'`
- Extract `session_id` from the `SDKSystemMessage` (subtype `init`) and yield an `SSESessionEvent` immediately
- Extract final result text from `SDKResultSuccess` (subtype `success`, field `result`) and yield an `SSEDoneEvent` at the end
- On `SDKResultError`, yield an `SSEErrorEvent` with the error message and any partial text accumulated so far

### Tool Event Detection (SRVR-04)
- Detect tool starts from `SDKAssistantMessage` events by inspecting `message.content` for content blocks with `type === 'tool_use'` -- yield `SSEToolStartEvent` with the tool name
- Detect tool completions from `SDKUserMessage` events that carry `tool_use_result` -- yield `SSEToolEndEvent` with the corresponding tool name (Claude's Decision: the SDK emits a user message containing the tool result after each tool execution completes)
- Track active tool names in a local `Set<string>` to correctly pair tool-start and tool-end events (Claude's Decision: multiple concurrent tool calls are possible in multi-turn agent interactions; a set prevents duplicate start events)
- Alternatively, detect tool starts from `content_block_start` stream events where `content_block.type === 'tool_use'` when `includePartialMessages` is true (Claude's Decision: the stream_event path may fire earlier than the full SDKAssistantMessage; planner should evaluate which fires first and is more reliable)

### Abort Signal Handling (SRVR-05)
- Pass an `AbortController` to the SDK `query()` options so the SDK can clean up its subprocess when aborted
- Check `signal.aborted` before each yield to break out of the generator loop on client disconnect
- Call `query.close()` when the abort signal fires to forcefully terminate the SDK subprocess and prevent memory leaks (Claude's Decision: the Query interface exposes `close()` specifically for aborting running queries)
- Register an `abort` event listener on the signal that calls `query.close()`, and remove it on generator cleanup (Claude's Decision: event listener ensures cleanup even if the generator is mid-iteration when the signal fires)

### Idle Timeout (SRVR-06)
- Replace the monolithic `Promise.race` timeout from `chat()` with a per-event idle timeout
- Reset a timer after each SDK message is received; if no message arrives within the idle window, terminate the stream
- Use per-model idle timeout values from `TIMEOUT_MS` in `models.ts` (Haiku 15s, Sonnet 30s, Opus 60s) -- these already exist (Claude's Decision: reuse existing timeout config rather than introducing a separate idle timeout map; the existing values are reasonable idle windows)
- On idle timeout, yield an `SSEErrorEvent` with a timeout message and any partial text, then return from the generator (Claude's Decision: the client needs to know the stream ended due to timeout, not a clean completion)

### Text Accumulation
- Maintain a running `fullText` string that accumulates all text deltas yielded during the stream
- Pass `fullText` in the `SSEDoneEvent.text` field when the stream completes successfully
- Pass `fullText` as `partialText` in the `SSEErrorEvent` if the stream terminates early due to error or timeout (Claude's Decision: the client needs partial text for display even on error, and the done event needs the full assembled text for confirmation parsing per PROTO-02)

### Error Handling
- Wrap the entire generator body in try/catch to handle unexpected SDK errors
- On caught error, yield an `SSEErrorEvent` with the error message and accumulated partial text, then return
- Do not re-throw -- the generator should always terminate gracefully so the Express handler can close the SSE connection cleanly (Claude's Decision: an unhandled throw from the generator would crash the Express handler; yielding an error event is more graceful)

### Existing chat() Preservation
- Keep the existing `chat()` function unchanged -- it continues to serve the tRPC mutation endpoint
- The new `chatStream()` function is additive; both paths remain functional per the migration requirement
- Share the same `createMcpServer()`, `getSystemPrompt()`, and model config between both functions

### Claude's Discretion
- Internal variable names for tracking state (accumulated text, active tools, timer references)
- Whether to extract the streaming logic into a separate helper or keep it inline in `chatStream()`
- Exact idle timeout implementation (setTimeout vs Date.now() comparison)
- Whether to filter/ignore irrelevant SDK message types (e.g., `SDKStatusMessage`, `SDKCompactBoundaryMessage`) with an explicit allowlist or just skip unrecognized types
- Whether to add debug logging for SDK message types during development

</decisions>

<specifics>
## Specific Ideas

- The Agent SDK `Query` interface extends `AsyncGenerator<SDKMessage, void>` -- iterate with `for await (const msg of queryStream)` just like the existing `collectResponse()` function does.
- `SDKPartialAssistantMessage` has `type: 'stream_event'` and contains `event: BetaRawMessageStreamEvent`. The `BetaRawMessageStreamEvent` is from `@anthropic-ai/sdk` (the base Anthropic SDK, not the agent SDK). The stream event subtypes include `content_block_start`, `content_block_delta`, `content_block_stop`, `message_start`, `message_delta`, `message_stop`.
- The `Query` object exposes `close()` to forcefully end the query and clean up the subprocess -- this is the correct abort mechanism.
- The `abortController` option on `query()` also provides abort capability: "When aborted, the query will stop and clean up resources."
- `SDKToolProgressMessage` (type `tool_progress`) carries `tool_name` and `tool_use_id` -- this could also be used to detect active tools, but it fires periodically during long-running tools rather than at start/end boundaries.
- The existing `chat()` function uses `options.resume = sessionId` for session continuity -- `chatStream()` should do the same.
- REQUIREMENTS.md explicitly excludes extended thinking with streaming: "Agent SDK does not emit StreamEvents when maxThinkingTokens is set." The current code does not set `maxThinkingTokens`, so this is a non-issue.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/agent/agent-service.ts`: Contains existing `chat()` and `collectResponse()` functions. The new `chatStream()` generator goes in this same file, reusing the same query setup pattern (MCP server, system prompt, options object).
- `packages/shared/src/sse-events.ts`: Phase 38 output -- defines `SSEEvent` discriminated union with all 6 event types (`SSESessionEvent`, `SSETextDeltaEvent`, `SSEToolStartEvent`, `SSEToolEndEvent`, `SSEDoneEvent`, `SSEErrorEvent`).
- `packages/server/src/agent/models.ts`: Exports `TIMEOUT_MS` per-model timeout map and `ModelId` type -- reuse for idle timeout values.
- `packages/server/src/agent/mcp-server.ts`: `createMcpServer()` factory used by both `chat()` and the new `chatStream()`.
- `packages/server/src/agent/system-prompt.ts`: `getSystemPrompt()` used by both paths.

### Established Patterns
- The existing `collectResponse()` iterates `AsyncIterable<SDKMessage>` with `for await` and checks `msg.type` and `msg.subtype` to extract session ID and result text. The streaming generator follows the same iteration pattern but yields events instead of collecting.
- Agent service functions receive `db` and `ctx` parameters and delegate to the MCP server for tool execution.
- Error handling in `chat()` catches and returns a user-friendly error message -- `chatStream()` follows the same pattern but yields an `SSEErrorEvent` instead of returning a string.
- The SDK `query()` call returns a `Query` (extending `AsyncGenerator<SDKMessage, void>`) that can be iterated, interrupted, or closed.

### Integration Points
- Phase 40 (Express SSE Endpoint) will import `chatStream()` from `agent-service.ts` and iterate the generator in the HTTP handler, serializing each yielded `SSEEvent` as an SSE `data:` line.
- The Express handler will create the `AbortController` and wire `req.on('close')` to `controller.abort()` -- Phase 39 just accepts the `AbortSignal`.
- Both `chat()` (tRPC) and `chatStream()` (SSE) coexist during the migration period per REQUIREMENTS.md.

</code_context>

<deferred>
## Deferred Ideas

- Express SSE endpoint wiring (POST /api/chat/stream with SSE headers) -- Phase 40 scope
- Client-side SSE consumption and React hook -- Phase 41 scope
- Tool label mapping (tool name to human-readable string like "Checking your budget...") -- Phase 42 scope
- Stop button / user-initiated cancel -- STOP-01, explicitly deferred from v2.6 per REQUIREMENTS.md
- SSE event ID / resumption -- explicitly out of scope per REQUIREMENTS.md
- Streaming confirmation block parsing -- explicitly out of scope; parse from completed message only

</deferred>

---

*Phase: 39-server-stream-processing*
*Context gathered: 2026-03-24 via auto-context*
