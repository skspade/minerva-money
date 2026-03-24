# Project Research Summary

**Project:** Minerva Money v2.5 - Chat Enhancements (Model Selector + Category Creation Tools)
**Domain:** Chat agent enhancement for personal budgeting app
**Researched:** 2026-03-24
**Confidence:** HIGH

## Executive Summary

Minerva Money v2.5 is a small, well-scoped enhancement to the existing Claude Agent SDK chat system. It adds two independent capabilities: a model selector (Haiku/Sonnet/Opus) so the user can pick their cost-quality tradeoff, and category creation tools so the agent can create categories and groups during conversation. The critical finding across all research is that **no new dependencies, database migrations, or files are needed** -- everything builds on existing patterns with approximately 170 lines of new or changed code across 5 files.

The recommended approach is to treat this as two parallel tracks that converge at the system prompt. The model selector is a straightforward server-endpoint-to-client-dropdown pipeline. The category creation tools follow the established `action-tools.ts` pattern exactly, wrapping existing `category-service.ts` functions that already export `createCategory` and `createGroup`. Both features are low-complexity individually, but the integration points (session behavior on model switch, duplicate name validation without DB constraints, cache invalidation after agent-driven writes) require deliberate attention.

The primary risks are: (1) the Claude Agent SDK may bind sessions to a specific model, meaning model switches mid-conversation could silently fail -- this must be handled by clearing the session on model change; (2) the database has no UNIQUE constraint on category/group names, so duplicate prevention must be enforced in tool logic with `COLLATE NOCASE`, not relied upon from the system prompt alone; and (3) Opus queries may exceed the current 30-second timeout on multi-tool workflows. All three are preventable with specific implementation choices documented in the research.

## Key Findings

### Recommended Stack

No new dependencies. The entire milestone builds on the existing stack. The SDK's `query()` already accepts a `model` option -- it is just hardcoded today. tRPC needs one new query endpoint and one schema field extension. The client needs a native HTML `<select>` (no component library). better-sqlite3 handles duplicate checking with `COLLATE NOCASE`.

**Core technologies (all existing, unchanged):**
- **@anthropic-ai/claude-agent-sdk ^0.2.81**: `query()` already accepts `model` option; stop hardcoding it
- **@trpc/server ^11.14.1**: Add `models` query procedure, extend `chat` mutation input with optional `model` field
- **better-sqlite3 ^11.7.0**: `COLLATE NOCASE` for duplicate name validation -- no new tables or columns
- **React 19 + native `<select>`**: No custom dropdown component; native select is accessible, mobile-friendly, and sufficient for 3 options

**Model update opportunity:** The default model should change from legacy `claude-sonnet-4-20250514` to `claude-sonnet-4-6` (free quality upgrade). Use explicit snapshot IDs where available for behavioral stability.

Full details: `.planning/research/STACK.md`

### Expected Features

**Must have (table stakes):**
- Model selector dropdown with Haiku/Sonnet/Opus options, defaulting to Sonnet
- Model selection persists within session and is sent with each chat request
- Create category and create category group via chat agent tools
- Duplicate name validation (case-insensitive) before creation -- enforced in tool logic, not just system prompt
- System prompt guidance for new tools (add-only policy, check-before-create workflow)
- New categories usable immediately in the same agent turn (tool returns `{ id, name, groupId }`)

**Should have (differentiators):**
- Cost/speed hints in dropdown labels ("Haiku (fast)" / "Sonnet (balanced)" / "Opus (smartest)")
- Agent suggests existing category on duplicate attempt instead of bare error
- Combo workflows: create-then-categorize in one turn (works naturally with maxTurns: 10)
- Model-specific timeout adjustment (30s Haiku, 45s Sonnet, 90s Opus)
- Visual model indicator pill in chat area

**Not building (explicitly deferred):**
- Category deletion, rename, or reorder via agent -- destructive ops belong in Categories page UI
- Model auto-selection based on query complexity
- Streaming responses
- Fuzzy matching for group name resolution

Full details: `.planning/research/FEATURES.md`

### Architecture Approach

The architecture change is minimal: 5 files modified, 0 files created. Model ID mapping (user-facing "sonnet" to API string "claude-sonnet-4-6") lives in a const array in `agent-router.ts` -- the single place to update when Anthropic releases new model versions. The client sends only short IDs ("haiku", "sonnet", "opus"); the server maps and validates with `z.enum()`. Category tools are two new entries in `action-tools.ts` following the exact pattern of the existing 10 action tools. Duplicate validation happens in the tool layer (not the service layer), matching the existing pattern where `action-tools.ts` validates before calling service functions.

**Modified files:**
1. **agent-router.ts** -- models query, model param in chat input, model ID-to-API-string mapping
2. **agent-service.ts** -- accept model parameter instead of hardcoded string
3. **action-tools.ts** -- two new tools (create_category, create_category_group) with duplicate validation
4. **system-prompt.ts** -- rules 14-15 for category creation guidance
5. **ChatPage.tsx** -- model selector dropdown, state management, session reset on model change, pass model to mutation

Full details: `.planning/research/ARCHITECTURE.md`

### Critical Pitfalls

1. **Session-model binding** -- Switching models mid-conversation may break or silently ignore the change because SDK sessions are bound to configuration at creation time. Prevention: clear `sessionId` when model changes, forcing a fresh session. Must verify SDK behavior during implementation.
2. **Duplicate categories without DB constraint** -- No UNIQUE on name columns means the tool MUST validate before INSERT. Prevention: case-insensitive SQL check (`COLLATE NOCASE`) in the tool handler, returning the existing category's ID in the error so the agent can suggest using it.
3. **Opus timeout at 30 seconds** -- Current timeout is tuned for Sonnet; Opus with multi-tool calls easily exceeds it. Prevention: scale timeout per model or use a generous 90s default (single-user app, no resource contention).
4. **Stale TanStack Query cache after agent creates category** -- Other pages (Budget, Categories, Transactions) will not show new categories until refreshed. Prevention: invalidate category queries in the chat mutation's `onSuccess` handler.
5. **Agent misuses returned category ID in multi-step workflows** -- Prevention: clear return values from tools (`{ success, id, name, groupId }`), brief system prompt reminder to use returned IDs.

Full details: `.planning/research/PITFALLS.md`

## Implications for Roadmap

Based on combined research, a 5-phase structure is recommended. Phases 1 and 2 are independent and can be built in parallel since they touch completely different files.

### Phase 1: Model Selector Server

**Rationale:** Server endpoint must exist before client can consume it. Independent of category tools. Small surface area, easy to verify in isolation.
**Delivers:** `AVAILABLE_MODELS` const array in `agent-router.ts`; `agent.models` query returning 3 models with display names and descriptions; `chat` mutation accepts optional `model` parameter (defaults to "sonnet"); `agent-service.ts` accepts model string instead of hardcoded value; default model updated to `claude-sonnet-4-6`.
**Addresses:** Model list endpoint, model passthrough, backward-compatible default
**Avoids:** Pitfall 4 (client sending raw model strings) by mapping short IDs to API strings server-side with `z.enum()` validation

### Phase 2: Category Creation Tools

**Rationale:** Independent of Phase 1 (different files entirely). Can be built in parallel. Must exist before system prompt references them.
**Delivers:** `create_category` and `create_category_group` tools in `action-tools.ts`; case-insensitive duplicate validation via `COLLATE NOCASE`; clear return values (`{ success, id, name, groupId }`); imports from existing `category-service.ts` functions.
**Addresses:** Category/group creation, duplicate name validation, immediate usability of new categories
**Avoids:** Pitfall 2 (duplicate names) with mandatory tool-level validation; Pitfall 6 (wrong group) by requiring explicit groupId parameter

### Phase 3: System Prompt Updates

**Rationale:** References tools from Phase 2; should be finalized after tools exist. Minimal addition (3-5 lines) to avoid prompt bloat.
**Delivers:** Rules 14-15 in system-prompt.ts: always call list_categories before creating; add-only policy (no delete/rename/reorder); use returned IDs for follow-up operations.
**Addresses:** Agent behavioral consistency, anti-feature enforcement, multi-step workflow guidance
**Avoids:** Pitfall 3 (ID tracking across tool calls); Pitfall 9 (prompt bloat) by keeping additions minimal and leaning on tool descriptions

### Phase 4: Model Selector UI

**Rationale:** Depends on Phase 1 server endpoint. Last feature work before integration testing.
**Delivers:** Native `<select>` dropdown in ChatPage input area; `useState` for selected model; `useQuery` on `agent.models`; session reset (`setSessionId(undefined)`) on model change; model passed to `chatMutation.mutate()`.
**Addresses:** User-facing model selection, session-model coherence, mobile-friendly UI
**Avoids:** Pitfall 1 (session-model binding) by clearing sessionId on model change; Pitfall 8 (mobile layout) by using native select inside existing input container

### Phase 5: Integration and Polish

**Rationale:** End-to-end verification after all pieces are in place. Includes timeout adjustment and cache invalidation -- both are enhancements that depend on the core features working.
**Delivers:** Model-specific timeout scaling in agent-service.ts; TanStack Query cache invalidation for category queries after chat responses; manual verification of all 3 models, category creation workflows, duplicate rejection, multi-step create-then-categorize, and cross-page cache consistency.
**Addresses:** Model-specific timeout (should-have), stale cache fix (must-have), visual model indicator (stretch)
**Avoids:** Pitfall 7 (Opus timeout); Pitfall 10 (stale cache on other pages)

### Phase Ordering Rationale

- Phases 1 and 2 are fully independent -- they touch different files and can be built in parallel
- Phase 3 depends on Phase 2 (prompt references tools that must exist)
- Phase 4 depends on Phase 1 (client consumes server endpoint)
- Phase 5 is integration verification and polish after all features are complete
- This ordering minimizes blocked work and maximizes parallelism between the two feature tracks

### Research Flags

All phases use well-documented patterns with standard approaches -- no phases require a `/gsd:research-phase` step:

- **Phase 1:** Direct tRPC endpoint addition; SDK `query()` already accepts model param (confirmed via code inspection)
- **Phase 2:** Exact clone of existing action-tools.ts pattern; service functions already exported
- **Phase 3:** String editing of system prompt; no technical unknowns
- **Phase 4:** Standard React `useState` + native HTML `<select>`; one `useQuery` hook

**Implementation-time verification needed (not full research):**
- **Phase 4:** Test Claude Agent SDK session behavior when model changes mid-session -- MEDIUM confidence on exact behavior; if SDK handles it gracefully, session reset logic may be simplified
- **Phase 5:** Calibrate Opus timeout values under real multi-tool load

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zero new dependencies; all existing libraries confirmed via direct code inspection |
| Features | HIGH | Features from PROJECT.md + codebase analysis; edge cases mapped; ~170 lines total change |
| Architecture | HIGH | All 5 modified files identified with exact change descriptions; 0 new files needed |
| Pitfalls | HIGH (one MEDIUM) | Most pitfalls from direct code analysis; session-model binding is MEDIUM (inferred, needs SDK verification) |

**Overall confidence:** HIGH

### Gaps to Address

- **SDK session-model binding behavior:** The exact behavior when resuming a session with a different model is inferred, not verified against SDK source. Test early in Phase 4 -- if the SDK handles it gracefully, the session reset logic simplifies.

- **Confirmation flow for category creation:** Research produced a split recommendation. FEATURES.md suggests confirmation for consistency with write operations. ARCHITECTURE.md explicitly recommends against it, noting creation is safe/add-only and matches other auto-executing write tools (create_rule, categorize_transaction). **Recommendation: skip confirmation for creates** -- it adds friction to a non-destructive operation. Only budget changes (with financial impact) warrant confirmation.

- **Model ID currency:** Model IDs verified as of 2026-03-24. Anthropic may release new snapshots; the const array in `agent-router.ts` is designed for easy single-file updates during deployment.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: all files in `packages/server/src/agent/` directory (agent-service.ts, agent-router.ts, tools/action-tools.ts, system-prompt.ts, mcp-server.ts)
- Direct codebase inspection: `packages/client/src/pages/ChatPage.tsx` (mutation pattern, confirmation flow, layout structure)
- Direct codebase inspection: `packages/server/src/categories/category-service.ts` (createCategory, createGroup already exported)
- Database schema: `packages/server/migrations/001-initial-schema.sql` (no UNIQUE on category/group names)
- PROJECT.md v2.5 milestone requirements

### Secondary (MEDIUM confidence)
- Anthropic Models Overview (https://platform.claude.com/docs/en/about-claude/models/overview) -- model IDs and pricing verified 2026-03-24
- Claude Agent SDK session-model binding behavior -- inferred from API patterns, needs implementation verification

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*
