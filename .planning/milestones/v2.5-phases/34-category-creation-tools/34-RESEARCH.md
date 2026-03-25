# Phase 34: Category Creation Tools - Research

**Researched:** 2026-03-24
**Status:** Complete

## Phase Goal

Agent can create categories and category groups during conversation with safety validation (CAT-01 through CAT-07).

## Existing Code Analysis

### Service Layer (Ready to Use)

`packages/server/src/categories/category-service.ts` already provides:
- `createGroup(db, name)` — returns `{ id, name }`, auto-increments sort_order
- `createCategory(db, groupId, name)` — returns `{ id, name }`, auto-increments sort_order within group
- Both functions handle sort_order via `COALESCE(MAX(sort_order), -1) + 1`
- No duplicate-name validation exists at the service layer — tools must add this

### Tool Layer Pattern (action-tools.ts)

Current structure in `packages/server/src/agent/tools/action-tools.ts`:
- 10 tools exported via `createActionTools(db, ctx)` array
- Helper functions at module top: `categoryExists(db, id)`, `ruleExists(db, id)` — simple SELECT queries returning boolean
- All tools follow: validate → call service → `jsonResult()` on success / `errorResult()` on failure
- Confirmation-required tools (`set_budget_allocation`, `set_default_allocation`) include "Requires user confirmation before calling." in description
- Tools use `z` (Zod) schemas for parameter validation

### Test Pattern (action-tools.test.ts)

- Uses `createDatabase()` for in-memory SQLite with migrations
- `tmpDir` + cleanup in beforeEach/afterEach
- `findTool(name)` helper to locate tool by name and call `.handler(args)`
- `parseResult(result)` helper to parse JSON from tool response
- Tests check: `isError` undefined for success, `isError === true` for failures, content text assertions
- Currently 10 tools, test validates exact tool count and name list

### Confirmation Flow (system-prompt.ts)

- Lines 38-44 define the JSON confirmation block format: `{ "type": "confirmation", "action": "...", "description": "..." }`
- Client-side `ChatPage` parses these generically — no new client code needed
- Tool descriptions include "Requires user confirmation before calling." to signal the agent

### Database Schema

- `category_groups`: `id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL`
- `categories`: `id INTEGER PRIMARY KEY, group_id INTEGER NOT NULL REFERENCES category_groups(id), name TEXT NOT NULL, sort_order INTEGER NOT NULL`
- No UNIQUE constraints on names — duplicate prevention must be in application layer
- SQLite `LOWER()` handles ASCII case folding (sufficient for category names)

## Implementation Approach

### New Helper Functions (in action-tools.ts)

1. `groupExists(db, groupId)` — matches `categoryExists()` pattern
2. `duplicateGroupName(db, name)` — `SELECT id, name FROM category_groups WHERE LOWER(name) = LOWER(?)`; returns `{ id, name } | null`
3. `duplicateCategoryName(db, groupId, name)` — `SELECT id, name FROM categories WHERE group_id = ? AND LOWER(name) = LOWER(?)`; returns `{ id, name } | null`

### New Tools

1. `create_category_group` — name param, checks duplicate, calls `createGroup()`, returns `{ id, name }`
2. `create_category` — groupId + name params, checks group exists, checks duplicate within group, calls `createCategory()`, returns `{ id, name }`

Both include "Requires user confirmation before calling." in description.

### Test Updates

- Update tool count from 10 → 12
- Update expected names array to include new tools
- Add `describe('create_category_group')` block with tests for: success, duplicate rejection (case-insensitive), result shape
- Add `describe('create_category')` block with tests for: success, group-not-found, duplicate within group (case-insensitive), result shape

### Immediate Usability (CAT-07)

No special mechanism needed. SQLite writes via better-sqlite3 are synchronous. The returned `id` can be passed to `categorize_transaction` or `create_rule` in the same conversation turn.

## Risk Assessment

- **Low risk**: All changes are additive — new tools, new helpers, new tests
- **No migrations needed**: Schema already supports the operations
- **No client changes**: Confirmation block parsing is generic
- **Single file primary change**: `action-tools.ts` + its test file

## RESEARCH COMPLETE
