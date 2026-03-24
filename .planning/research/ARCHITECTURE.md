# Architecture Patterns

**Domain:** Chat agent enhancements (model selector + category creation tools)
**Researched:** 2026-03-24
**Focus:** Integration with existing Minerva Money architecture

## Current Architecture Summary

```
ChatPage.tsx (React) --> tRPC mutation --> agent-router.ts --> agent-service.ts --> Claude Agent SDK
                                                                                    |
                                                                              mcp-server.ts
                                                                              /            \
                                                                query-tools.ts    action-tools.ts
                                                                (11 tools)        (10 tools)
                                                                                       |
                                                                              category-service.ts
                                                                              rules-service.ts
                                                                              budget-service.ts
                                                                              transfer-service.ts
                                                                              sync-service.ts
```

Key facts from code inspection:
- `agent-service.ts` hardcodes `model: 'claude-sonnet-4-20250514'` on line 23
- `agent-router.ts` accepts `{ message: string, sessionId?: string }` -- no model parameter
- `ChatPage.tsx` sends `{ message, sessionId }` via `chatMutation.mutate()`
- `action-tools.ts` exports `createActionTools(db, ctx)` returning an array of 10 tool objects
- `category-service.ts` already has `createCategory(db, groupId, name)` and `createGroup(db, name)` functions
- `listGroupsWithCategories(db)` is already imported in `query-tools.ts` for the `list_categories` tool
- System prompt in `system-prompt.ts` is a const string with numbered rules (1-13)
- `mcp-server.ts` spreads both `createQueryTools(db)` and `createActionTools(db, ctx)` into the tools array -- new tools added to either array are automatically registered

## Feature 1: Model Selector

### What Changes

This feature touches 4 files (3 modified, 0 new).

#### Modified Files

| File | Change | Complexity |
|------|--------|------------|
| `packages/server/src/agent/agent-router.ts` | Add `model` to chat input schema; add `models` query procedure | Low |
| `packages/server/src/agent/agent-service.ts` | Accept `model` parameter, use it in SDK query options instead of hardcoded string | Low |
| `packages/client/src/pages/ChatPage.tsx` | Add model selector dropdown above input bar, store selected model in state, pass to mutation | Low |

#### No New Files Needed

The model list can be a simple `agent.models` query on the existing `agentRouter`. No separate router or service file warranted for a static list of 3 models.

### Data Flow

```
1. Client loads ChatPage
2. ChatPage calls trpc.agent.models.useQuery() to get available models
3. User selects model from dropdown (default: Sonnet)
4. User sends message
5. chatMutation.mutate({ message, sessionId, model: selectedModel })
6. agent-router.ts maps model key ('sonnet') to API string ('claude-sonnet-4-20250514')
7. agent-router.ts passes API model string to agent-service.ts chat()
8. agent-service.ts uses model string in SDK query options
```

### Component Design

**Server: Model list and mapping**

```typescript
// In agent-router.ts
const AVAILABLE_MODELS = [
  { id: 'haiku', name: 'Haiku', description: 'Fast, lightweight', apiModel: 'claude-haiku-4-20250514' },
  { id: 'sonnet', name: 'Sonnet', description: 'Balanced', apiModel: 'claude-sonnet-4-20250514' },
  { id: 'opus', name: 'Opus', description: 'Most capable', apiModel: 'claude-opus-4-20250514' },
] as const;

export const agentRouter = router({
  models: publicProcedure.query(() => {
    return AVAILABLE_MODELS.map(({ id, name, description }) => ({ id, name, description }));
  }),
  chat: publicProcedure
    .input(z.object({
      message: z.string(),
      sessionId: z.string().optional(),
      model: z.enum(['haiku', 'sonnet', 'opus']).optional().default('sonnet'),
    }))
    .mutation(async ({ ctx, input }) => {
      const modelConfig = AVAILABLE_MODELS.find(m => m.id === input.model)!;
      return chat(ctx.db, ctx, input.message, input.sessionId, modelConfig.apiModel);
    }),
});
```

**Why server-driven model list:** The model list comes from the server so the client never needs updating when models change. The `apiModel` string stays server-side only (never sent to client). This is the pattern PROJECT.md specifies ("centralized model list endpoint").

**Server: agent-service.ts change**

```typescript
// Before: model: 'claude-sonnet-4-20250514' hardcoded
// After: model parameter passed through
export async function chat(
  db: Database.Database,
  ctx: Context,
  message: string,
  sessionId?: string,
  model: string = 'claude-sonnet-4-20250514',
): Promise<ChatResult> {
  // ... existing code ...
  const options: Record<string, unknown> = {
    model,  // was hardcoded, now parameterized
    // ... rest unchanged ...
  };
```

**Client: Model selector in ChatPage.tsx**

```typescript
// New state
const [selectedModel, setSelectedModel] = useState('sonnet');
const modelsQuery = trpc.agent.models.useQuery();

// In the input bar, before the textarea:
<select
  value={selectedModel}
  onChange={e => setSelectedModel(e.target.value)}
  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
>
  {modelsQuery.data?.map(m => (
    <option key={m.id} value={m.id}>{m.name}</option>
  ))}
</select>

// Mutation call updated:
chatMutation.mutate({ message: messageText, sessionId, model: selectedModel });
```

**Why native select:** PROJECT.md specifies "mobile-friendly native select." Native `<select>` renders the OS picker on mobile (iOS scroll wheel, Android dropdown). A custom dropdown would require significant work for equivalent mobile UX and violates the "custom Tailwind components, no component library" convention.

### Key Decision: Model ID Mapping Location

The mapping from user-facing ID (`sonnet`) to API string (`claude-sonnet-4-20250514`) belongs in `agent-router.ts`, NOT in the service. Reason: when Anthropic releases new model versions, you update one const array. The service receives a pre-resolved API model string and does not need to know about the user-facing model IDs.

## Feature 2: Category Creation Tools

### What Changes

This feature touches 2 files (2 modified, 0 new).

#### Modified Files

| File | Change | Complexity |
|------|--------|------------|
| `packages/server/src/agent/tools/action-tools.ts` | Add `create_category` and `create_category_group` tool definitions; add imports for `createCategory`, `createGroup` from category-service | Medium |
| `packages/server/src/agent/system-prompt.ts` | Add rules 14-15 for category creation behavioral guidance | Low |

#### No New Files Needed

The tools follow the exact same pattern as the existing 10 action tools. They import from `category-service.ts` which already exports `createCategory` and `createGroup`. No new service functions needed.

### Data Flow

```
1. User asks agent: "Create a 'Subscriptions' category in the Bills group"
2. Agent calls list_categories tool (existing, in query-tools.ts) to find Bills group ID
3. Agent calls create_category tool with { groupId, name: "Subscriptions" }
4. Tool validates: group exists, no duplicate name (case-insensitive)
5. Tool calls category-service.createCategory(db, groupId, name)
6. Tool returns { success: true, id, name, groupId }
7. Agent reports: "Created 'Subscriptions' category in the Bills group (ID: 42)"
```

### Tool Design

**create_category tool:**

```typescript
tool(
  'create_category',
  'Create a new category within an existing category group. Validates no duplicate name exists in that group.',
  {
    groupId: z.number().describe('Category group ID to add the category to'),
    name: z.string().describe('Category name'),
  },
  async (args) => {
    try {
      const group = db.prepare('SELECT id, name FROM category_groups WHERE id = ?').get(args.groupId);
      if (!group) return errorResult(new Error(`Category group ${args.groupId} not found`));

      const existing = db.prepare(
        'SELECT id FROM categories WHERE group_id = ? AND name = ? COLLATE NOCASE'
      ).get(args.groupId, args.name);
      if (existing) return errorResult(new Error(`Category "${args.name}" already exists in this group`));

      const result = createCategory(db, args.groupId, args.name);
      return jsonResult({ success: true, id: result.id, name: result.name, groupId: args.groupId });
    } catch (error) {
      return errorResult(error);
    }
  },
),
```

**create_category_group tool:**

```typescript
tool(
  'create_category_group',
  'Create a new category group. Validates no group with the same name exists.',
  {
    name: z.string().describe('Category group name'),
  },
  async (args) => {
    try {
      const existing = db.prepare(
        'SELECT id FROM category_groups WHERE name = ? COLLATE NOCASE'
      ).get(args.name);
      if (existing) return errorResult(new Error(`Category group "${args.name}" already exists`));

      const result = createGroup(db, args.name);
      return jsonResult({ success: true, id: result.id, name: result.name });
    } catch (error) {
      return errorResult(error);
    }
  },
),
```

### Duplicate Validation Strategy

Duplicate checking happens in the tool layer, not the service layer. This is consistent with the existing pattern: `action-tools.ts` already does validation checks (`categoryExists`, `ruleExists` helper functions on lines 12-18) before calling service functions. The service layer (`category-service.ts`) does not validate uniqueness -- it lets SQLite handle constraint violations if any. Adding case-insensitive duplicate checking in the tool provides a clear, human-readable error message back to the agent, rather than a raw SQLite error.

**Why case-insensitive:** Users might say "create a Groceries category" when "groceries" already exists. `COLLATE NOCASE` catches this.

### Confirmation Flow Decision

Category/group creation does NOT need the confirmation flow (JSON confirmation block + Confirm/Cancel buttons). Rationale from PROJECT.md: "add-only, no delete/rename." Creation is safe and reversible (user can delete via the Categories UI). The existing confirmation pattern is reserved for budget amount changes which have financial impact. This matches the existing behavior where `create_rule`, `categorize_transaction`, and other write tools auto-execute without confirmation.

### System Prompt Updates

Add to the system prompt after the existing rule 13:

```
## Category Management

14. You can create categories and category groups using create_category and create_category_group. ALWAYS call list_categories first to check what already exists before creating anything. Never create duplicates.
15. You can ONLY create categories and groups. Do NOT attempt to delete, rename, or reorder categories or groups -- those operations are only available in the Categories page UI.
```

## Component Boundary Map

| Component | Current State | v2.5 Change | Changed? |
|-----------|--------------|-------------|----------|
| `agent-router.ts` | 1 mutation (chat) | Add 1 query (models), extend chat input with model param | YES |
| `agent-service.ts` | Hardcoded model string | Accept model parameter, use in SDK options | YES |
| `action-tools.ts` | 10 tools, imports from 4 services | Add 2 tools, add imports from category-service | YES |
| `system-prompt.ts` | 13 rules | Add rules 14-15 for category creation guidance | YES |
| `ChatPage.tsx` | Input bar with textarea + send | Add model selector dropdown, model state, pass to mutation | YES |
| `category-service.ts` | Has createCategory, createGroup | NO CHANGES -- already has the functions we need | NO |
| `mcp-server.ts` | Spreads query + action tools | NO CHANGES -- automatically picks up new action tools | NO |
| `tool-helpers.ts` | jsonResult, errorResult, xmlWrap | NO CHANGES | NO |
| `query-tools.ts` | 11 tools including list_categories | NO CHANGES | NO |
| `trpc-router.ts` | Mounts agentRouter | NO CHANGES | NO |
| `trpc.ts` | Context type definition | NO CHANGES | NO |

**Total: 5 files modified, 0 files created.**

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate Model Config Service
**What:** Creating a new service file, database table, or config system for model management.
**Why bad:** There are 3 static models. A const array in `agent-router.ts` is sufficient. Over-engineering creates unnecessary files and indirection.
**Instead:** Const array in `agent-router.ts`.

### Anti-Pattern 2: Client-Side Model Strings
**What:** Putting API model strings (`claude-sonnet-4-20250514`) in the client code or sending them from client to server.
**Why bad:** Leaks API implementation details. Forces client rebuild when model versions change. Could allow arbitrary model strings if not validated.
**Instead:** Client sends model key (`sonnet`), server maps to API string. Server validates with `z.enum()`.

### Anti-Pattern 3: Duplicate Validation in Service Layer
**What:** Adding uniqueness checks to `category-service.ts` `createCategory`/`createGroup`.
**Why bad:** Changes existing service behavior that the UI (CategoriesPage) relies on. The tRPC router endpoints for category creation (lines 142-146, 170-173 of `trpc-router.ts`) do not check for duplicates -- they pass through to the service directly. Changing service behavior could break existing UI flows.
**Instead:** Duplicate checks in the tool definitions only, matching the existing validation pattern in `action-tools.ts`.

### Anti-Pattern 4: New Router for Models
**What:** Creating `model-router.ts` with its own router mounted on the app router.
**Why bad:** Models are an agent concern. A separate router adds a file, an import in `trpc-router.ts`, and a mount point for a single query procedure.
**Instead:** Add `models` query to the existing `agentRouter`.

### Anti-Pattern 5: Confirmation Flow for Category Creation
**What:** Requiring JSON confirmation blocks and Confirm/Cancel buttons for creating categories.
**Why bad:** Creation is safe and add-only. Confirmation flow adds latency and friction for a non-destructive operation. PROJECT.md explicitly says creation is safe. All other write tools (except budget changes) auto-execute.
**Instead:** Auto-execute like `create_rule`, `categorize_transaction`, etc.

## Suggested Build Order

Build order follows dependency chain: server changes first (independently testable), then client.

```
Phase 1: Model selector server
  - Add AVAILABLE_MODELS const to agent-router.ts
  - Add models query procedure to agentRouter
  - Extend chat input schema with model param (optional, default 'sonnet')
  - Map model key to API string in router before calling chat()
  - Update agent-service.ts chat() signature to accept model string param
  - Test: models query returns 3 models, chat accepts and uses model param

Phase 2: Category creation tools
  - Add create_category tool to action-tools.ts
  - Add create_category_group tool to action-tools.ts
  - Add imports for createCategory, createGroup from category-service
  - Test: duplicate detection (case-insensitive), group-not-found validation, successful creation

Phase 3: System prompt updates
  - Add rules 14-15 to system-prompt.ts
  - No automated test needed (string content, verified by integration testing)

Phase 4: Model selector UI
  - Add selectedModel state and models query to ChatPage.tsx
  - Add native <select> dropdown in input bar area
  - Pass model to chatMutation.mutate()
  - Style: consistent with existing input bar (border-gray-300, rounded-lg, text-sm)

Phase 5: Integration verification
  - Manual test: select each model, send message, verify response (Haiku faster, Opus more thorough)
  - Manual test: ask agent to create category, verify it appears in Categories page
  - Manual test: ask agent to create duplicate, verify clear error message
  - Manual test: ask agent to create group then category in that group (two-step flow)
```

**Phase ordering rationale:**
- Phase 1 before Phase 4: Server models endpoint must exist before client can call it
- Phase 2 independent of Phase 1: No dependency between model selector and category tools
- Phase 3 after Phase 2: System prompt should reference tools that exist
- Phase 4 after Phase 1: Client model selector depends on server models query
- Phase 5 last: End-to-end verification after all pieces in place
- Phases 1 and 2 could be built in parallel since they touch different files

## Sources

- Direct code inspection of all files in `packages/server/src/agent/` directory
- Direct code inspection of `packages/client/src/pages/ChatPage.tsx`
- Direct code inspection of `packages/server/src/categories/category-service.ts`
- Direct code inspection of `packages/server/src/sync/trpc-router.ts` and `trpc.ts`
- PROJECT.md v2.5 milestone requirements
- Existing patterns in `action-tools.ts` for tool definition, validation, and error handling
- Confidence: HIGH -- all findings based on direct code inspection of the existing codebase

---
*Architecture research for: v2.5 Chat Enhancements (Model Selector + Category Creation Tools)*
*Researched: 2026-03-24*
