# Phase 54: SSE Integration and Conversation Resume - Research

**Researched:** 2026-03-28
**Status:** Complete

## Current Architecture

### SSE Streaming Pipeline
The current streaming pipeline follows this path:
1. `chat-stream-handler.ts` validates request (Zod), sets SSE headers, creates abort controller
2. Calls `chatStream()` generator in `agent-service.ts` with `(db, ctx, message, signal, sessionId?, model?)`
3. Generator yields `SSEEvent` objects (session, text-delta, tool-start, tool-end, done, error)
4. Handler writes each event as `data: JSON\n\n` to response, then calls `res.end()`

### Key Files and Current State

| File | Lines | Purpose | Modification Scope |
|------|-------|---------|--------------------|
| `packages/shared/src/sse-events.ts` | 63 | 6-type SSE discriminated union | Add `SSEConversationEvent` (7th type) |
| `packages/shared/src/types.ts` | 16 | Re-exports SSE types | Add `SSEConversationEvent` to re-exports |
| `packages/server/src/agent/chat-stream-handler.ts` | 63 | Express SSE handler | Major: becomes conversation orchestrator |
| `packages/server/src/agent/agent-service.ts` | 234 | `chatStream()` generator + `chat()` | Medium: yield conversation event, expose session ID capture |
| `packages/server/src/agent/agent-router.ts` | 27 | tRPC `agent.chat` mutation | Add `conversationId` to input/output |
| `packages/server/src/chat-history/chat-history-service.ts` | 144 | CRUD for conversations/messages | Add `updateSdkSessionId()` |

### Chat History Service (Phase 53 output)
Already provides:
- `createConversation(db, { model, firstMessage })` -> returns `{ id, title, model, created_at, updated_at }`
- `appendMessage(db, { conversationId, role, content, toolCalls? })` -> void
- `getConversation(db, conversationId)` -> `{ ..., sdk_session_id, messages[] }` or null
- `listConversations(db)` -> summaries with message count
- `deleteConversation()`, `renameConversation()`, `purgeOldConversations()`

Missing: `updateSdkSessionId(db, conversationId, sdkSessionId)` -- needed to persist SDK session ID after capturing it from the `system/init` event.

### SDK Resume Mechanism
- The `query()` function from `@anthropic-ai/claude-agent-sdk` accepts `options.resume` with a session ID string
- Session ID is captured from `system/init` SDK messages (already done at agent-service.ts line 153-154)
- Resume loads from JSONL session files on disk -- if file is missing, SDK throws an error
- The `chat()` function (tRPC path) already has `if (sessionId) { options.resume = sessionId; }` pattern

### Existing Test Patterns
- `chat-stream-handler.test.ts`: Mocks `agent-service.js` and `models.js`, creates mock `Request`/`Response`, uses `mockGenerator()` to yield SSE events
- `chat-history-service.test.ts`: Uses real SQLite in-memory DB with migration runner
- Tests mock external SDK calls, never hit real API

## Implementation Analysis

### Conversation Lifecycle in Stream Handler
The handler must orchestrate:
1. Validate input (existing)
2. Validate model (existing)
3. **NEW: Create or load conversation**
4. **NEW: Persist user message**
5. Set SSE headers (existing)
6. **NEW: Emit conversation event**
7. Iterate generator (existing, but intercept `done` and capture session events)
8. **NEW: Update SDK session ID from session event**
9. **NEW: Persist assistant message with tool calls**
10. Emit done event (moved from generator pass-through to handler-controlled)
11. End response (existing)

### Session ID Flow Change
**Current:** Client sends `sessionId` in request body -> handler passes to generator -> generator passes to SDK
**New:** Client sends `conversationId` (optional) -> handler loads conversation -> gets `sdk_session_id` from DB -> passes to generator -> generator passes to SDK -> session event captured -> handler updates DB with new session ID

### Done Event Interception
The generator currently yields `{ type: 'done', text }` directly. The handler needs to:
1. Detect `done` events from the generator
2. Before writing to response: persist assistant message
3. Then write the `done` event
This means the handler's `for await` loop changes from simple pass-through to event-type-aware.

### Graceful Fallback Strategy (RESUME-02)
When SDK `query()` with `resume` throws (session file missing):
1. Catch the error
2. Start new SDK `query()` without `resume`
3. On fallback, prepend last 20 messages as context summary to the prompt (RESUME-03)
4. Update conversation's `sdk_session_id` with the new session ID
5. Log warning, don't emit error to client

This retry happens inside `chatStream()` generator, not in the handler, because the generator owns the SDK interaction.

### Tool Call Accumulation
Current generator tracks `fullText` and `activeTools`. Must additionally track:
- `pendingToolCalls: Array<{ tool: string; result?: unknown }>` -- accumulate tool name from `content_block_start`, result from `tool_use_result`
- The generator needs to expose accumulated tool calls to the handler after completion

### Exposing Generator State to Handler
Two options:
1. **Shared state object** passed into generator -- handler reads accumulated data after loop
2. **Special completion event** -- generator yields a metadata event with accumulated data

Option 1 is cleaner: pass a `StreamState` object by reference. Generator populates `state.sessionId`, `state.fullText`, `state.toolCalls`. Handler reads after the `for await` loop.

### Context Summary for Fallback (RESUME-03)
Format: Prepend to user message when falling back to new session:
```
[Previous conversation context - last N messages]
User: ...
Assistant: ...
...
[End of context]

{actual user message}
```
Limit to 20 messages (10 turns). Truncate individual messages if too long.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| SDK resume error detection | Wrap in try-catch, check for file-not-found-like errors, fall back generously |
| Partial assistant message on stream abort | Only persist assistant message on successful completion (done event), not on error/abort |
| Tool call serialization failure | Try-catch `JSON.stringify(toolCalls)`, store null on failure |
| Large context injection on fallback | Hard limit of 20 messages, truncate individual messages at ~500 chars |
| Race between session ID capture and conversation update | Session event comes early in stream, DB update is synchronous (better-sqlite3) |

## Test Strategy

### Unit Tests (chat-stream-handler)
- New conversation creation when no conversationId provided
- Existing conversation loading when conversationId provided
- 400 error for invalid conversationId
- User message persisted before stream
- Assistant message persisted after stream (before done event)
- Conversation event emitted early in stream
- Tool calls captured and stored with assistant message

### Unit Tests (agent-service)
- Graceful fallback when resume fails
- Context injection on fallback with message history
- Session ID captured and exposed via state object

### Unit Tests (chat-history-service)
- `updateSdkSessionId()` function

## RESEARCH COMPLETE
