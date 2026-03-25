# Phase 40: Express SSE Endpoint - Research

**Researched:** 2026-03-25
**Status:** Complete

## Phase Boundary

Add a `POST /api/chat/stream` Express route that validates JSON input, returns JSON errors for invalid input, and streams SSE events from the Phase 39 `chatStream()` async generator. No client changes — testable with curl.

## Existing Code Analysis

### index.ts Route Registration Pattern

The Express app in `packages/server/src/index.ts` registers routes in this order inside the `if (process.env.NODE_ENV !== 'test')` block:

1. `app.use('/trpc', ...)` — tRPC middleware
2. `app.use(express.static(clientDist))` — static files
3. `app.get('*', ...)` — SPA catch-all

The new `POST /api/chat/stream` route must be registered **before** the SPA catch-all to avoid being swallowed. It should go before or after the tRPC middleware — either works since it uses a different path prefix (`/api/` vs `/trpc/`).

The `db`, `rateLimiter`, and `client` objects are created once and shared via closure. The SSE handler needs `db` and the full `ctx` object (which is `{ db, rateLimiter, client }`).

### chatStream() Function Signature

From `packages/server/src/agent/agent-service.ts`:
```typescript
export async function* chatStream(
  db: Database.Database,
  ctx: Context,
  message: string,
  signal: AbortSignal,
  sessionId?: string,
  model: ModelId = DEFAULT_MODEL_ID,
): AsyncGenerator<SSEEvent>
```

### Input Validation Pattern (agent-router.ts)

The existing tRPC agent chat mutation uses:
```typescript
z.object({
  message: z.string(),
  sessionId: z.string().optional(),
  model: z.string().optional(),
})
```

Model validation is done separately with `isValidModelId()` from `models.ts`, which returns a type guard.

### SSE Event Types

From `packages/shared/src/sse-events.ts`, the `SSEEvent` discriminated union has 6 types: `session`, `text-delta`, `tool-start`, `tool-end`, `done`, `error`.

### Testing Pattern

Tests in `packages/server/src/agent/agent-service.test.ts` mock the Agent SDK and MCP server. For the handler, we need a simpler approach: mock `chatStream` itself and test the HTTP handler with mock `req`/`res` objects.

## Implementation Strategy

### Handler Module

Create `packages/server/src/agent/chat-stream-handler.ts` exporting a factory function:

```typescript
export function createChatStreamHandler(db, ctx): express.RequestHandler
```

This follows the closure pattern used in index.ts where `db` and `ctx` are captured when the handler is created.

### Validation Flow

1. Parse body with Zod schema (same shape as agent-router)
2. If Zod fails: `res.status(400).json({ error: formatted message })`
3. If model provided and invalid: `res.status(400).json({ error: 'Invalid model: ...' })`
4. Only after validation passes: set SSE headers and begin streaming

### SSE Wire Format

Standard SSE format: `data: ${JSON.stringify(event)}\n\n` per event. No `event:` field — the discriminant is in the JSON payload's `type` field.

Headers:
- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

Call `res.flushHeaders()` after setting headers to prevent buffering.

### Client Disconnect

Wire `req.on('close', () => controller.abort())` to pass the abort signal to `chatStream()`. The `close` event fires on both normal disconnect and network failures.

### Error After Headers

If `chatStream()` throws (it shouldn't by design), write a final SSE error event and call `res.end()`. Never call `res.status()` after headers are sent.

## Test Strategy

Unit test the handler with mock req/res and a mock chatStream generator:

1. **Missing message** — returns 400 JSON error
2. **Empty message** — returns 400 JSON error
3. **Invalid model** — returns 400 JSON error
4. **Valid input** — sets SSE headers, writes formatted data lines, calls res.end()
5. **Client disconnect** — abort signal fires

Test budget: 0/50 for this phase, 390/800 project-wide. Approximately 5-7 test cases is appropriate.

## Validation Architecture

Not applicable — Nyquist validation is disabled for this project.

---

## RESEARCH COMPLETE

*Phase: 40-express-sse-endpoint*
*Research completed: 2026-03-25*
