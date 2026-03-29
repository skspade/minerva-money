# Phase 54: SSE Integration and Conversation Resume - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Every chat exchange is persisted to a conversation, and returning to a conversation resumes the SDK session with full context. This phase modifies the SSE streaming endpoint and agent service to accept an optional `conversationId`, create or load conversations, persist user and assistant messages (with tool calls) after each exchange, capture the SDK session ID from the `system/init` event, and emit a new `conversation` SSE event. When resuming, the stored `sdk_session_id` is passed to the SDK's `resume` option; if the session file is missing on disk, the system gracefully falls back to a new session. No UI or sidebar changes -- purely server-side SSE protocol and persistence integration.

</domain>

<decisions>
## Implementation Decisions

### SSE Event Protocol Extension (API-06)
- Add `SSEConversationEvent` to the shared discriminated union in `packages/shared/src/sse-events.ts` with `{ type: 'conversation', conversationId: string }`
- The `conversation` event is emitted early in the stream, after the `session` event but before any `text-delta` events
- The `SSEEvent` union gains `SSEConversationEvent` as a member (7 event types total)

### Request Schema Extension (API-05)
- Add `conversationId: z.string().uuid().optional()` to the `chatStreamSchema` in `chat-stream-handler.ts`
- Add `conversationId` to the `agent.chat` tRPC mutation input in `agent-router.ts` for the tRPC fallback path
- When `conversationId` is absent, the server creates a new conversation; when present, the server loads the existing conversation and resumes its SDK session

### Conversation Creation and Loading
- When no `conversationId` is provided: call `createConversation(db, { model, firstMessage: message })` from chat-history-service to get a new conversation with auto-generated title
- When `conversationId` is provided: call `getConversation(db, conversationId)` to load the conversation and its `sdk_session_id` for resume
- If the provided `conversationId` does not exist in the database, return a 400 error before starting SSE headers (Claude's Decision: fail fast on invalid conversation ID rather than silently creating a new one, which would confuse the client)

### SDK Session Resume (RESUME-01)
- The `chatStream` generator currently accepts `sessionId?: string` -- this parameter is now sourced from the conversation's `sdk_session_id` column rather than the client request
- When resuming: pass the stored `sdk_session_id` as `options.resume` to the SDK `query()` call
- The client no longer sends `sessionId` in the request body; the server looks it up from the `chat_conversations` table via `conversationId` (from ARCHITECTURE.md anti-pattern 2)

### SDK Session ID Capture and Storage
- The `system/init` SDK message yields the `session_id` -- already captured as the `session` SSE event
- After capturing `session_id` from the init event, update the conversation row: `UPDATE chat_conversations SET sdk_session_id = ? WHERE id = ?`
- Add an `updateSdkSessionId(db, conversationId, sdkSessionId)` function to chat-history-service (Claude's Decision: keeps the SQL in the service layer consistent with established pattern of service functions for all DB writes)

### Graceful Fallback on Missing Session File (RESUME-02)
- Wrap the SDK `query()` call with `resume` in a try-catch
- If resume fails (session JSONL file missing from disk), catch the error, start a new SDK session without `resume`, and update the conversation's `sdk_session_id` with the new session ID
- Log a warning when falling back but do not emit an error event to the client (from PITFALLS.md Pitfall 1 recovery strategy)

### Context Window Limit on Fallback (RESUME-03)
- REQUIREMENTS.md specifies "limits injected history to last 20 turns on fallback rebuild"
- On fallback (no resume, new session): prepend a brief context summary to the user's message with the last 20 messages from the conversation's stored history (Claude's Decision: the SDK has no `messages` parameter, so injecting prior context into the prompt string is the only fallback option -- 20 turns keeps it under token limits while providing useful context)
- Format: a short preamble like "Previous conversation context:" followed by alternating user/assistant message excerpts, truncated if needed

### Message Persistence Timing (API-07, from PITFALLS.md Pitfall 3)
- Persist user message BEFORE starting the SDK stream -- it is available at request time and should be in the DB immediately
- Persist assistant message (with accumulated tool calls) AFTER the SDK stream completes successfully but BEFORE emitting the `done` SSE event to the client
- This ordering ensures the client never sees `done` before the messages are queryable via `chat.history.get`
- On stream error or abort, do NOT persist the assistant message -- the conversation stays at its last successful state (Claude's Decision: avoids partial/corrupt assistant messages in the DB; the user message is already persisted and shows the user attempted to send)

### Tool Call Capture for Storage
- Accumulate tool calls during streaming in a `pendingToolCalls` array alongside existing SSE event yielding
- Capture tool name from `content_block_start` events (already yielded as `tool-start`)
- Capture tool result from `user.tool_use_result` events (already yielded as `tool-end`)
- Store as the `toolCalls` parameter when calling `appendMessage()` for the assistant message
- Wrap `JSON.stringify(toolCalls)` in a try-catch; on serialization failure, store `null` rather than failing the entire persistence (from PITFALLS.md Pitfall 5)

### Stream Handler Orchestration
- The `chat-stream-handler.ts` becomes the orchestration point: it validates input, creates/loads conversation, persists user message, iterates the generator, persists assistant message, and controls `done` event timing
- The `chatStream` generator remains a pure event yielder -- it does NOT handle persistence (Claude's Decision: separation of concerns -- the generator yields SDK events, the handler manages conversation lifecycle and persistence)
- The handler intercepts `done` events from the generator: instead of passing them through, it first persists the assistant message, then writes the `done` SSE event to the response

### tRPC Fallback Path (agent.chat mutation)
- Add `conversationId` to the `agent.chat` mutation input (optional) and output
- The `chat()` function in agent-service gains a `conversationId` parameter; persistence logic mirrors the streaming path (create/load conversation, persist messages, return conversationId)
- Return `conversationId` alongside `response` and `sessionId` in the `ChatResult` interface

### Claude's Discretion
- Exact structure of the `pendingToolCalls` array (list of objects vs simpler format)
- Whether to extract conversation lifecycle (create/load/persist) into a shared helper used by both streaming and tRPC paths
- Variable naming for accumulated state within the stream handler
- Whether `updateSdkSessionId` uses a prepared statement cached in module scope or inline `db.prepare()`
- Exact format of the fallback context summary prepended to the user message on session file loss

</decisions>

<specifics>
## Specific Ideas

- The `chatStream` generator signature changes from `(db, ctx, message, signal, sessionId?, model?)` to `(db, ctx, message, signal, sessionId?, model?)` -- the sessionId parameter remains but is now sourced server-side from the conversation, not from the client request
- The `chat-stream-handler.ts` currently passes `sessionId` directly from the request body to `chatStream()`; after this phase, it passes the `sdk_session_id` looked up from the conversation row
- The `sessionId` field can be removed from the `chatStreamSchema` since the server now manages session IDs internally via `conversationId` (Claude's Decision: removing unused fields keeps the API contract clean and prevents confusion)
- REQUIREMENTS.md out-of-scope explicitly lists "Message editing / regeneration" and "Branching / forking" -- this phase only appends messages, never modifies existing ones
- The `conversation` SSE event must be emitted before any `text-delta` events so the client can store the `conversationId` before the first token arrives; this enables the client to associate the streaming response with the correct conversation

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/chat-history/chat-history-service.ts`: Provides `createConversation()`, `appendMessage()`, `getConversation()` -- all needed by this phase. Missing only `updateSdkSessionId()` which must be added.
- `packages/server/src/agent/agent-service.ts`: The `chatStream()` generator (lines 94-234) is the primary modification target. Already captures `session_id` from init event (line 154) and accumulates `fullText` (line 167).
- `packages/server/src/agent/chat-stream-handler.ts`: The Express handler (lines 20-63) currently passes request body fields directly to `chatStream()`. Becomes the orchestration point for conversation lifecycle.
- `packages/shared/src/sse-events.ts`: Discriminated union with 6 event types. Gains `SSEConversationEvent` as the 7th type.
- `packages/server/src/agent/agent-router.ts`: The `agent.chat` tRPC mutation (lines 12-27) needs `conversationId` added to input/output.

### Established Patterns
- All SSE events use the discriminated union pattern on `type` field with `readonly` properties (sse-events.ts)
- Service functions take `db: Database.Database` as first argument and handle all SQL (chat-history-service.ts, category-service.ts)
- The stream handler validates with Zod BEFORE setting SSE headers, returning 400 JSON for validation errors (chat-stream-handler.ts lines 23-37)
- The `chatStream` generator catches all errors internally and yields `error` events rather than throwing (agent-service.ts lines 222-229)
- The `for await...of` loop in the handler passes events through directly as `data: JSON\n\n` SSE format (chat-stream-handler.ts lines 52-54)

### Integration Points
- `packages/server/src/agent/chat-stream-handler.ts` line 50: Where `chatStream()` is called -- gains conversation create/load logic before this call, and message persistence after the loop
- `packages/server/src/agent/agent-service.ts` line 154: Where `session_id` is captured from SDK init -- the `conversation` SSE event is yielded right after this
- `packages/server/src/agent/agent-service.ts` line 196: Where `done` event is yielded -- the handler must intercept this to persist the assistant message first
- `packages/server/src/agent/agent-router.ts` line 18: The `chat` mutation handler -- gains `conversationId` parameter and persistence calls
- `packages/server/src/sync/trpc-router.ts`: The `appRouter` -- no changes needed (chatHistory router already registered by Phase 53)

</code_context>

<deferred>
## Deferred Ideas

- Client-side conversation lifecycle (URL routing, conversation loading, state management) -- Phase 55
- Sidebar UI for browsing and managing conversations -- Phase 56
- SDK session file cleanup during retention purge -- Phase 57
- Stop button for streaming (would interact with conversation switch behavior) -- deferred per PROJECT.md (STOP-01)
- Disabling sidebar clicks during active stream to prevent cross-conversation contamination -- Phase 56 concern per PITFALLS.md Pitfall 4
- Tool input capture (accumulating `input_json_delta` events for full tool input storage) -- optional enhancement, tool name + output sufficient for display per ARCHITECTURE.md
- Stale confirmation handling when loading historical conversations -- Phase 55/56 UI concern per PITFALLS.md

</deferred>

---

*Phase: 54-sse-integration-and-conversation-resume*
*Context gathered: 2026-03-28 via auto-context*
