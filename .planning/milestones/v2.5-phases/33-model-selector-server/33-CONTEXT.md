# Phase 33: Model Selector Server - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Server exposes model options and accepts model selection for chat requests. This phase adds a tRPC query returning available models (id, label, description), extends the chat mutation to accept an optional model parameter with allowlist validation, wires the selected model through to the Agent SDK query call, and applies model-specific timeout scaling (Haiku 15s, Sonnet 30s, Opus 60s).

</domain>

<decisions>
## Implementation Decisions

### Model List Endpoint (MOD-01)
- New tRPC query `agent.models` returns an array of `{ id: string, label: string, description: string }` objects
- Three models: Haiku (claude-haiku-3-5-20241022), Sonnet (claude-sonnet-4-20250514), Opus (claude-opus-4-20250514) (Claude's Decision: these are the current production model IDs matching the Anthropic API as of early 2026)
- Model list is a static constant defined in a dedicated `models.ts` file alongside `agent-service.ts` (Claude's Decision: single source of truth for model config, importable by both router and service)

### Chat Mutation Model Parameter (MOD-02)
- Extend the `agent.chat` mutation input schema to include `model: z.string().optional()`
- Server-side allowlist validation: reject any model ID not in the static model list with a TRPCError BAD_REQUEST (Claude's Decision: allowlist prevents arbitrary model strings from reaching the Anthropic API)
- Pass validated model ID through to `chat()` function as a new parameter

### Agent Service Model Selection (MOD-03)
- Add `model` parameter to the `chat()` function signature with default value of the Sonnet model ID
- Replace the hardcoded `model: 'claude-sonnet-4-20250514'` in the options object with the passed parameter
- When no model is provided by the client, Sonnet is used as the default

### Timeout Scaling (MOD-07)
- Define a timeout map in `models.ts`: Haiku 15s, Sonnet 30s, Opus 60s
- Replace the hardcoded `30_000` timeout in `agent-service.ts` with a lookup from the timeout map based on selected model
- Timeout map is co-located with model definitions for single-source-of-truth (Claude's Decision: keeps model config centralized so adding a model later only touches one file)

### Validation and Error Handling
- Invalid model ID returns tRPC BAD_REQUEST error before reaching the agent SDK (Claude's Decision: fail fast at the API boundary rather than passing bad input to Anthropic)
- Timeout error message should include the model name for debuggability (Claude's Decision: helps user understand if they need a model with longer timeout)

### Claude's Discretion
- Exact model description strings for each model option
- Whether to export a helper function or just the raw constant array
- Internal naming conventions for the timeout map variable
- Whether to co-export a type or infer from the constant

</decisions>

<specifics>
## Specific Ideas

- The current hardcoded model in `agent-service.ts` line 23 is `claude-sonnet-4-20250514` -- this is the exact string to use as the Sonnet default
- The current hardcoded timeout at line 41 is `30_000` (30 seconds) -- this becomes the Sonnet entry in the timeout map
- The `chat()` function currently takes 4 parameters (db, ctx, message, sessionId) -- model should be added as a 5th parameter with a default value
- The agent router at `agent-router.ts` is mounted as `agent:` in `trpc-router.ts` -- the models query will be accessible as `agent.models`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/agent/agent-service.ts`: The `chat()` function with existing timeout pattern via `Promise.race` -- extend with model parameter and dynamic timeout
- `packages/server/src/agent/agent-router.ts`: Existing router with `chat` mutation -- add `models` query and extend `chat` input schema
- `packages/server/src/sync/trpc.ts`: Exports `publicProcedure`, `router` -- standard tRPC setup used by all routers

### Established Patterns
- tRPC routers use Zod for input validation (`z.object({ ... })`) -- model parameter follows this pattern
- Agent router is mounted as a nested router under the main `appRouter` -- no new router registration needed
- Error handling in `agent-service.ts` catches errors and returns user-friendly messages -- timeout errors already handled

### Integration Points
- `agent-router.ts` calls `chat()` from `agent-service.ts` -- the model parameter flows from router input to service function
- The `query()` call from `@anthropic-ai/claude-agent-sdk` accepts a `model` string in its options -- this is where the selected model is ultimately passed
- Phase 36 (Model Selector UI) will consume the `agent.models` query to populate the dropdown and pass the selected model to `agent.chat`

</code_context>

<deferred>
## Deferred Ideas

- Model selector UI dropdown -- Phase 36 scope
- Session reset on model change -- Phase 36 scope (client-side concern)
- Disabled state during pending requests -- Phase 36 scope (client-side concern)
- Visual model indicator pill/badge -- FUT-01, deferred beyond v2.5
- Persist selected model in localStorage -- FUT-02, deferred beyond v2.5
- Model auto-selection by query complexity -- explicitly out of scope per REQUIREMENTS.md

</deferred>

---

*Phase: 33-model-selector-server*
*Context gathered: 2026-03-24 via auto-context*
