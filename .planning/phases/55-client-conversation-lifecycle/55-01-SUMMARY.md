# Plan 55-01 Summary: Streaming chat hook conversationId support

**Status:** Complete
**Completed:** 2026-03-29

## What was built

Added conversationId support to the streaming chat hook infrastructure:

1. **StreamHandlers interface** — Added `onConversation: (conversationId: string) => void` handler (7th handler)
2. **StreamOptions interface** — Added `conversationId?: string` field
3. **processStream()** — Handles `case 'conversation'` SSE event, sends conversationId in fetch body
4. **useStreamingChat hook** — `send()` accepts conversationId instead of sessionId, surfaces `onConversation` callback
5. **Tests** — 3 new tests for conversation event handling and conversationId in fetch body; all 13 existing handler objects updated with onConversation

## Key decisions

- Kept `sessionId` in the SSE protocol (server still emits session events) but replaced it with conversationId in the hook's public API
- Used `@ts-expect-error` for the pre-existing tRPC `.mutate()` type error in the fallback path (was broken before this change)
- tRPC fallback passes conversationId as sessionId parameter (best-effort degraded path)

## Key files

- `packages/client/src/hooks/useStreamingChat.ts` — Modified
- `packages/client/src/hooks/useStreamingChat.test.ts` — Modified (21 tests, all pass)

## Test results

21/21 tests pass including 3 new:
- fires onConversation with conversationId from conversation event
- includes conversationId in fetch body when provided
- omits conversationId from fetch body when not provided
