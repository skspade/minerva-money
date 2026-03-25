# Phase 41: Client Stream Hook - Research

**Researched:** 2026-03-25
**Status:** Complete

## Phase Boundary

Create a `useStreamingChat` React hook that consumes the POST `/api/chat/stream` SSE endpoint via `fetch()` with `ReadableStream`, accumulates text deltas into reactive state, tracks active tool names, fires an onComplete callback, and falls back to tRPC if SSE fails. Pure data layer -- no UI changes.

## Key Findings

### 1. SSE Event Types (from Phase 38)

The `@minerva/shared` package exports `SSEEvent` discriminated union with 6 types:
- `session` — `{ type: 'session', sessionId: string }`
- `text-delta` — `{ type: 'text-delta', text: string }`
- `tool-start` — `{ type: 'tool-start', tool: string }`
- `tool-end` — `{ type: 'tool-end', tool: string }`
- `done` — `{ type: 'done', text: string }`
- `error` — `{ type: 'error', message: string, partialText?: string }`

The shared package's `main` points to `./dist/types.js` and re-exports SSE types from `types.ts`. The client does **not** currently list `@minerva/shared` as a dependency but npm workspaces resolve it. For build safety, should add explicit dependency.

### 2. Server Wire Format (from Phase 40)

The handler writes `data: ${JSON.stringify(event)}\n\n` — no `event:` SSE line. The `type` discriminant is inside the JSON payload. Parser only needs to:
1. Split on `\n\n` boundaries
2. Strip `data: ` prefix from each line
3. JSON.parse the remainder
4. Switch on `.type`

### 3. Vite Proxy Gap

**Critical finding:** The Vite dev server config only proxies `/trpc` to `http://localhost:3001`. The SSE endpoint is at `/api/chat/stream`. The proxy must be extended to also forward `/api` paths:

```typescript
proxy: {
  '/trpc': 'http://localhost:3001',
  '/api': 'http://localhost:3001',
}
```

Without this, dev mode `fetch('/api/chat/stream')` will hit Vite's dev server and return 404.

### 4. Existing ChatPage Pattern

ChatPage currently uses:
- `useMutation(trpc.agent.chat.mutationOptions({...}))` for chat
- `chatMutation.isPending` for loading state
- `chatMutation.mutate({ message, sessionId, model })` as trigger
- `onSuccess` callback sets sessionId, parses confirmation, appends message
- `onError` callback appends error message

The hook's `send()` function should mirror `chatMutation.mutate()` call signature. The `onComplete` callback replaces `onSuccess`. The `isStreaming` boolean replaces `isPending`.

### 5. Existing Client Test Pattern

Client tests:
- Live alongside source files (e.g., `ImportPage.test.ts` next to `ImportPage.tsx`)
- Use `import { describe, it, expect } from 'vitest'`
- Test exported pure functions directly (no React rendering in existing tests)
- The hook test will need to mock `fetch` and test state transitions

### 6. No Hooks Directory Yet

The `packages/client/src/hooks/` directory does not exist. This phase creates it with `useStreamingChat.ts` and `useStreamingChat.test.ts`.

### 7. Client Package Dependencies

Client uses: React 19, TanStack Query 5, tRPC 11, Vite 6. No test utilities like `@testing-library/react-hooks` are installed. Hook testing can either:
- Extract the SSE parsing logic into a pure function and test that directly
- Use `renderHook` from `@testing-library/react` (would need to add dependency)

Given the project convention of testing pure functions directly, extracting SSE parsing is the better approach. The hook itself is thin state wiring.

### 8. TextDecoder Chunk Boundary Handling

`ReadableStream` returns `Uint8Array` chunks that may split UTF-8 characters or SSE event boundaries. The parser needs:
- A `TextDecoder` with `stream: true` option to handle multi-byte character splits
- A string buffer to accumulate partial `data:` lines between chunks

### 9. AbortController Pattern

React cleanup needs `AbortController`:
- Create new controller on each `send()` call
- Abort previous controller before starting new request
- Abort on component unmount via `useEffect` cleanup or `useRef`
- Store controller in `useRef` to avoid stale closures

## Integration Points

| From | To | Via |
|------|----|-----|
| useStreamingChat.ts | POST /api/chat/stream | fetch() with ReadableStream |
| useStreamingChat.ts | @minerva/shared | SSEEvent type import |
| useStreamingChat.ts | trpc.ts | useTRPC() for fallback mutation |
| vite.config.ts | Express server | Proxy /api → localhost:3001 |
| ChatPage.tsx (Phase 42) | useStreamingChat.ts | Hook consumer |

## RESEARCH COMPLETE
