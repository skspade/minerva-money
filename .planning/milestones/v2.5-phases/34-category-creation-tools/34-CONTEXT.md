# Phase 34: Category Creation Tools - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Agent can create categories and category groups during conversation with safety validation. This phase adds two new MCP tools (`create_category_group` and `create_category`) to the agent's action tool set, with case-insensitive duplicate name validation, group existence checks, and user confirmation via the existing JSON confirmation block pattern. Newly created categories must be immediately usable for categorization in the same conversation turn.

</domain>

<decisions>
## Implementation Decisions

### Tool Definitions (CAT-01, CAT-02)
- New `create_category_group` tool with a single `name` parameter (z.string)
- New `create_category` tool with `groupId` (z.number) and `name` (z.string) parameters
- Both tools are added to the `createActionTools` array in `action-tools.ts`, following the existing pattern of importing service functions and wrapping with validation
- Both tools return the created entity's `id` and `name` in the success response via `jsonResult()` (Claude's Decision: returning the id allows the agent to immediately use it for follow-up operations like categorization)

### Duplicate Name Validation (CAT-03, CAT-04)
- `create_category_group` checks for existing group with same name (case-insensitive) before inserting
- `create_category` checks for existing category with same name within the same group (case-insensitive) before inserting
- Case-insensitive comparison via SQL `LOWER()` function on both sides of the equality check (Claude's Decision: SQLite LOWER() handles ASCII which covers category names; avoids needing COLLATE NOCASE column changes)
- When a duplicate is found, return an `errorResult` message that names the existing item and its ID so the agent can suggest it to the user (Claude's Decision: providing the existing ID lets the agent say "X already exists, would you like to use it?")

### Group Existence Validation (CAT-05)
- `create_category` validates that the target `groupId` exists before attempting insertion
- Uses a simple `SELECT id FROM category_groups WHERE id = ?` check, consistent with the existing `categoryExists()` helper pattern in `action-tools.ts`
- Returns an `errorResult` if the group does not exist

### Confirmation Flow (CAT-06)
- Both creation tools require user confirmation via the existing JSON confirmation block pattern used for budget changes
- The tool descriptions include "Requires user confirmation before calling" to instruct the agent (Claude's Decision: matches the exact phrasing used in `set_budget_allocation` and `set_default_allocation` tool descriptions)
- The agent should emit a confirmation block like `{ "type": "confirmation", "action": "create_category_group", "description": "Create category group 'Travel'" }` before calling the tool
- No changes needed to the client-side confirmation UI -- it already parses the JSON confirmation block generically (Claude's Decision: the ChatPage confirmation parsing works on the `type: "confirmation"` field, not on specific action names)

### Immediate Usability (CAT-07)
- Both tools return the newly created entity's `id` in the response, which the agent can pass directly to `categorize_transaction` or `create_rule` within the same turn
- No special mechanism needed -- SQLite writes are synchronous via better-sqlite3, so the created category is queryable immediately after insertion

### Validation Helper Functions
- Add `groupExists(db, groupId)` helper alongside existing `categoryExists()` and `ruleExists()` in `action-tools.ts` (Claude's Decision: follows the established helper pattern in the same file)
- Add `duplicateGroupName(db, name)` and `duplicateCategoryName(db, groupId, name)` helpers for the case-insensitive checks (Claude's Decision: keeps validation logic readable and testable separate from tool handler)

### Testing
- Add tests for both new tools in `action-tools.test.ts` following the existing test patterns
- Test cases: successful creation, duplicate name rejection (case-insensitive), group-not-found rejection, result contains id and name (Claude's Decision: mirrors the validation paths in the tool implementations)

### Claude's Discretion
- Exact error message wording for duplicate and not-found cases
- Whether helper functions are inline or extracted to `tool-helpers.ts`
- Test fixture category/group names
- Order of the new tools within the `createActionTools` array

</decisions>

<specifics>
## Specific Ideas

- The existing `createGroup()` and `createCategory()` functions in `category-service.ts` already handle sort_order auto-increment and return `{ id, name }` -- the tools wrap these directly with validation
- The confirmation block pattern in the system prompt (lines 38-44 of `system-prompt.ts`) uses `"type": "confirmation"` with `"action"` and `"description"` fields -- new tools should follow this exact structure
- Tool descriptions should say "Requires user confirmation before calling" to match the pattern at line 142 and 162 of `action-tools.ts` (set_budget_allocation, set_default_allocation)
- The `action-tools.test.ts` file already has test infrastructure with in-memory SQLite setup -- new tests extend this
- Out of scope per PROJECT.md: category deletion/rename via agent -- "creation is safe but destructive ops stay in UI"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/categories/category-service.ts`: `createGroup(db, name)` and `createCategory(db, groupId, name)` -- ready to use, already return `{ id, name }`
- `packages/server/src/categories/category-service.ts`: `listGroupsWithCategories(db)` -- can be used for duplicate checking queries if needed
- `packages/server/src/agent/tools/tool-helpers.ts`: `jsonResult()` and `errorResult()` helpers -- standard response wrappers for all tools
- `packages/server/src/agent/tools/action-tools.ts`: `categoryExists()` and `ruleExists()` helpers -- pattern to follow for `groupExists()`
- `packages/server/src/agent/system-prompt.ts`: Existing confirmation flow instructions -- Phase 35 will add category-specific guidance here

### Established Patterns
- All action tools follow the same structure: validate inputs, call service function, return `jsonResult` on success or `errorResult` on failure
- Tools use Zod schemas for parameter validation via the `tool()` function from `@anthropic-ai/claude-agent-sdk`
- Confirmation-required tools include "Requires user confirmation before calling" in their description string
- Error messages in tools are descriptive (e.g., "Category 5 not found") to help the agent explain failures to the user

### Integration Points
- `action-tools.ts` exports `createActionTools(db, ctx)` which returns the tool array consumed by `mcp-server.ts` -- new tools are added to this array
- The agent's system prompt in `system-prompt.ts` documents tool usage -- Phase 35 will add guidance for these new tools (separate scope)
- The client `ChatPage` parses JSON confirmation blocks from agent responses -- works generically on `type: "confirmation"`, no client changes needed
- Created categories become immediately available to `categorize_transaction` and `create_rule` tools via direct DB queries

</code_context>

<deferred>
## Deferred Ideas

- System prompt updates documenting the new tools and behavioral guidance -- Phase 35 scope
- Agent checking for existing categories before creating (proactive dedup) -- Phase 35 scope (SYS-04)
- Agent directing users to Categories page for delete/rename -- Phase 35 scope (SYS-03)
- Category deletion/rename via agent -- explicitly out of scope per PROJECT.md
- Category reorder via agent -- explicitly out of scope per REQUIREMENTS.md
- Free-text group assignment with fuzzy matching -- explicitly out of scope per REQUIREMENTS.md

</deferred>

---

*Phase: 34-category-creation-tools*
*Context gathered: 2026-03-24 via auto-context*
