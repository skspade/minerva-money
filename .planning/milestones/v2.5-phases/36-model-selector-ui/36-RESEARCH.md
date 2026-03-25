# Phase 36: Model Selector UI - Research

**Researched:** 2026-03-24
**Status:** Complete

## Phase Boundary

Add a model selector dropdown to ChatPage.tsx that lets the user choose between Haiku, Sonnet, and Opus. The dropdown fetches options from `agent.models` tRPC query, passes selection to `agent.chat` mutation, clears conversation on model change, and is disabled during pending requests.

## Technical Findings

### Integration Points (from Phase 33)

**Server endpoints ready to consume:**
- `agent.models` tRPC query: Returns `MODELS` array of `{ id: string, label: string, description: string }`
- `agent.chat` mutation: Input schema accepts `model: z.string().optional()` — passes to `chat()` service function
- `DEFAULT_MODEL_ID`: `'claude-sonnet-4-20250514'` — hardcoded in `models.ts`

### ChatPage.tsx Current State (217 lines)

**Imports:** `useState, useRef, useEffect` from React; `useMutation` from TanStack Query; `useTRPC` from trpc.ts
- Does NOT currently import `useQuery` — will need to add it

**State variables:**
- `input` (string) — textarea content
- `messages` (ChatMessage[]) — conversation history
- `sessionId` (string | undefined) — SDK session identifier
- `respondedConfirmations` (Set<number>) — tracks which confirmation buttons have been clicked

**Mutation call (line 88):**
```typescript
chatMutation.mutate({ message: messageText, sessionId });
```
Needs `model` parameter added: `chatMutation.mutate({ message: messageText, sessionId, model: selectedModel })`

**Input bar container (line 195):**
```html
<div className="border-t border-gray-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
  <div className="mx-auto max-w-3xl flex gap-2">
    <!-- textarea + send button -->
  </div>
</div>
```

### Established Patterns

**useQuery pattern** (from DashboardPage, etc.):
```typescript
import { useQuery } from '@tanstack/react-query';
const { data: models } = useQuery(trpc.agent.models.queryOptions());
```

**Disabled state pattern** (existing in ChatPage):
- `disabled={chatMutation.isPending}` on textarea and send button
- Tailwind: `disabled:opacity-50 disabled:cursor-not-allowed`

### Discovery Level

**Level 0 — Skip**: All work follows established codebase patterns. Native `<select>` element with Tailwind styling. No new dependencies. TanStack Query `useQuery` already used across the project. All server endpoints exist from Phase 33.

## Implementation Approach

### Single File Change

All modifications happen in `packages/client/src/pages/ChatPage.tsx`:
1. Add `useQuery` import
2. Add `selectedModel` state (defaults to `'claude-sonnet-4-20250514'`)
3. Add `useQuery(trpc.agent.models.queryOptions())` call
4. Add model change handler that resets `messages`, `sessionId`, `respondedConfirmations`
5. Add model selector row above textarea/send-button row
6. Pass `model: selectedModel` to `chatMutation.mutate()`
7. Apply `disabled={chatMutation.isPending}` to `<select>`

### No Server Changes Needed

Phase 33 completed all server-side work. The `agent.models` query and `agent.chat` mutation model parameter are ready.

### No TDD Needed

This is pure UI work: rendering a `<select>`, wiring state, passing props. No business logic with defined I/O suitable for unit testing. Verification is visual + functional.

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Models query fails on load | Low | `<select>` shows default Sonnet; query failure doesn't block chat |
| Model change during pending request | N/A | Prevented by `disabled={chatMutation.isPending}` |
| Session state inconsistency on model change | Low | Full reset of all conversation state (messages + sessionId + confirmations) |

## RESEARCH COMPLETE

---
*Phase: 36-model-selector-ui*
*Research completed: 2026-03-24*
