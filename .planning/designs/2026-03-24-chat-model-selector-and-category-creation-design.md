# Chat Feature Enhancements — Model Selector and Category Creation — Design

**Date:** 2026-03-24
**Approach:** Server-Driven Configuration

## Server Model Configuration Endpoint

Add a new tRPC query `agent.models` that returns the available model options. This keeps the model list centralized on the server.

**Router addition** (`agent-router.ts`):
- New query `models` returning `Array<{ id: string, label: string }>` — e.g. `[{ id: 'claude-haiku-3-5-20241022', label: 'Haiku' }, { id: 'claude-sonnet-4-20250514', label: 'Sonnet' }, { id: 'claude-opus-4-20250514', label: 'Opus' }]`
- Default model is Sonnet (current behavior)

**Mutation change** (`agent.chat`):
- Add optional `model: z.string()` to the input schema
- Pass model through to `agent-service.ts` `chat()` function
- Validate that the model ID is in the allowed list; reject unknown models

**Service change** (`agent-service.ts`):
- Accept optional `model` parameter, default to `'claude-sonnet-4-20250514'`
- Use the provided model in the `query()` options
- Session resets when model changes (per design decision)

## Model Selector UI

**Component**: A compact dropdown/select above the input bar in `ChatPage.tsx`.

**Layout** (mobile-first):
```
+-----------------------------------+
|  Message area (scrollable)        |
|                                   |
+-----------------------------------+
|  [Model: Sonnet v]                |  <- new row, left-aligned
+-----------------------------------+
|  [Ask about your finances...][Send] |
+-----------------------------------+
```

**Behavior:**
- Fetches model list from `agent.models` query on mount
- Stores selected model in React state, defaults to Sonnet
- When model changes: clears messages, resets `sessionId` to `undefined`
- Shows a brief toast/notice: "Switched to {model} -- starting new conversation"
- Disabled while a chat mutation is pending (prevents mid-response model switch)
- Styled as a small `<select>` with Tailwind classes matching the existing input bar aesthetic (gray border, rounded, text-sm)

**Mobile considerations:**
- Native `<select>` element uses the OS picker on mobile (iOS action sheet, Android spinner) -- better than a custom dropdown
- Sits on its own row so it doesn't crowd the input+send on narrow screens

## Category Creation Agent Tools

**Two new tools** added to `action-tools.ts`:

**`create_category_group`:**
- Parameters: `name: z.string()` (group name)
- Validation: Check for duplicate group name (case-insensitive)
- Calls `createGroup(db, name)` from `category-service.ts`
- Returns `{ success: true, group: { id, name } }`
- Requires confirmation via system prompt (same pattern as budget changes)

**`create_category`:**
- Parameters: `groupId: z.number()`, `name: z.string()` (category name)
- Validation: Check group exists, check for duplicate category name within group (case-insensitive)
- Calls `createCategory(db, groupId, name)` from `category-service.ts`
- Returns `{ success: true, category: { id, name } }`
- Requires confirmation via system prompt

**Explicitly NOT added** (per requirements -- add only, not delete):
- No `delete_category` or `delete_category_group` tools
- No `rename_category` or `rename_group` tools (keep scope tight)

**Duplicate validation** (Approach 2 extra validation):
- Query `SELECT id FROM category_groups WHERE LOWER(name) = LOWER(?)` before creating group
- Query `SELECT id FROM categories WHERE group_id = ? AND LOWER(name) = LOWER(?)` before creating category
- Return descriptive error if duplicate found: "Category group 'Food & Drink' already exists (id: 3)"

## System Prompt Updates

Update `system-prompt.ts` to inform the agent about the new category creation tools and their confirmation requirements.

**Additions to the system prompt:**

1. **Tool documentation section** -- Add `create_category` and `create_category_group` to the list of available action tools with descriptions

2. **Confirmation requirement** -- Add these tools to the confirmation flow instructions:
   > "Before creating a category or category group, present a confirmation block with the action details so the user can approve or cancel."

   Uses the same JSON confirmation block pattern already used for budget changes:
   ```json
   { "type": "confirmation", "action": "create_category", "description": "Create category 'Pet Supplies' in group 'Shopping'" }
   ```

3. **Behavioral guidance** -- Add instruction:
   > "You can create categories and category groups but cannot delete or rename them. If asked to delete or rename, direct the user to the Categories page."

**No changes** to the confirmation parsing in `ChatPage.tsx` -- the existing `parseConfirmation()` function handles any confirmation block generically.

## Integration & Wiring

**Files modified (summary):**

| File | Change |
|------|--------|
| `packages/server/src/agent/agent-router.ts` | Add `models` query, add `model` param to `chat` mutation with validation |
| `packages/server/src/agent/agent-service.ts` | Accept `model` param, use it in `query()` options |
| `packages/server/src/agent/tools/action-tools.ts` | Add `create_category` and `create_category_group` tools with duplicate validation |
| `packages/server/src/agent/system-prompt.ts` | Add category creation tool docs, confirmation requirements, behavioral guidance |
| `packages/client/src/pages/ChatPage.tsx` | Add model selector dropdown, fetch models query, pass model to mutation, reset on model change |

**No new files created.** All changes are additions to existing files.

**Model list definition** -- Defined once in `agent-router.ts` as a constant array. Used by both the `models` query (returns the list) and the `chat` mutation (validates against it).

**Testing considerations:**
- Existing `action-tools.test.ts` can be extended with tests for the new category tools
- Model validation is a simple allowlist check -- tested via the mutation
