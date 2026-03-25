# Phase 35: System Prompt Updates - Research

**Researched:** 2026-03-24
**Status:** Complete
**Discovery Level:** 0 (pure internal work, established patterns)

## Phase Boundary

Update the system prompt in `system-prompt.ts` to add behavioral guidance for category creation tools and redirect destructive operations to the UI. No new tools, services, or client code.

## Codebase Analysis

### Current System Prompt Structure

File: `packages/server/src/agent/system-prompt.ts`

The prompt has 4 sections with 13 numbered rules:
- **Domain Knowledge** (unnumbered): Institutions, envelope budgeting concepts
- **Rules** (1-8): Data retrieval, formatting, concise answers, read-only tool guidance
- **Write Operations** (9-11): Post-action descriptions, delete confirmation, input validation
- **Budget Confirmations** (12-13): Confirmation block pattern, dollar-to-cents conversion

The `getSystemPrompt()` function appends today's date to the constant.

### Existing Confirmation Block Pattern

Rule 12 uses this exact JSON format:
```json
{ "type": "confirmation", "action": "set_budget_allocation", "description": "Set Groceries budget to $500.00 for 2026-03" }
```

Category creation confirmations should use the same `"type": "confirmation"` pattern with `"action": "create_category_group"` or `"action": "create_category"`.

### Available Tools (Phase 34)

- `create_category_group` — Takes `name`, has server-side duplicate check
- `create_category` — Takes `groupId` and `name`, has server-side duplicate check and group existence check
- `list_categories` — Returns all groups with categories and IDs (query tool, no confirmation needed)

Both creation tools already include "Requires user confirmation before calling" in their SDK tool descriptions.

### Integration Points

- `getSystemPrompt()` is consumed by `agent-service.ts` line 22 — no wiring changes needed
- Client `ChatPage` handles confirmation blocks generically via `type: "confirmation"` — no client changes needed
- The creation tools in `action-tools.ts` already have server-side validation — prompt guidance is defense-in-depth

## Implementation Strategy

### New Section: Category Management

Add a `## Category Management` section after `## Budget Confirmations`, continuing rule numbering from 14:

- **Rule 14**: Before creating a category or group, call `list_categories` to check for duplicates. If match found, suggest existing instead.
- **Rule 15**: Before creating a category or group, present a confirmation block with `"action": "create_category_group"` or `"action": "create_category"`.
- **Rule 16**: The agent cannot delete or rename categories or category groups. Direct users to the Categories page.

This covers all 4 SYS requirements:
- SYS-01 (tool documentation): Rules 14-15 document tool usage
- SYS-02 (confirmation requirement): Rule 15
- SYS-03 (destructive ops redirect): Rule 16
- SYS-04 (duplicate check): Rule 14

### Testing Approach

Create `packages/server/src/agent/system-prompt.test.ts` with string-contains tests:
- Verify `getSystemPrompt()` output contains "Category Management" section
- Verify duplicate check instruction exists
- Verify confirmation block examples exist
- Verify destructive operations redirect exists
- Verify Categories page mention exists

No behavioral/LLM integration tests — prompt content verification only.

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Agent ignores prompt guidance | Low | Server-side validation in tools provides backup |
| Confirmation block format mismatch | Low | Use exact same JSON format as budget confirmations |
| Rule numbering collision | None | Current rules end at 13, new rules start at 14 |

## Dependencies

- Phase 34 (complete): `create_category_group` and `create_category` tools exist
- No external dependencies

---

*Phase: 35-system-prompt-updates*
*Research completed: 2026-03-24*
