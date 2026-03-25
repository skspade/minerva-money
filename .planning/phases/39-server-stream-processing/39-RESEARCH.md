# Phase 39: Server Stream Processing - Research

**Researched:** 2026-03-24
**Domain:** Agent SDK async generator streaming
**Confidence:** HIGH

## Summary

Phase 39 adds a `chatStream()` async generator to `agent-service.ts` that iterates the Claude Agent SDK's `Query` (an `AsyncGenerator<SDKMessage, void>`) with `includePartialMessages: true`, yielding typed `SSEEvent` objects from `@minerva/shared`. The SDK is already installed (v0.2.81) and the existing `collectResponse()` demonstrates the exact iteration pattern needed -- the new function yields events instead of collecting.

The key implementation concerns are: (1) extracting text deltas from `SDKPartialAssistantMessage.event` (a `BetaRawMessageStreamEvent` from `@anthropic-ai/sdk`), (2) detecting tool start/end from `SDKAssistantMessage` and `SDKUserMessage` events, (3) wiring `AbortSignal` to `Query.close()` for cleanup, and (4) replacing the monolithic `Promise.race` timeout with a per-event idle timer using existing `TIMEOUT_MS` values.

**Primary recommendation:** Model `chatStream()` closely after the existing `chat()` + `collectResponse()` pattern, but as an async generator that yields `SSEEvent` objects, using `includePartialMessages: true` to receive streaming text deltas.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- New `chatStream()` async generator in `packages/server/src/agent/agent-service.ts` alongside existing `chat()`
- Yields `SSEEvent` type from `@minerva/shared` (Phase 38 discriminated union)
- Same parameters as `chat()` plus `AbortSignal`
- Returns `AsyncGenerator<SSEEvent>`
- Call `query()` with `includePartialMessages: true`
- Extract text deltas from `SDKPartialAssistantMessage` (`stream_event` type) with `content_block_delta` / `text_delta`
- Extract `session_id` from `SDKSystemMessage` (subtype `init`)
- Extract result from `SDKResultSuccess` (subtype `success`)
- Detect tool starts from `SDKAssistantMessage.message.content` blocks with `type === 'tool_use'`
- Detect tool ends from `SDKUserMessage` with `tool_use_result`
- Track active tools in `Set<string>`
- Pass `AbortController` to SDK, check `signal.aborted` before each yield
- Register `abort` listener that calls `query.close()`, remove on cleanup
- Per-event idle timeout using `TIMEOUT_MS` from `models.ts`
- On idle timeout, yield `SSEErrorEvent` then return
- Maintain `fullText` accumulator, pass in done/error events
- Wrap generator body in try/catch, yield `SSEErrorEvent` on caught error
- Keep existing `chat()` unchanged

### Claude's Discretion
- Internal variable names for tracking state
- Whether to extract streaming logic into helper or keep inline
- Exact idle timeout implementation (setTimeout vs Date.now())
- Whether to filter/ignore irrelevant SDK message types
- Whether to add debug logging

### Deferred Ideas (OUT OF SCOPE)
- Express SSE endpoint wiring (Phase 40)
- Client-side SSE consumption (Phase 41)
- Tool label mapping (Phase 42)
- Stop button / user-initiated cancel (STOP-01)
- SSE event ID / resumption
- Streaming confirmation block parsing
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SRVR-03 | Server iterates Agent SDK async iterable with `includePartialMessages: true` and emits SSE events | Query extends AsyncGenerator<SDKMessage, void>; includePartialMessages option confirmed in SDK v0.2.81; SDKPartialAssistantMessage type documented |
| SRVR-04 | Server emits tool-start when agent begins tool call and tool-end when it completes | SDKAssistantMessage.message (BetaMessage) contains content blocks; SDKUserMessage has tool_use_result field; SDKToolProgressMessage available as alternative signal |
| SRVR-05 | Server handles client disconnect by cleaning up Agent SDK iterator | Query.close() method confirmed; abort listener pattern for signal-to-close bridging |
| SRVR-06 | Server applies per-model idle timeout rather than monolithic request timeout | TIMEOUT_MS already defined per model (Haiku 15s, Sonnet 30s, Opus 60s); setTimeout reset pattern for idle detection |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/claude-agent-sdk | 0.2.81 | Agent query execution and streaming | Already installed; provides Query async generator |
| @minerva/shared | local | SSE event type definitions | Phase 38 output; SSEEvent discriminated union |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | - | - | No new dependencies needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AsyncGenerator yield | Transform stream | Generator is simpler, matches SDK pattern |

**Installation:** No new packages needed.

## Architecture Patterns

### Pattern 1: Async Generator Yielding Typed Events
**What:** `chatStream()` is an `async function*` that iterates the SDK's `Query` and yields `SSEEvent` objects
**When to use:** When transforming an async iterable into a different typed event stream
**Example:**
```typescript
export async function* chatStream(
  db: Database.Database,
  ctx: Context,
  message: string,
  signal: AbortSignal,
  sessionId?: string,
  model: ModelId = DEFAULT_MODEL_ID,
): AsyncGenerator<SSEEvent> {
  const queryStream = query({ prompt: message, options: { ...opts, includePartialMessages: true } });
  // Register abort handler
  const onAbort = () => queryStream.close();
  signal.addEventListener('abort', onAbort);
  try {
    for await (const msg of queryStream) {
      if (signal.aborted) break;
      // ... yield events based on msg.type ...
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
```

### Pattern 2: Idle Timeout with Timer Reset
**What:** Reset a timer on each received message; if timer fires, terminate stream
**When to use:** When a per-event timeout is needed instead of a total timeout
**Example:**
```typescript
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let idleTimedOut = false;
const resetIdle = () => {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { idleTimedOut = true; queryStream.close(); }, timeoutMs);
};
resetIdle(); // start first timer
for await (const msg of queryStream) {
  resetIdle();
  // process message...
}
if (idleTimer) clearTimeout(idleTimer);
```

### Pattern 3: SDK Message Type Discrimination
**What:** Switch on `msg.type` and `msg.subtype` to handle different SDK messages
**When to use:** When iterating the Query async generator
**Key types and their discrimination:**
```typescript
// msg.type === 'system' && msg.subtype === 'init' → SDKSystemMessage → extract session_id
// msg.type === 'stream_event' → SDKPartialAssistantMessage → extract text deltas from event
// msg.type === 'assistant' → SDKAssistantMessage → detect tool_use content blocks
// msg.type === 'user' && msg.tool_use_result → SDKUserMessage → detect tool completions
// msg.type === 'result' && msg.subtype === 'success' → SDKResultSuccess → extract final text
// msg.type === 'result' && msg.subtype starts with 'error' → SDKResultError → yield error
```

### Anti-Patterns to Avoid
- **Collecting all messages then yielding:** Defeats the purpose of streaming; yield immediately as each message is processed
- **Re-throwing errors from generator:** Would crash the Express handler; always yield SSEErrorEvent instead
- **Forgetting to clean up abort listener:** Memory leak; use try/finally to removeEventListener

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Query abort/cleanup | Custom process kill logic | `Query.close()` | SDK handles subprocess cleanup |
| Timeout management | Global Promise.race | Per-event setTimeout reset | Idle timeout is the requirement (SRVR-06) |
| Type exports | Duplicate event interfaces | `@minerva/shared` SSEEvent | Phase 38 already defined the types |

## Common Pitfalls

### Pitfall 1: Not Handling All SDKMessage Types
**What goes wrong:** The `SDKMessage` union has 20+ subtypes; an exhaustive switch would be verbose
**Why it happens:** New SDK versions add message types
**How to avoid:** Use an allowlist of types to process (system/init, stream_event, assistant, user, result); ignore all others with a default case
**Warning signs:** TypeScript errors on exhaustive switch, unhandled message types in logs

### Pitfall 2: BetaRawMessageStreamEvent Delta Extraction
**What goes wrong:** The `event` field on `SDKPartialAssistantMessage` is a `BetaRawMessageStreamEvent` from `@anthropic-ai/sdk`; its shape follows the Anthropic streaming API
**Why it happens:** Multiple event subtypes exist (content_block_start, content_block_delta, content_block_stop, message_start, message_delta, message_stop)
**How to avoid:** Only extract text from `content_block_delta` events where `delta.type === 'text_delta'`; ignore other subtypes
**Warning signs:** Empty text deltas, unexpected event shapes

### Pitfall 3: Tool Start from SDKAssistantMessage vs Stream Events
**What goes wrong:** Tool-start can be detected from either `SDKAssistantMessage.message.content` (full message) or `content_block_start` stream events
**Why it happens:** Both fire, but at different times; the full `SDKAssistantMessage` fires after the entire response is complete, while `content_block_start` fires during streaming
**How to avoid:** Use `content_block_start` from `SDKPartialAssistantMessage.event` for earliest detection during streaming. If the content block has `type === 'tool_use'`, it carries `name` for the tool name. Fall back to `SDKAssistantMessage.message.content` for cases where `includePartialMessages` might not fire
**Warning signs:** Tool-start events arriving late (after tool has already started executing)

### Pitfall 4: AbortSignal + for-await Interaction
**What goes wrong:** When `signal.abort()` fires during a `for await` iteration, the `query.close()` call terminates the underlying async generator, causing the `for await` loop to exit naturally
**Why it happens:** Closing an async generator causes its next `yield` to throw or complete
**How to avoid:** Register the abort listener before the loop, clean up in `finally`. Check `signal.aborted` after the loop exits to distinguish abort from normal completion
**Warning signs:** Generator not terminating after abort, memory leaks from running SDK processes

### Pitfall 5: Idle Timeout Cleanup
**What goes wrong:** Timer fires after generator has already completed, causing stale `queryStream.close()` call
**Why it happens:** Timer is not cleared when generator exits normally
**How to avoid:** Always clear the idle timer in the `finally` block
**Warning signs:** Harmless but noisy errors from closing an already-closed query

## Code Examples

### Existing collectResponse Pattern (from agent-service.ts)
```typescript
// Current pattern — iterate and collect
async function collectResponse(queryStream: AsyncIterable<SDKMessage>): Promise<{ text: string; sessionId: string }> {
  let sessionId = '';
  let text = '';
  for await (const msg of queryStream) {
    if (msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init') {
      sessionId = (msg as { session_id: string }).session_id;
    }
    if (msg.type === 'result' && 'subtype' in msg && msg.subtype === 'success') {
      text = (msg as { result: string }).result;
    }
  }
  return { text, sessionId };
}
```

### SDK Query with includePartialMessages
```typescript
const queryStream = query({
  prompt: message,
  options: {
    model,
    systemPrompt,
    mcpServers: { minerva: mcpServer },
    allowedTools: ['mcp__minerva__*'],
    tools: [],
    maxTurns: 10,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
    ...(sessionId ? { resume: sessionId } : {}),
  },
});
```

### Text Delta Extraction from Stream Event
```typescript
if (msg.type === 'stream_event') {
  const event = msg.event; // BetaRawMessageStreamEvent
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    fullText += event.delta.text;
    yield { type: 'text-delta', text: event.delta.text } as const;
  }
}
```

### Tool Detection from Stream Events
```typescript
if (msg.type === 'stream_event') {
  const event = msg.event;
  if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
    const toolName = event.content_block.name;
    if (!activeTools.has(toolName)) {
      activeTools.add(toolName);
      yield { type: 'tool-start', tool: toolName } as const;
    }
  }
}
```

### Tool End Detection from User Messages
```typescript
if (msg.type === 'user' && msg.tool_use_result !== undefined) {
  // A tool completed. The SDK sends a user message with tool_use_result after each tool execution.
  // Emit tool-end for all active tools (they complete when the user message carries results)
  for (const toolName of activeTools) {
    yield { type: 'tool-end', tool: toolName } as const;
  }
  activeTools.clear();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Promise.race timeout (chat()) | Per-event idle timeout | Phase 39 | More responsive timeout; doesn't kill long tool executions |
| Collect all then return | Yield events as they arrive | Phase 39 | Enables real-time streaming to client |

## Open Questions

1. **BetaRawMessageStreamEvent type access at runtime**
   - What we know: The type is imported from `@anthropic-ai/sdk` but that package is not directly installed (bundled in agent SDK)
   - What's unclear: Whether we can import the type for explicit typing in our code
   - Recommendation: Use runtime type checking (`event.type === 'content_block_delta'`) rather than importing the type; TypeScript will infer from the SDKPartialAssistantMessage.event field

2. **Tool-end timing with multiple concurrent tools**
   - What we know: SDKUserMessage with tool_use_result fires after tool completion; a Set tracks active tools
   - What's unclear: Whether each tool gets its own SDKUserMessage or if multiple results come in one message
   - Recommendation: Check for tool_use_result on each user message; clear matching tools from the active set. The context suggests individual messages per tool, but code should handle both cases

3. **SDKResultError vs caught exceptions**
   - What we know: SDKResultError has subtypes like `error_during_execution`, `error_max_turns`; exceptions can also be thrown from the query
   - What's unclear: Which error paths produce SDKResultError vs thrown exceptions
   - Recommendation: Handle both — yield SSEErrorEvent from SDKResultError messages AND from catch block

## Sources

### Primary (HIGH confidence)
- @anthropic-ai/claude-agent-sdk v0.2.81 `sdk.d.ts` — Query interface, SDKMessage union, SDKPartialAssistantMessage type, includePartialMessages option, Query.close() method
- Existing `agent-service.ts` — collectResponse pattern, query options, model/timeout config

### Secondary (MEDIUM confidence)
- Anthropic API BetaRawMessageStreamEvent type structure — inferred from SDK type declarations and standard Anthropic streaming API documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — SDK already in use, types verified from installed package
- Architecture: HIGH — async generator pattern directly mirrors existing collectResponse
- Pitfalls: MEDIUM — BetaRawMessageStreamEvent delta extraction and tool timing need runtime verification

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (SDK types are stable within minor versions)
