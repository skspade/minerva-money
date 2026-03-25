# Phase 40: Express SSE Endpoint - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

The streaming chat endpoint is reachable over HTTP and can be tested with curl before any client changes. This phase adds a POST /api/chat/stream Express route that validates the JSON body with Zod, returns standard JSON errors for invalid input before SSE headers are sent, and on valid input sets SSE headers and iterates the `chatStream()` async generator from Phase 39 to write properly formatted SSE data lines. No client changes -- the endpoint is testable with curl.

</domain>

<decisions>
## Implementation Decisions

### Endpoint Route and Registration
- New Express route: `POST /api/chat/stream` registered on the `app` in `packages/server/src/index.ts`
- Mount the route inside the `if (process.env.NODE_ENV !== 'test')` block, before the tRPC middleware and SPA catch-all (Claude's Decision: the SSE endpoint is a raw Express route outside tRPC since tRPC does not support SSE streaming; it must be mounted before the catch-all to avoid being swallowed)
- Extract the handler into a separate file `packages/server/src/agent/chat-stream-handler.ts` that exports a request handler function (Claude's Decision: keeps index.ts clean and follows the existing pattern of separating route logic into service/router files)
- The handler receives `db` and `ctx` via closure when registered in index.ts, matching how the tRPC middleware receives its context

### Input Validation (SRVR-02)
- Validate request body with Zod schema: `{ message: z.string().min(1), sessionId: z.string().optional(), model: z.string().optional() }`
- On validation failure, respond with `res.status(400).json({ error: <zod error message> })` before any SSE headers are set
- Validate model ID with `isValidModelId()` from `models.ts`; invalid model returns `res.status(400).json({ error: 'Invalid model: ...' })` matching the tRPC agent router pattern
- All error responses before SSE headers use standard JSON `Content-Type: application/json` (Claude's Decision: returning JSON errors before committing to SSE headers lets clients distinguish validation errors from stream errors without parsing SSE format)

### SSE Response Format (SRVR-01)
- Set response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Disable response buffering with `res.flushHeaders()` after setting headers (Claude's Decision: ensures the SSE headers are sent immediately and Node/Express does not buffer the initial response)
- Each SSE event written as `data: ${JSON.stringify(event)}\n\n` per standard SSE wire format
- Do not use the `event:` field in SSE lines -- the `type` discriminant is inside the JSON data payload, which is sufficient for client parsing (Claude's Decision: the client reads raw lines via fetch/ReadableStream, not EventSource, so the `event:` SSE field adds no value; keeping it simple with data-only lines)

### Stream Iteration
- Create an `AbortController` in the handler; wire `req.on('close', () => controller.abort())` for client disconnect cleanup
- Iterate `chatStream(db, ctx, message, signal, sessionId, model)` with `for await` and write each event to `res`
- After the generator completes, call `res.end()` to close the SSE connection

### Error Handling
- If `chatStream()` throws unexpectedly (it should not -- it yields error events), catch and write a final SSE error event then `res.end()` (Claude's Decision: defense-in-depth; the generator is designed to never throw but the handler should be safe regardless)
- Do not call `res.status()` after SSE headers are sent -- HTTP status is already committed at that point

### Testing Approach
- Unit test the handler with a mock `req`/`res` pair and a mock `chatStream` generator (Claude's Decision: avoids needing the Agent SDK in tests; the handler's job is validation + SSE formatting, not agent logic)
- Test cases: missing message returns 400, invalid model returns 400, valid input writes SSE headers and formatted data lines, client disconnect triggers abort signal
- Integration-testable with `curl -X POST -H 'Content-Type: application/json' -d '{"message":"hello"}' http://localhost:3001/api/chat/stream` (from ROADMAP success criteria)

### Claude's Discretion
- Exact Zod error message formatting (flat vs nested)
- Whether to log request metadata (message length, model) for debugging
- Whether to add a `X-Accel-Buffering: no` header for potential reverse proxy compatibility
- Internal variable naming in the handler function

</decisions>

<specifics>
## Specific Ideas

- The existing tRPC agent chat mutation in `agent-router.ts` uses the same Zod shape (`message: z.string(), sessionId: z.string().optional(), model: z.string().optional()`) -- the SSE endpoint should use the same validation for consistency.
- The `chatStream()` function signature is: `chatStream(db, ctx, message, signal, sessionId?, model?)` -- the handler maps the validated body fields directly.
- Express `res.write()` returns a boolean indicating backpressure; for a single-user app on localhost, backpressure handling is unnecessary.
- The `req.on('close')` event fires both on normal client disconnect and on network failures, covering the abort signal wiring completely.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/agent/agent-service.ts`: Exports `chatStream()` async generator (Phase 39 output) -- the handler iterates this directly.
- `packages/server/src/agent/models.ts`: Exports `isValidModelId()`, `ModelId`, `DEFAULT_MODEL_ID` -- reuse for model validation in the handler.
- `packages/shared/src/sse-events.ts`: Exports `SSEEvent` type (Phase 38 output) -- used to type the generator yield values.
- `packages/server/src/agent/agent-router.ts`: Existing tRPC chat mutation with same input shape -- reference for validation consistency.

### Established Patterns
- Express app in `index.ts` registers routes sequentially: health check, tRPC middleware, static files, SPA catch-all. New SSE route slots in before tRPC or between tRPC and static files.
- The `Context` interface (`{ db, rateLimiter, client }`) is created once in `index.ts` and shared. The SSE handler needs `db` and the full `ctx` for `chatStream()`.
- Agent router validates model with `isValidModelId()` and throws `TRPCError` on invalid -- SSE handler follows same validation but returns JSON error instead.

### Integration Points
- `packages/server/src/index.ts`: New route registration point. The handler is registered with `app.post('/api/chat/stream', handler)` inside the production block.
- Phase 41 (Client Stream Hook) will POST to this endpoint and read the SSE stream via `fetch()` with `ReadableStream`.
- Both `chat()` (tRPC) and `chatStream()` (SSE) coexist during the migration period per REQUIREMENTS.md.

</code_context>

<deferred>
## Deferred Ideas

- Client-side SSE consumption and React hook -- Phase 41 scope
- Tool label mapping (tool name to human-readable string) -- Phase 42 scope
- Stop button / user-initiated cancel -- STOP-01, deferred from v2.6 per REQUIREMENTS.md
- SSE event ID / Last-Event-ID resumption -- explicitly out of scope per REQUIREMENTS.md
- Rate limiting on the SSE endpoint -- unnecessary for single-user app on private network
- Authentication/authorization on the endpoint -- no auth layer per project constraints

</deferred>

---

*Phase: 40-express-sse-endpoint*
*Context gathered: 2026-03-25 via auto-context*
