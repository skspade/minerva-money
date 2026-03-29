---
phase: 54-sse-integration-and-conversation-resume
plan: 03
subsystem: api
tags: [sse, express, trpc, conversation, persistence]

requires:
  - phase: 54-01
    provides: SSEConversationEvent type, updateSdkSessionId function
  - phase: 54-02
    provides: StreamState interface, chatStream with state parameter
provides:
  - Conversation-aware SSE stream handler with message persistence
  - tRPC agent.chat mutation with conversationId support
affects: [55-client-conversation-lifecycle, 56-sidebar-ui]

tech-stack:
  added: []
  patterns:
    - "Handler intercepts done events from generator for pre-persistence"

key-files:
  created: []
  modified:
    - packages/server/src/agent/chat-stream-handler.ts
    - packages/server/src/agent/chat-stream-handler.test.ts
    - packages/server/src/agent/agent-router.ts

key-decisions:
  - "sessionId removed from chatStreamSchema -- server manages session IDs via conversationId"
  - "Conversation event emitted after SSE headers but before generator iteration"
  - "Assistant message persisted only on done event, not on error/abort"
  - "Tool calls stored as array (undefined if empty) with try-catch safety"
  - "Invalid conversationId returns 400 JSON before SSE headers (fail fast)"

patterns-established:
  - "Handler-level event interception for pre-persistence before done emission"
  - "Conversation lifecycle managed in handler, not in generator"

requirements-completed: [API-05, API-07]

duration: 10min
completed: 2026-03-28
---

# Plan 54-03: Chat Stream Handler Conversation Lifecycle + tRPC Update

**Wired conversation creation/loading, message persistence, and SDK session management into the SSE stream handler and tRPC mutation.**

## What was built

1. **Stream handler conversation lifecycle** (`chat-stream-handler.ts`):
   - Accepts optional `conversationId` (UUID) in request body
   - Creates new conversation when absent; loads existing when present
   - Returns 400 before SSE headers on invalid conversation ID
   - Persists user message before stream starts
   - Emits conversation SSE event as first event after headers
   - Intercepts done events: persists assistant message first, then emits done
   - Updates SDK session ID when it changes
   - Does NOT persist assistant on error/abort

2. **tRPC mutation update** (`agent-router.ts`): Added `conversationId: z.string().uuid().optional()` to agent.chat input, passed through to chat() function.

## Self-Check: PASSED

- [x] SSE endpoint accepts optional conversationId
- [x] New conversation created when no conversationId
- [x] Existing conversation loaded, 400 on invalid
- [x] User message persisted before stream
- [x] Assistant message persisted after done, before emission
- [x] Conversation event emitted first
- [x] tRPC mutation accepts conversationId
- [x] All 103 agent tests pass, 543 total tests pass
