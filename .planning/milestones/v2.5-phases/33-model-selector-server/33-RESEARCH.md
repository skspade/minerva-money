# Phase 33: Model Selector Server - Research

**Researched:** 2026-03-24
**Domain:** tRPC API extension, Anthropic model configuration
**Confidence:** HIGH

## Summary

Phase 33 adds server-side model selection to the existing Claude agent chat feature. The implementation requires no new dependencies — the `@anthropic-ai/claude-agent-sdk` `query()` function already accepts a `model` option (currently hardcoded to `claude-sonnet-4-20250514`), tRPC + Zod handle input validation, and the existing `Promise.race` timeout pattern supports dynamic timeout values.

The work touches three files: a new `models.ts` (model definitions + timeout map), modifications to `agent-service.ts` (accept model param, dynamic timeout), and modifications to `agent-router.ts` (new `models` query, extended `chat` mutation input). No database changes, no client changes, no new packages.

**Primary recommendation:** Create a single `models.ts` file as the source of truth for model IDs, labels, descriptions, and timeouts. Import it from both the router (for validation and the models query) and the service (for default model and timeout lookup).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- New tRPC query `agent.models` returns an array of `{ id: string, label: string, description: string }` objects
- Three models: Haiku, Sonnet, Opus with specific model IDs
- Model list is a static constant defined in a dedicated `models.ts` file alongside `agent-service.ts`
- Extend the `agent.chat` mutation input schema to include `model: z.string().optional()`
- Server-side allowlist validation: reject any model ID not in the static model list with a TRPCError BAD_REQUEST
- Add `model` parameter to the `chat()` function signature with default value of the Sonnet model ID
- Replace the hardcoded model in the options object with the passed parameter
- Define a timeout map in `models.ts`: Haiku 15s, Sonnet 30s, Opus 60s
- Replace the hardcoded `30_000` timeout with a lookup from the timeout map
- Invalid model ID returns tRPC BAD_REQUEST error before reaching the agent SDK
- Timeout error message should include the model name for debuggability

### Claude's Discretion
- Exact model description strings for each model option
- Whether to export a helper function or just the raw constant array
- Internal naming conventions for the timeout map variable
- Whether to co-export a type or infer from the constant

### Deferred Ideas (OUT OF SCOPE)
- Model selector UI dropdown (Phase 36)
- Session reset on model change (Phase 36)
- Disabled state during pending requests (Phase 36)
- Visual model indicator pill/badge (FUT-01)
- Persist selected model in localStorage (FUT-02)
- Model auto-selection by query complexity (out of scope)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MOD-01 | Server exposes a tRPC query returning available model options (id, label, description) | Static MODELS array in models.ts, new `agent.models` tRPC query returning it |
| MOD-02 | Chat mutation accepts optional model parameter with server-side allowlist validation | Zod `.optional()` on input schema, allowlist check against MODELS array before calling chat() |
| MOD-03 | Agent service uses the selected model instead of hardcoded Sonnet default | New `model` parameter on `chat()` with default, passed to `query()` options |
| MOD-07 | Model-specific timeout scaling (Haiku 15s, Sonnet 30s, Opus 60s) | TIMEOUT_MS map in models.ts, dynamic lookup replacing hardcoded 30_000 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/claude-agent-sdk | ^0.2.81 | Agent runtime — `query()` accepts `model` option | Already installed, already used |
| @trpc/server | ^11.14.1 | New query endpoint, extended mutation schema | Already installed, all routers use it |
| zod | ^4.3.6 | Input validation for model parameter | Already installed, all inputs use it |

### Supporting
No new libraries needed.

### Alternatives Considered
None — all locked decisions use existing stack.

## Architecture Patterns

### New File: models.ts
```
packages/server/src/agent/
├── models.ts          # NEW: model definitions, timeout map
├── agent-service.ts   # MODIFIED: accept model param, dynamic timeout
├── agent-router.ts    # MODIFIED: models query, chat input extended
├── mcp-server.ts      # unchanged
├── system-prompt.ts   # unchanged
└── tools/             # unchanged
```

### Pattern: Static Config Constant with Derived Validation
**What:** Define a `MODELS` array as `as const`, derive the allowlist from it, export for both router and service.
**When to use:** When a small, fixed set of options needs validation and display.
**Example:**
```typescript
export const MODELS = [
  { id: 'claude-haiku-3-5-20241022', label: 'Haiku', description: '...' },
  { id: 'claude-sonnet-4-20250514', label: 'Sonnet', description: '...' },
  { id: 'claude-opus-4-20250514', label: 'Opus', description: '...' },
] as const;

export const MODEL_IDS = MODELS.map(m => m.id);
export type ModelId = (typeof MODELS)[number]['id'];

export const DEFAULT_MODEL_ID: ModelId = 'claude-sonnet-4-20250514';

export const TIMEOUT_MS: Record<ModelId, number> = {
  'claude-haiku-3-5-20241022': 15_000,
  'claude-sonnet-4-20250514': 30_000,
  'claude-opus-4-20250514': 60_000,
};
```

### Pattern: Allowlist Validation at Router Layer
**What:** Validate model ID against allowlist in the router before calling the service.
**When to use:** Fail fast at API boundary.
```typescript
chat: publicProcedure
  .input(z.object({
    message: z.string(),
    sessionId: z.string().optional(),
    model: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    if (input.model && !MODEL_IDS.includes(input.model as ModelId)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Invalid model: ${input.model}` });
    }
    return chat(ctx.db, ctx, input.message, input.sessionId, input.model as ModelId | undefined);
  }),
```

### Anti-Patterns to Avoid
- **Don't use Zod enum for model validation:** The model IDs are long strings; using `z.enum()` exposes them in error messages and couples schema to exact IDs. Better to use `z.string().optional()` + manual allowlist check with a cleaner error.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Model validation | Custom regex or parsing | Simple array `.includes()` check | Only 3 models, KISS |
| Timeout management | Complex timer system | Existing `Promise.race` with variable ms | Pattern already works, just make timeout dynamic |

## Common Pitfalls

### Pitfall 1: Model ID Typos
**What goes wrong:** Using wrong model ID strings causes API errors at runtime.
**Why it happens:** Model IDs are long, similar strings.
**How to avoid:** Single source of truth in `models.ts`, TypeScript types derived from the const array.
**Warning signs:** Runtime "invalid model" errors from Anthropic API.

### Pitfall 2: Forgetting Default Model When Parameter Omitted
**What goes wrong:** Passing `undefined` to the SDK instead of defaulting to Sonnet.
**Why it happens:** Optional parameter not defaulted.
**How to avoid:** Default parameter value in `chat()` function signature.
**Warning signs:** Test where no model is passed gets an error.

### Pitfall 3: Timeout Message Not Identifying Model
**What goes wrong:** User sees "timed out after 30 seconds" but was using Opus (60s expected).
**Why it happens:** Timeout error message is hardcoded.
**How to avoid:** Include model name and timeout value in the error message dynamically.

## Code Examples

### Current agent-service.ts chat() signature (line 13-18)
```typescript
export async function chat(
  db: Database.Database,
  ctx: Context,
  message: string,
  sessionId?: string,
): Promise<ChatResult>
```

### Current hardcoded model (line 23)
```typescript
model: 'claude-sonnet-4-20250514',
```

### Current hardcoded timeout (line 41)
```typescript
const timeoutMs = 30_000;
```

### Current timeout error message (line 45)
```typescript
setTimeout(() => reject(new Error('Agent query timed out after 30 seconds')), timeoutMs),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| claude-sonnet-4-20250514 | claude-sonnet-4-20250514 (keep for now) | N/A | STATE.md mentions updating to claude-sonnet-4-6 but CONTEXT.md locks specific IDs |

**Note:** STATE.md accumulated decision says "Update default model from claude-sonnet-4-20250514 to claude-sonnet-4-6". However, CONTEXT.md (which is the locked decision source) specifies `claude-sonnet-4-20250514` as the Sonnet model ID. The planner should use the model IDs from CONTEXT.md since those are locked decisions. The model ID can be updated later by changing a single line in models.ts.

## Open Questions

1. **Model ID currency**
   - What we know: CONTEXT.md specifies `claude-sonnet-4-20250514` and `claude-opus-4-20250514`
   - What's unclear: STATE.md suggests updating to `claude-sonnet-4-6` — are newer aliases available?
   - Recommendation: Use CONTEXT.md IDs as locked decisions. Easy to update later in models.ts.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `agent-service.ts`, `agent-router.ts`, `trpc-router.ts` — verified current implementation
- `.planning/research/STACK.md` — confirmed SDK already accepts `model` option in `query()`

### Secondary (MEDIUM confidence)
- `@anthropic-ai/claude-agent-sdk` ^0.2.81 package.json — version confirmed from lockfile

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all verified in codebase
- Architecture: HIGH — follows existing patterns exactly
- Pitfalls: HIGH — straightforward changes with clear failure modes

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain, no moving parts)
