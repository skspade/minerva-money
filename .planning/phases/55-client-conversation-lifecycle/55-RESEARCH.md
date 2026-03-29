# Phase 55: Client Conversation Lifecycle - Research

**Researched:** 2026-03-28
**Status:** Complete

## Executive Summary

Phase 55 adds URL-based conversation navigation to ChatPage. The server-side infrastructure (conversation persistence, SSE conversation events, chat history tRPC endpoints) is fully built from Phase 53-54. This phase is purely client-side: add a parameterized route, wire ChatPage to load conversations by ID, handle the `conversation` SSE event, update URLs after new conversation creation, and handle invalid IDs gracefully.

## Current State Analysis

### What Exists (from Phase 53-54)

1. **Server endpoints ready:**
   - `POST /api/chat/stream` accepts optional `conversationId` in body, emits `{ type: 'conversation', conversationId }` SSE event early in stream
   - `trpc.chatHistory.get({ conversationId })` returns `ConversationWithMessages` (messages array with role, content, tool_calls, created_at)
   - `trpc.chatHistory.list` returns conversation summaries
   - Server returns 400 for invalid conversationId on SSE endpoint, tRPC throws NOT_FOUND

2. **Client partially ready:**
   - `SSEConversationEvent` type defined in `@minerva/shared` but `processStream` switch doesn't handle `case 'conversation'` (falls through silently)
   - `StreamHandlers` interface lacks `onConversation` handler
   - `processStream` sends `{ message, sessionId, model }` — no `conversationId` in body
   - `useStreamingChat.send()` signature is `(message, sessionId?, model?)` — no conversationId param
   - `App.tsx` has only `<Route path="chat" element={<ChatPage />} />` — no parameterized route
   - `ChatPage` manages `sessionId` state locally (should be replaced by `conversationId`)

3. **react-router v7.13.1 available:**
   - `useParams()`, `useNavigate()` already importable from `react-router`
   - `BrowserRouter` + `Routes` + `Route` pattern in App.tsx
   - No existing parameterized routes in the app (this will be the first)

### Key Data Shapes

**ConversationWithMessages (from chatHistory.get):**
```typescript
{
  id: string;
  title: string;
  model: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
  messages: Array<{
    id: number;
    conversation_id: string;
    role: string;       // 'user' | 'assistant'
    content: string;
    tool_calls: unknown | null;
    created_at: string;
  }>;
}
```

**ChatPage's internal ChatMessage:**
```typescript
{
  role: 'user' | 'assistant' | 'error';
  content: string;
  confirmation: Confirmation | null;
}
```

Mapping required: server `ChatMessage` -> client `ChatMessage` with `parseConfirmation()` for assistant messages.

## Implementation Analysis

### Files to Modify (4 files)

1. **`packages/client/src/App.tsx`** — Add parameterized route
2. **`packages/client/src/pages/ChatPage.tsx`** — Core conversation lifecycle logic
3. **`packages/client/src/hooks/useStreamingChat.ts`** — Add conversationId support to stream + hook
4. **`packages/client/src/hooks/useStreamingChat.test.ts`** — Update tests for new interface

### No Server Changes Needed

All server-side work was completed in Phase 53-54. The SSE endpoint already accepts `conversationId` and emits conversation events. The tRPC chatHistory router already has get/list endpoints.

### Complexity Assessment

**Low complexity.** All changes are client-side React + react-router. The hardest part is managing state transitions when switching conversations (clearing streaming state, aborting in-progress requests). The CONTEXT.md has detailed decisions for every scenario.

### Risk: Existing Test Breakage

The `useStreamingChat.test.ts` tests call `processStream` with the current `StreamHandlers` interface. Adding `onConversation` to `StreamHandlers` will require updating ALL test handler objects. The test file has ~13 handler objects that need the new field.

### Risk: sessionId Removal

CONTEXT.md says to remove `sessionId` state from ChatPage since the server manages it via conversationId. However, `useStreamingChat` still uses `sessionId` internally in `processStream` for the `onDone` callback fallback. The removal should be limited to ChatPage's state — the hook still needs sessionId for backward compatibility with the SSE protocol (server still emits session events).

**Decision:** Keep `sessionId` in the SSE protocol/hook, remove `sessionId` from ChatPage's local state. ChatPage passes `conversationId` to `send()` instead of `sessionId`.

### Risk: replace vs push Navigation

CONTEXT.md specifies `{ replace: true }` for URL update after new conversation creation. This is correct — pushing would create a back-button entry for the empty `/chat` that preceded the conversation, which would feel broken.

## Test Strategy

**Budget:** Phase has 50 test budget. Project at 543/800 (68%).

Tests should focus on:
1. `processStream` handling `conversation` SSE event type (pure function, easy to test)
2. `processStream` sending `conversationId` in fetch body
3. Existing tests updated for new `StreamHandlers` interface

ChatPage integration testing (route params, navigation) is better covered by manual verification or Playwright E2E (Phase 56+), not unit tests. React component testing with router mocking adds complexity for minimal value in a single-user app.

## RESEARCH COMPLETE
