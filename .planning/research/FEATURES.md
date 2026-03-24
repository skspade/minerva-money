# Feature Landscape

**Domain:** Chat agent enhancements -- model selector and category creation tools
**Researched:** 2026-03-24

## Table Stakes

Features users expect for these capabilities. Missing = feels incomplete.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| Model selector dropdown with 3 options (Haiku/Sonnet/Opus) | Users expect to pick cost/quality tradeoff; Sonnet is not always the right tool | Low | New tRPC endpoint for model list, client state | Server-driven list so client never hardcodes model IDs |
| Selected model persists within session | Switching models mid-conversation and losing the choice is frustrating | Low | Client-side state (useState or localStorage) | Reset on page refresh is acceptable; localStorage is better UX |
| Model selection sent with each chat request | Server needs to know which model to use | Low | Add `model` field to agent.chat input schema | Current agent-service.ts hardcodes `claude-sonnet-4-20250514` on line 23 |
| Create category via chat | Natural request when categorizing transactions reveals missing categories ("I need a Subscriptions category") | Med | `createCategory` from category-service.ts, new agent tool | Service function already exists and returns `{ id, name }` |
| Create category group via chat | Cannot create categories without a group to put them in | Med | `createGroup` from category-service.ts, new agent tool | Service function already exists and returns `{ id, name }` |
| Duplicate name validation for categories and groups | Creating "Groceries" when it already exists is always a mistake | Low | SQL query before insert | Schema has NO UNIQUE constraint on names -- must validate in tool logic |
| Confirmation flow for category/group creation | Consistent with existing write operation UX patterns | Low | Existing confirmation JSON block pattern in ChatPage.tsx | Reuse the `parseConfirmation` pattern already working |
| System prompt guidance for new tools | Agent needs to know when/how to use create tools and the add-only policy | Low | system-prompt.ts update | Covers duplicate checking, add-only scope, multi-step workflows |
| New category usable immediately after creation | After creating a category, agent should use it in the same turn without extra lookups | Low | Tool returns `{ id, name }` which agent uses | Already works -- `createCategory` returns what agent needs |

## Differentiators

Features that improve the experience beyond the basics. Not expected, but valued.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Model cost/speed hints in dropdown | "Haiku (fast) / Sonnet (balanced) / Opus (smartest)" helps pick without knowing model names | Low | Static labels in server model list | Anthropic model naming is opaque to non-technical users |
| Agent suggests existing category on duplicate attempt | Instead of bare error, say "Groceries already exists in Food & Drink (ID 5). Want to use that?" | Low | System prompt guidance only | No code change -- prompt engineering tells agent to list_categories first |
| Combo workflow: create then categorize in one turn | "Create a Subscriptions category under Bills and categorize this Netflix charge there" | Low | Multi-tool turn support (already works with maxTurns: 10) | Agent SDK handles sequential tool calls naturally |
| Visual model indicator in chat area | Small pill/badge showing active model name so user remembers their selection | Low | Client state only | Useful context when returning to chat after navigation |
| Model-specific timeout adjustment | Opus is slower (increase to 60s); Haiku is faster (decrease to 15s) | Low | Map model ID to timeout in agent-service.ts | Current hardcoded 30s may timeout Opus on complex multi-tool queries |
| Duplicate check uses case-insensitive comparison | "groceries" and "Groceries" should be treated as duplicates | Low | SQL COLLATE NOCASE in duplicate check | Prevents near-duplicate categories that differ only in casing |

## Anti-Features

Features to explicitly NOT build. Scoped out per PROJECT.md or would cause problems.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Category deletion via agent | Deleting categories affects sort ordering, budget allocations, and transaction history -- destructive op belongs in UI with visual confirmation | Agent says "I can only create categories. To delete or rename, go to the Categories page." |
| Category rename via agent | Rename has UI implications (sort order, visual placement) and is rare enough to not warrant chat support | Direct to Categories page |
| Category reorder via agent | Ordering is inherently visual; chat is the wrong interface for drag-and-drop equivalents | Direct to Categories page |
| Model auto-selection based on query complexity | Sounds smart but is unpredictable; user should control cost decisions | Let user choose; default to Sonnet |
| Streaming model responses | Scoped out in PROJECT.md; collect-and-return is sufficient for single user | Keep current pattern; revisit only if Opus timeouts become a real problem |
| Per-model session isolation | Switching models mid-session could confuse context, but SDK sessions handle it; splitting sessions adds complexity for no gain | Allow model switching within same session |
| Free-text group assignment ("put it in something like Bills") | Fuzzy matching group names is error-prone | Agent lists groups, asks user to pick from the list |
| Client-side model list | Hardcoding model IDs in React means a client rebuild when Anthropic updates models | Server-driven list; single source of truth |

## Feature Dependencies

```
Server model list endpoint
    |
    +--> Client model selector dropdown
            |
            +--> Model ID sent with chat request
                    |
                    +--> agent-service uses selected model (replaces hardcoded string)
                            |
                            +--> Model-specific timeout (optional enhancement)

create_category_group tool (standalone -- no dependencies beyond category-service.ts)
    |
    +--> create_category tool (needs group_id -- agent calls list_categories or create_group first)

Both creation tools need:
    +--> Duplicate name validation (case-insensitive SQL check before INSERT)
    +--> Confirmation flow (reuses existing parseConfirmation pattern)
    +--> System prompt update (behavioral guidance for new tools)
```

### Dependency Notes

- **Model selector is fully independent of category tools.** These two feature groups can be built in parallel or in either order.
- **create_category depends on groups existing.** Agent must either list_categories to find a group_id or create_group first. The system prompt should guide this behavior.
- **Confirmation flow requires no new code.** The existing JSON block pattern in the system prompt and `parseConfirmation` in ChatPage.tsx handle it. Just add confirmation instructions for category creation to the system prompt.
- **Duplicate validation must be in tool logic, not schema.** The SQLite schema has no UNIQUE constraint on category or group names (and adding one would be a migration). Validate in the tool wrapper before calling the service function.

## MVP Recommendation

**Priority order based on dependencies and impact:**

1. **Server model list endpoint + client dropdown** -- Unblocks model selection; small surface area; immediate user value. Endpoint returns static list: `[{ id: "claude-haiku-3-5-20241022", label: "Haiku", description: "Fast" }, ...]`. Client stores selection, sends with each chat mutation.

2. **Wire model through agent-service** -- Change `agent-service.ts` to accept model parameter instead of hardcoded string. Add `model` field to `agent.chat` tRPC input schema (optional, defaults to Sonnet for backward compat).

3. **create_category_group tool** -- Must exist before create_category is useful. Duplicate name check via case-insensitive query. Confirmation flow via system prompt instructions.

4. **create_category tool** -- Same pattern as group creation. Agent needs group_id from list_categories or prior create_group call.

5. **System prompt updates** -- Add behavioral guidance: always check for duplicates before creating, explain add-only policy (no delete/rename), guide multi-step creation workflows.

**Defer (include if time permits, all Low complexity):**
- Model-specific timeout adjustment
- Visual model indicator pill
- Case-insensitive duplicate comparison (should actually just include this -- it is 2 words of SQL)

## Complexity Assessment

| Feature | Estimated Effort | Risk |
|---------|-----------------|------|
| Model list tRPC query endpoint | ~20 lines | None -- static data |
| Client model dropdown (native select) | ~30 lines | Low -- standard HTML select, mobile-friendly |
| Agent-service model parameter | ~10 lines changed | Low -- swap hardcoded string for parameter |
| create_category_group tool | ~30 lines | Low -- mirrors existing action tools pattern |
| create_category tool | ~35 lines | Low -- mirrors existing action tools pattern |
| Duplicate validation (both tools) | ~10 lines each | Low -- simple SQL check |
| Confirmation flow integration | ~0 new lines (reuse existing) | None -- pattern already works |
| System prompt additions | ~20 lines of prompt text | Low -- behavioral, not code |
| **Total** | **~170 lines new/changed** | **Low overall** |

## Edge Cases to Handle

### Model Selector
- **Model unavailable / API error**: Agent-service already catches errors and returns user-friendly message; model-specific errors (e.g., Opus access denied) surface naturally through existing error handling
- **Empty/missing model in request**: Default to Sonnet (current behavior) if model field is omitted -- backward compatible
- **Model list staleness**: Static server list; update model IDs in server code when Anthropic releases new versions (no dynamic discovery needed)
- **Switching model mid-conversation**: Allow it. SDK sessions maintain context. Different model may give different quality answers but that is the user's choice

### Category Creation
- **Duplicate category name in same group**: Block with clear error ("Groceries already exists in Food & Drink")
- **Duplicate category name in different group**: Allow -- reasonable to have "Other" in multiple groups
- **Duplicate group name**: Block with clear error ("A group named Bills already exists")
- **Empty name**: Validate non-empty string in Zod schema (`.min(1)`)
- **Group does not exist when creating category**: Validate group_id exists before INSERT (same pattern as existing `categoryExists` helper)
- **Very long names**: Cap at 100 characters to prevent UI overflow in category dropdowns
- **Creating category then immediately using it**: Works naturally -- tool returns `{ id, name }`, agent uses returned ID in next tool call within same turn
- **No groups exist at all**: Unlikely (app ships with groups), but agent should guide user to create_group first

## Sources

- Existing codebase analysis: `category-service.ts` (createCategory, createGroup already exist), `action-tools.ts` (established tool wrapper pattern), `agent-service.ts` (hardcoded model on line 23, 30s timeout), `ChatPage.tsx` (parseConfirmation, confirmation buttons), `agent-router.ts` (tRPC input schema), `system-prompt.ts` (current prompt structure)
- Database schema: `001-initial-schema.sql` (no UNIQUE on category/group names, CASCADE deletes)
- PROJECT.md: v2.5 target features, out-of-scope items (no delete/rename via agent, no streaming)

---
*Feature research for: Chat Agent Model Selector and Category Creation Tools*
*Researched: 2026-03-24*
