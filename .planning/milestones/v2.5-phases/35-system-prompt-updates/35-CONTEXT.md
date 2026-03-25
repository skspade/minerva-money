# Phase 35: System Prompt Updates - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Agent follows behavioral guidance for category creation and directs users to UI for destructive operations. This phase updates the system prompt in `system-prompt.ts` to document the two new creation tools (`create_category_group`, `create_category`), require the agent to check for existing categories before creating, require confirmation before creation, and direct users to the Categories page for delete/rename operations. No new tools or service code -- purely prompt engineering.

</domain>

<decisions>
## Implementation Decisions

### Tool Documentation in System Prompt (SYS-01)
- Add a new "Category Management" section to the system prompt documenting both `create_category_group` and `create_category` tools
- Document the parameters each tool accepts (name for groups; groupId and name for categories)
- Instruct the agent to use `list_categories` to look up existing group IDs before creating a category (Claude's Decision: agent needs group IDs to pass to create_category, and listing first satisfies the dedup-check requirement)

### Confirmation Requirement (SYS-02)
- Add explicit instruction that before creating a category or group, the agent must present a confirmation block using the same JSON format as budget confirmations
- Reference the existing confirmation block pattern already in the prompt (rule 12) so the agent treats category creation identically to budget changes
- Confirmation block uses `"action": "create_category_group"` or `"action": "create_category"` with a descriptive `"description"` field

### Destructive Operations Redirect (SYS-03)
- Add explicit instruction that the agent cannot delete or rename categories or category groups
- When the user asks to delete or rename, the agent should direct them to the Categories page in the UI
- Include the exact phrasing pattern for the redirect (Claude's Decision: concrete example text prevents the agent from being vague about where to go)

### Proactive Duplicate Check (SYS-04)
- Instruct the agent to always call `list_categories` before attempting to create a category or group to check for existing matches
- If a match is found, the agent should suggest using the existing category instead of creating a new one
- This is a behavioral instruction complementing the server-side duplicate validation in the tools themselves (Claude's Decision: defense in depth -- prompt-level guidance prevents the tool error path from being the primary dedup mechanism)

### Prompt Structure
- Add a new `## Category Management` section after the existing `## Budget Confirmations` section (Claude's Decision: logical grouping -- category creation is a write operation similar in weight to budget changes)
- Use numbered rules continuing from the existing numbering (currently ends at rule 13) (Claude's Decision: consistent numbering with the rest of the prompt makes rules easy to reference)
- Keep the section concise -- 4-5 rules covering all four SYS requirements

### Testing Approach
- Test that `getSystemPrompt()` output contains the new behavioral instructions (Claude's Decision: simple string-contains tests verify the prompt text was added without testing LLM behavior)
- No integration tests for agent behavior -- the prompt guidance is validated by checking the prompt content, not by running the agent (Claude's Decision: testing LLM behavioral compliance is non-deterministic and out of scope for unit tests)

### Claude's Discretion
- Exact wording of each rule within the new section
- Whether to use a single numbered list or sub-bullets for the confirmation block examples
- Exact example text for the Categories page redirect message
- Rule numbering scheme if rules are renumbered vs appended

</decisions>

<specifics>
## Specific Ideas

- The system prompt in `system-prompt.ts` currently has 13 numbered rules organized into sections: Domain Knowledge, Rules, Write Operations, Budget Confirmations
- The confirmation block pattern (lines 38-44) uses `{ "type": "confirmation", "action": "...", "description": "..." }` -- category creation confirmations should match this exactly
- The `list_categories` query tool (in `query-tools.ts`) already returns all groups with their categories and IDs -- the agent can call this to check for duplicates before creating
- PROJECT.md explicitly states: "Category deletion/rename via agent -- UI concern with sort ordering; creation is safe but destructive ops stay in UI"
- REQUIREMENTS.md Out of Scope table: "Category deletion via agent -- Destructive op affecting sort order, budgets, transactions -- belongs in UI" and "Category rename via agent -- Rare operation with UI implications -- Categories page sufficient"

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/agent/system-prompt.ts`: The `getSystemPrompt()` function and `SYSTEM_PROMPT` constant -- this is the sole file to modify
- `packages/server/src/agent/tools/action-tools.ts`: Already has `create_category_group` and `create_category` tools with server-side duplicate validation -- the prompt guidance complements these checks
- `packages/server/src/agent/tools/query-tools.ts`: Has `list_categories` tool that returns all groups and categories -- referenced in the prompt for proactive dedup checks

### Established Patterns
- System prompt uses numbered rules organized by topic section (Domain Knowledge, Rules, Write Operations, Budget Confirmations)
- Confirmation-required operations have both a prompt rule (rule 12 for budgets) and a tool description ("Requires user confirmation before calling")
- Write operation rules (9-11) describe post-action behavior and validation expectations -- category creation rules should follow the same style

### Integration Points
- `system-prompt.ts` exports `getSystemPrompt()` consumed by `agent-service.ts` when creating the agent session -- no wiring changes needed
- The client ChatPage already handles confirmation blocks generically via `type: "confirmation"` parsing -- no client changes needed
- The category creation tools in `action-tools.ts` already include "Requires user confirmation before calling" in their description strings (added in Phase 34)

</code_context>

<deferred>
## Deferred Ideas

- Model selector UI -- Phase 36 scope
- Category deletion/rename via agent -- explicitly out of scope per PROJECT.md and REQUIREMENTS.md
- Category reorder via agent -- explicitly out of scope per REQUIREMENTS.md
- Free-text group assignment with fuzzy matching -- explicitly out of scope per REQUIREMENTS.md
- Agent proactively suggesting categories based on transaction patterns -- not in any requirements

</deferred>

---

*Phase: 35-system-prompt-updates*
*Context gathered: 2026-03-24 via auto-context*
