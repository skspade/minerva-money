# Phase 36: Model Selector UI - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

User can choose between Haiku, Sonnet, and Opus from the chat interface. This phase adds a model dropdown above the chat input bar that fetches options from the `agent.models` tRPC query (built in Phase 33), passes the selected model to the `agent.chat` mutation, clears conversation history when the model is switched, and disables the dropdown while a chat response is loading.

</domain>

<decisions>
## Implementation Decisions

### Model Dropdown Component (MOD-04)
- A `<select>` element positioned above the chat input bar, inside the input bar's border-top container
- Fetches model options from `agent.models` tRPC query using TanStack Query's `useQuery` pattern (matches DashboardPage, ReportsPage established pattern)
- Each `<option>` shows the model label (Haiku, Sonnet, Opus); the value is the model `id` string
- Default selection is Sonnet (`claude-sonnet-4-20250514`) to match `DEFAULT_MODEL_ID` on the server (Claude's Decision: consistent default between client and server avoids ambiguity)
- Uses native `<select>` element, not a custom dropdown (Claude's Decision: native select is mobile-friendly per PROJECT.md "mobile-friendly native select" requirement, accessible, and consistent with no-component-library convention)

### Layout and Styling
- Dropdown sits in a row above the textarea/send-button row, within the existing input bar container (`border-t border-gray-200 bg-white`)
- The row contains the select on the left with a small label or the model description on the right (Claude's Decision: showing the description gives the user context about each model's strengths without needing a tooltip)
- Styled with Tailwind classes matching existing input bar aesthetics: `rounded-lg border border-gray-300 text-sm px-3 py-1.5` (Claude's Decision: mirrors the textarea styling for visual consistency)
- Max width constrained to `max-w-3xl mx-auto` matching the existing input bar layout

### Model Parameter in Chat Mutation (MOD-04)
- Pass the selected model ID to `chatMutation.mutate({ message, sessionId, model: selectedModel })`
- The `agent.chat` mutation input already accepts `model: z.string().optional()` from Phase 33
- When Sonnet is selected (the default), still pass it explicitly rather than omitting (Claude's Decision: explicit is clearer and avoids coupling to server default behavior)

### Session Reset on Model Change (MOD-05)
- When the user selects a different model from the dropdown, clear `messages` state to `[]`, reset `sessionId` to `undefined`, and clear `respondedConfirmations` to a new empty `Set`
- This gives the user a fresh conversation with the newly selected model
- No confirmation dialog before clearing (Claude's Decision: the action is easily reversible by switching back, and a confirmation dialog adds friction to a simple preference change)

### Disabled State During Loading (MOD-06)
- The `<select>` element receives `disabled={chatMutation.isPending}` matching the existing disabled pattern on the textarea and send button
- Disabled styling uses `disabled:opacity-50 disabled:cursor-not-allowed` matching existing conventions in ChatPage
- This prevents model switching mid-response which would create an inconsistent session state

### State Management
- New `useState` for selected model: `const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-20250514')` (Claude's Decision: hardcoded default avoids waiting for the query to resolve before having a usable default)
- Model change handler resets conversation state and updates selected model in a single function (Claude's Decision: grouping resets in one handler prevents partial state updates)

### Claude's Discretion
- Exact Tailwind spacing classes between the model selector row and the input row
- Whether to show model description inline or only in the option text
- Exact width of the select element
- Whether the model label row uses flexbox gap or margin

</decisions>

<specifics>
## Specific Ideas

- The `agent.models` query returns `MODELS` which is `[{ id, label, description }]` -- the dropdown can map over this directly
- The chat mutation already accepts `model` in its input schema (`z.string().optional()`) so no server changes are needed
- ChatPage currently has no `useQuery` import -- it will need `useQuery` added from `@tanstack/react-query` alongside the existing `useMutation`
- The existing input bar container is at line 195 of ChatPage.tsx: `<div className="border-t border-gray-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">`
- FUT-02 (persist model in localStorage) is explicitly deferred -- this phase uses in-memory state only

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/client/src/pages/ChatPage.tsx`: Complete chat page with messages state, sessionId state, chatMutation, and input bar -- all modification happens here
- `packages/client/src/trpc.ts`: `useTRPC()` hook already used in ChatPage -- provides `trpc.agent.models.queryOptions()` for the models query
- `packages/server/src/agent/models.ts`: `MODELS` array with `{ id, label, description }` and `DEFAULT_MODEL_ID` constant -- client will consume via tRPC

### Established Patterns
- TanStack Query `useQuery(trpc.<router>.<procedure>.queryOptions())` pattern used across DashboardPage, ReportsPage, TransactionsPage
- `useMutation(trpc.<router>.<procedure>.mutationOptions({...}))` pattern already used in ChatPage for `agent.chat`
- Disabled state via `disabled={mutation.isPending}` with `disabled:opacity-50 disabled:cursor-not-allowed` Tailwind classes -- used on textarea, send button, confirm/cancel buttons
- All UI is custom Tailwind (no component library) -- the select element should use raw HTML `<select>` with Tailwind styling

### Integration Points
- `agent.models` tRPC query (Phase 33) returns the model list consumed by the dropdown
- `agent.chat` mutation input already accepts `model` parameter (Phase 33) -- no server changes needed
- ChatPage state (`messages`, `sessionId`, `respondedConfirmations`) must all reset together on model change

</code_context>

<deferred>
## Deferred Ideas

- Visual model indicator pill/badge in chat area showing active model -- FUT-01, deferred beyond v2.5
- Persist selected model across page navigations via localStorage -- FUT-02, deferred beyond v2.5
- Model auto-selection by query complexity -- explicitly out of scope per REQUIREMENTS.md
- Streaming responses -- explicitly out of scope per PROJECT.md

</deferred>

---

*Phase: 36-model-selector-ui*
*Context gathered: 2026-03-24 via auto-context*
