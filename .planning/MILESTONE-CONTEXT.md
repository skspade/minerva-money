# Milestone Context

**Source:** Brainstorm session (Chat feature enhancements — model selector and category creation)
**Design:** .planning/designs/2026-03-24-chat-model-selector-and-category-creation-design.md

## Milestone Goal

Enhance the chat feature with a server-driven model selector (Haiku/Sonnet/Opus) and add category/group creation capabilities to the Claude agent, with confirmation flow and duplicate validation.

## Features

### Server Model Configuration Endpoint

Add a new tRPC query `agent.models` that returns the available model options, centralized on the server. Add optional `model` parameter to the `chat` mutation with allowlist validation. Update `agent-service.ts` to accept and use the model parameter, defaulting to Sonnet.

### Model Selector UI

A compact native `<select>` dropdown above the input bar in ChatPage.tsx. Fetches model list from server on mount. Switching models resets the conversation (clears messages, resets sessionId). Disabled while mutation is pending. Mobile-friendly with native OS picker.

### Category Creation Agent Tools

Two new tools in `action-tools.ts`:
- `create_category_group` — creates a category group with case-insensitive duplicate name validation
- `create_category` — creates a category within a group with group existence and duplicate name validation

Both require user confirmation via the existing JSON confirmation block pattern. No delete or rename tools (add-only per requirements).

### System Prompt Updates

Update system prompt to document the new category creation tools, add them to the confirmation flow requirements, and include behavioral guidance that the agent can create but not delete/rename categories (directing users to the Categories page for those operations).

### Integration & Wiring

All changes are additions to 5 existing files. Model list defined as a constant in `agent-router.ts`, used by both the models query and chat mutation validation. Existing confirmation parsing in ChatPage.tsx handles the new tools without modification.
