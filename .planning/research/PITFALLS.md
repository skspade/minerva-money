# Domain Pitfalls

**Domain:** Adding model selector and category creation tools to existing Claude Agent SDK chat system
**Researched:** 2026-03-24

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Model Change Breaks Active Session

**What goes wrong:** The Claude Agent SDK `query()` function accepts a `model` parameter and the current code stores a `sessionId` for conversation continuity. If the user switches models mid-conversation (e.g., Haiku to Opus), the session was initialized with the previous model. Passing a different model to `resume` with an existing `sessionId` may cause the SDK to either error or silently ignore the model change, leading to confusing behavior where the user thinks they switched but the old model is still responding.

**Why it happens:** The `agent-service.ts` hardcodes `model: 'claude-sonnet-4-20250514'` in the options object and passes `resume: sessionId` for continuity. Sessions in the Claude Agent SDK are bound to configuration at creation time. The model is part of that configuration.

**Consequences:** User selects Opus expecting higher quality answers but still gets Sonnet responses. Or the SDK throws an error and the conversation breaks entirely. Either outcome destroys trust in the model selector feature.

**Prevention:** When the model changes, clear the `sessionId` and start a fresh session. The client should detect model changes and reset. Specifically:
1. Store the `selectedModel` alongside `sessionId` in ChatPage state
2. When the user changes the model dropdown, call `setSessionId(undefined)` to force a new session
3. Optionally show a subtle indicator that "switching models starts a new conversation"

**Detection:** Test by switching models mid-conversation and verifying the response headers or behavior match the newly selected model. Check if the SDK throws when resuming a session with a different model parameter.

**Phase:** Must be addressed in the model selector phase, not deferred.

### Pitfall 2: Duplicate Category Names Without Database Constraint

**What goes wrong:** The `categories` and `category_groups` tables have NO UNIQUE constraint on `name` (confirmed in `001-initial-schema.sql`). The existing `createCategory` and `createGroup` service functions perform no duplicate checking -- they just INSERT. If the agent creates a category that already exists, you get two "Groceries" categories with different IDs, causing budget confusion, incorrect spending reports, and rules pointing to the wrong one.

**Why it happens:** The original UI-driven category creation likely relied on the user visually checking for duplicates. The agent has no such visual context. When a user says "create a Groceries category," the agent will blindly call `createCategory` without checking if one already exists. The LLM might sometimes check via `list_categories` first, but system prompt instructions are not reliable enforcement.

**Consequences:** Duplicate categories corrupt the data model silently. Transactions split across two identically-named categories. Budget allocations on the wrong one. Spending reports show misleading numbers. Cleanup requires manual SQL or careful UI work to merge.

**Prevention:** Duplicate validation MUST be in the tool implementation, not in the system prompt. The `create_category` and `create_category_group` tool handlers must:
1. Query existing categories/groups by name (case-insensitive: `WHERE LOWER(name) = LOWER(?)`)
2. If a match exists, return an error result like `"Category 'Groceries' already exists (id: 5) in group 'Monthly Bills'"`
3. Include the existing ID so the agent can suggest using the existing one instead

**Detection:** Unit test that calls `create_category` twice with the same name and verifies the second call returns an error, not a new row.

**Phase:** Must be addressed in the category creation tool phase. This is the tool's primary validation concern.

### Pitfall 3: Agent Creates Category Then Fails to Use It

**What goes wrong:** A user says "Create a Pet Supplies category and categorize these three transactions under it." The agent creates the category (getting back a new ID), but then uses the wrong ID for subsequent `categorize_transaction` calls -- either hallucinating an ID or losing track of the returned ID across tool calls.

**Why it happens:** LLMs handle multi-step tool workflows imperfectly. The agent must: (1) create category, (2) read the returned ID from the tool result, (3) use that exact ID in subsequent tool calls. With `maxTurns: 10`, this is within bounds, but the model may confuse IDs if many categories exist.

**Consequences:** Transactions get categorized under the wrong category. The user asked for a specific workflow and got a silent miscategorization.

**Prevention:**
1. The `create_category` tool result must clearly return `{ success: true, id: 42, name: "Pet Supplies", groupId: 3 }` -- all identifying information
2. System prompt should include guidance: "After creating a category, use the returned ID for any follow-up operations"
3. Keep the tool result format simple and unambiguous (the current `jsonResult` pattern is fine for this)
4. Consider returning the full category list after creation so the agent has fresh context

**Detection:** Integration test: send a multi-step message like "create a Subscriptions category in Monthly Bills and categorize transaction X under it" and verify the transaction ends up in the correct new category.

**Phase:** Address in system prompt updates phase. The tool implementation naturally handles this if the return value is clear.

## Moderate Pitfalls

### Pitfall 4: Model Selector Leaks API Key Awareness to Client

**What goes wrong:** The model list endpoint returns model IDs (like `claude-haiku-3-5-20241022`) and the client sends the selected model back. Developers might be tempted to let the client specify arbitrary model strings, which could cause cryptic Anthropic API errors if the model string is malformed.

**Prevention:** Server-driven model list with a fixed allowlist. The tRPC endpoint returns `[{ id: "haiku", label: "Haiku (fast)", model: "claude-haiku-3-5-20241022" }]` and the client sends only the short `id` back. The server maps the `id` to the real model string. Never trust client-provided model identifiers directly.

### Pitfall 5: Confirmation Flow Not Extended to Category Creation

**What goes wrong:** The existing confirmation pattern (JSON block in response, parsed by `parseConfirmation` in ChatPage) is used for budget changes. Category creation is a write operation that creates persistent data. If the agent creates categories without confirmation, the user might get unwanted categories from ambiguous requests ("maybe I should add a category for that").

**Prevention:** Category and group creation should follow the same confirmation pattern as budget changes. Update the system prompt to require a confirmation block before calling `create_category` or `create_category_group`. The existing `parseConfirmation` function and confirm/cancel button UI already handle the generic pattern -- just need the system prompt rules and new `action` types like `"create_category"` and `"create_category_group"`.

### Pitfall 6: Group ID Resolution Ambiguity

**What goes wrong:** When the user says "create a Coffee category," the agent needs to know which category group to put it in. If the agent guesses wrong (puts "Coffee" in "Income" instead of "Dining & Drinks"), the category ends up in the wrong group. The agent must first call `list_categories` to see the groups, then pick the right one.

**Prevention:**
1. The `create_category` tool should require `groupId` as a parameter (not group name -- IDs are unambiguous)
2. System prompt guidance: "Before creating a category, call list_categories to find the appropriate group. If the user doesn't specify a group, ask which group to use or suggest the most logical one"
3. If the user says "add Coffee to Dining," the agent should resolve "Dining" to a group ID first

### Pitfall 7: 30-Second Timeout Too Short for Opus

**What goes wrong:** The current `agent-service.ts` has a 30-second timeout via `Promise.race`. Claude Opus is significantly slower than Sonnet, especially on complex multi-tool queries. If the user selects Opus and asks a complex question requiring multiple tool calls, the 30-second timeout fires and the user gets "Agent query timed out."

**Why it happens:** The timeout was tuned for Sonnet. Opus can take 2-3x longer per response, and with `maxTurns: 10` allowing multiple sequential tool calls, total wall time can easily exceed 30 seconds.

**Prevention:** Scale the timeout based on the selected model:
- Haiku: 30 seconds (fast, keep tight)
- Sonnet: 45 seconds (current model, slight buffer)
- Opus: 90 seconds (slower but higher quality)

Alternatively, use a single generous timeout (90s) since this is a single-user app with no resource contention concerns.

### Pitfall 8: Mobile Dropdown Overlapping Chat Input

**What goes wrong:** Adding a model selector dropdown above the chat input bar on mobile creates layout issues. The `ChatPage` uses `h-[calc(100dvh-56px)]` for full-height layout with a flex column. Adding another element between the message area and input bar compresses the message area or causes the dropdown to overlap with the keyboard on mobile Safari.

**Prevention:** Use a native `<select>` element for mobile (not a custom dropdown). Place it in a thin bar above the textarea, within the existing input bar `<div>`. Keep it compact -- just the select element, no labels. The `pb-[max(0.75rem,env(safe-area-inset-bottom))]` safe area handling should still work since the select is inside the existing input container.

## Minor Pitfalls

### Pitfall 9: System Prompt Bloat from New Tool Guidance

**What goes wrong:** Adding behavioral guidance for two new tools (create_category, create_category_group) plus model-specific instructions inflates the system prompt. The current prompt is well-structured at ~47 lines. Adding too much text degrades the LLM's ability to follow all instructions consistently.

**Prevention:** Keep new instructions to 3-5 lines maximum. Rely on tool descriptions for usage guidance (the existing pattern -- tool descriptions are already detailed). Only add system prompt rules for behavior that cannot be encoded in the tool itself (like the confirmation requirement).

### Pitfall 10: TanStack Query Cache Stale After Category Creation

**What goes wrong:** If the user creates a category via the chat agent, other pages (BudgetPage, CategoriesPage, TransactionsPage) that use TanStack Query to fetch categories will show stale data until manually refreshed. The user creates "Pet Supplies" in chat, navigates to the Budget page, and it is not there.

**Prevention:** The chat mutation's `onSuccess` handler should invalidate category-related queries. Simplest approach: invalidate category queries on every chat response (cheap since it is a single-user app with fast SQLite reads). This avoids needing to parse the response to detect whether a category was created.

### Pitfall 11: Model List Endpoint Hardcoded and Stale

**What goes wrong:** Anthropic periodically releases new model versions and deprecates old ones. If the model list is hardcoded in the server, deploying an update is required to add new models.

**Prevention:** This is acceptable for a single-user home server app -- just update the list when deploying. Do not over-engineer with dynamic model discovery from the Anthropic API. A simple array constant in a config file is sufficient and easy to update.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Model selector endpoint | Pitfall 4: Client sends raw model string | Server-side allowlist, client sends short ID only |
| Model selector UI | Pitfall 8: Mobile layout breakage | Native `<select>`, inside existing input bar container |
| Model switching behavior | Pitfall 1: Session bound to old model | Clear sessionId on model change |
| Model switching behavior | Pitfall 7: Opus timeout | Scale timeout per model or use generous default |
| Category creation tool | Pitfall 2: Duplicate names | Validate in tool handler, case-insensitive check |
| Category creation tool | Pitfall 6: Wrong group assignment | Require groupId parameter, prompt guides agent to look up groups first |
| Category creation confirmation | Pitfall 5: No confirmation for creates | Extend existing confirmation pattern to new tools |
| System prompt updates | Pitfall 9: Prompt bloat | Minimal additions, lean on tool descriptions |
| System prompt updates | Pitfall 3: ID tracking across tool calls | Clear return values, brief prompt guidance |
| Post-creation UX | Pitfall 10: Stale cache on other pages | Invalidate category queries after chat responses |

## "Looks Done But Isn't" Checklist

- [ ] **Session reset on model change:** Verify switching the dropdown clears sessionId and starts a fresh conversation
- [ ] **Timeout scaling:** Verify Opus queries do not hit the 30s timeout on multi-tool requests
- [ ] **Duplicate category rejection:** Call create_category with an existing name and verify error response (not a second row)
- [ ] **Case-insensitive duplicate check:** "groceries" vs "Groceries" should be caught as duplicate
- [ ] **Group-scoped duplicate check:** Same category name in different groups is valid (e.g., "Other" in multiple groups)
- [ ] **Confirmation flow for creates:** Verify the agent emits a confirmation JSON block before creating a category
- [ ] **New category ID propagation:** Create category then use it in same conversation -- verify correct ID used
- [ ] **Mobile layout:** Test model selector on mobile Safari with keyboard open -- no layout shift or overlap
- [ ] **Cache invalidation:** Create category via chat, navigate to Categories page, verify it appears without manual refresh
- [ ] **Model allowlist enforcement:** Send an invalid model ID from client, verify server rejects with clear error

## Sources

- Direct code analysis: `packages/server/src/agent/agent-service.ts` -- session handling (line 33: `resume: sessionId`), model config (line 23: hardcoded model), timeout (line 42: 30s)
- Direct code analysis: `packages/server/src/agent/tools/action-tools.ts` -- existing tool patterns, validation approach, `categoryExists` helper
- Direct code analysis: `packages/server/src/categories/category-service.ts` -- `createCategory` and `createGroup` have no duplicate checking
- Direct code analysis: `packages/server/migrations/001-initial-schema.sql` -- no UNIQUE constraint on category/group names
- Direct code analysis: `packages/client/src/pages/ChatPage.tsx` -- confirmation parsing (`parseConfirmation`), session state, layout structure, safe-area handling
- Direct code analysis: `packages/server/src/agent/system-prompt.ts` -- current prompt size (~47 lines), confirmation pattern for budget changes
- Claude Agent SDK behavior: session-model binding is based on training knowledge (MEDIUM confidence -- verify with SDK docs during implementation)
- Opus latency characteristics: based on general knowledge of model speed differences (HIGH confidence)

---
*Pitfalls research for: Chat enhancements -- model selector and category creation tools (v2.5)*
*Researched: 2026-03-24*
