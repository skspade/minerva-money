# Phase 16: Action Tools and Confirmation Flow - Research

**Researched:** 2026-03-23
**Domain:** MCP action tools wrapping existing service functions
**Confidence:** HIGH

## Summary

Phase 16 adds write-operation action tools to the existing MCP server established in Phase 14. Every action tool wraps an existing, tested service function (category-service, rules-service, budget-service, transfer-service, sync-service). The primary pattern is already established by query-tools.ts: factory function returns tool array with db in closure, tools use try/catch with jsonResult/errorResult helpers, inputs validated via Zod schemas.

The one novel element is the confirmation flow for budget changes. The ChatPage already parses confirmation JSON blocks and renders Confirm/Cancel buttons (Phase 15). The agent just needs system prompt instructions to emit this format before calling budget tools.

**Primary recommendation:** Follow the exact query-tools.ts pattern for action-tools.ts. Expand the MCP server factory and agent-service signatures to pass tRPC context (needed only for sync tool). Add confirmation and write-operation rules to the system prompt.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Action tools follow same factory pattern as query tools: `createActionTools(db, ctx)` returns tool array
- Action tools registered alongside query tools in existing MCP server
- All action tools use `readOnlyHint: false` to signal write operations
- Tool handlers return `{ isError: true }` on failure, matching query tool error pattern
- Tool results return structured JSON with success/failure status and affected counts
- `categorize_transaction` tool: `{ transactionId, categoryId }`, auto-execute, wraps `updateTransactionCategory()`
- `create_rule` tool: `{ name, merchantPattern?, matchType?, amountMin?, amountMax?, memoPattern?, categoryId }`, wraps `createRule()`
- `update_rule` tool: `{ ruleId, name, merchantPattern?, matchType?, amountMin?, amountMax?, memoPattern?, categoryId }`, wraps `updateRule()`
- `delete_rule` tool: `{ ruleId }`, wraps `deleteRule()`
- `apply_rule` tool: `{ ruleId }`, wraps `applyRule()`, returns affected count
- `set_budget_allocation` tool: `{ categoryId, period, amountInCents }`, wraps `setAllocation()`, REQUIRES CONFIRMATION
- `set_default_allocation` tool: `{ categoryId, amountInCents }`, wraps `setDefaultAllocation()`, REQUIRES CONFIRMATION
- `confirm_transfer` tool: `{ linkId }`, wraps `confirmTransfer()`
- `dismiss_transfer` tool: `{ linkId }`, wraps `dismissTransfer()`
- `trigger_sync` tool: no params, wraps `runSync(db, client, rateLimiter)`, needs tRPC context
- Confirmation via system prompt instructions (prompt-driven, not middleware)
- Agent emits fenced JSON confirmation block: `{ "type": "confirmation", "action": "...", "description": "..." }`
- No server-side enforcement of confirmation (single-user app)
- New file: `packages/server/src/agent/tools/action-tools.ts`
- Modified: `mcp-server.ts`, `system-prompt.ts`, `agent-service.ts`

### Claude's Discretion
- Exact wording of action tool descriptions
- Exact system prompt phrasing for confirmation instructions
- Internal ordering of action tools within action-tools.ts
- Whether to add a `preview_rule` tool
- Exact Zod schema field descriptions for action tool inputs

### Deferred Ideas (OUT OF SCOPE)
- Streaming responses (v2.x STREAM-01, STREAM-02)
- Persistent chat history (v2.x HIST-01, HIST-02)
- Category creation via agent
- Server-side confirmation enforcement
- Undo/rollback for action tools
- Batch categorization tool
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/claude-agent-sdk | existing | `tool()` factory, `createSdkMcpServer()` | Already in use for Phase 14 query tools |
| zod | existing | Tool input schema validation | Already in use for query tools |
| better-sqlite3 | existing | Database access for all service calls | Project standard |

### Supporting
No new libraries needed. All action tools wrap existing service functions.

## Architecture Patterns

### Recommended File Structure
```
packages/server/src/agent/
├── agent-router.ts      # tRPC router (pass ctx)
├── agent-service.ts     # chat() function (expanded signature)
├── mcp-server.ts        # MCP server factory (expanded to include action tools)
├── system-prompt.ts     # System prompt (add write/confirmation rules)
└── tools/
    ├── query-tools.ts   # Existing read-only tools
    └── action-tools.ts  # NEW: write-operation tools
```

### Pattern 1: Action Tool Factory with Context
**What:** Factory function that closes over db AND tRPC context for sync tool
**When to use:** For all action tools
**Example:**
```typescript
import type { Context } from '../../sync/trpc.js';

export function createActionTools(db: Database.Database, ctx: Context) {
  return [
    tool(
      'categorize_transaction',
      'Categorize a transaction...',
      { transactionId: z.string(), categoryId: z.number() },
      async (args) => {
        try {
          updateTransactionCategory(db, args.transactionId, args.categoryId);
          return jsonResult({ success: true, transactionId: args.transactionId });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),
    // ... more tools
    tool(
      'trigger_sync',
      'Trigger a manual SimpleFIN sync...',
      {},
      async () => {
        try {
          const result = await runSync(db, ctx.client, ctx.rateLimiter);
          return jsonResult(result);
        } catch (error) {
          return errorResult(error);
        }
      },
    ),
  ];
}
```

### Pattern 2: Input Validation Before Service Call
**What:** Validate IDs exist before calling service functions that may silently no-op
**When to use:** For tools operating on specific entities (transactions, rules, categories, transfer links)
**Example:**
```typescript
// Validate category exists before categorizing
const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(args.categoryId);
if (!category) return errorResult(new Error(`Category ${args.categoryId} not found`));
```

### Pattern 3: Confirmation Block in System Prompt
**What:** Agent emits a fenced JSON block that ChatPage parses for Confirm/Cancel buttons
**When to use:** Budget allocation and default changes only
**Format the agent must produce:**
````
```json
{ "type": "confirmation", "action": "set_budget_allocation", "description": "Set Groceries budget to $500.00 for March 2026" }
```
````

### Anti-Patterns to Avoid
- **Calling service functions without validation:** Some service functions (e.g., `deleteRule`) silently succeed even with invalid IDs. Always check existence first.
- **Forgetting to re-export helpers:** `jsonResult` and `errorResult` from query-tools.ts should be importable by action-tools.ts. Extract them to a shared location or re-export.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Input validation schemas | Custom validation logic | Zod schemas in `tool()` | SDK handles validation automatically |
| Confirmation UI | Custom modal system | System prompt + existing ChatPage parser | Already built in Phase 15 |
| Entity existence checks | Complex query builders | Simple `SELECT id FROM ... WHERE id = ?` | SQLite is fast, keep it simple |

## Common Pitfalls

### Pitfall 1: Helper Functions Not Shared
**What goes wrong:** `jsonResult`, `errorResult`, `xmlWrap` are defined in query-tools.ts. Action-tools.ts needs them too.
**Why it happens:** They were defined as module-private functions.
**How to avoid:** Extract to a shared `tool-helpers.ts` or export from query-tools.ts.
**Warning signs:** Duplicate function definitions in action-tools.ts.

### Pitfall 2: Sync Tool Context Access
**What goes wrong:** `runSync()` needs `client: SimpleFINClient` and `rateLimiter: RateLimiter` from tRPC context, but current `createMcpServer(db)` only receives db.
**Why it happens:** Query tools only needed db access.
**How to avoid:** Expand `createMcpServer(db, ctx)` signature and pass through from `agent-service.ts` which gets it from `agent-router.ts`.
**Warning signs:** TypeScript errors about missing arguments.

### Pitfall 3: Confirmation Block Format Mismatch
**What goes wrong:** ChatPage regex expects exact format: `{ "type": "confirmation", ... }` inside triple-backtick json fence.
**Why it happens:** System prompt wording doesn't precisely match the regex pattern.
**How to avoid:** System prompt should include the exact format with an example. The regex is: `/```json\s*\n(\{[\s\S]*?"type"\s*:\s*"confirmation"[\s\S]*?\})\s*\n```/`
**Warning signs:** Confirm/Cancel buttons don't appear on budget change proposals.

### Pitfall 4: updateTransactionCategory Accepts null
**What goes wrong:** `updateTransactionCategory(db, id, null)` removes categorization, which may not be intended.
**Why it happens:** The function signature accepts `number | null` for categoryId.
**How to avoid:** The tool's Zod schema should use `z.number()` (not optional/nullable) so the agent can only SET a category, not remove one.

### Pitfall 5: Rule Specificity Validation
**What goes wrong:** `createRule()` throws if `computeSpecificity()` returns 0 (no conditions provided).
**Why it happens:** At least one condition (merchant, amount range, or memo) is required.
**How to avoid:** The tool should catch this error and return a clear message telling the agent what conditions are needed.

## Code Examples

### Existing Helper Functions (from query-tools.ts)
```typescript
function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

function errorResult(error: unknown) {
  const msg = error instanceof Error ? error.message : 'Unknown error';
  return { isError: true as const, content: [{ type: 'text' as const, text: `Error: ${msg}` }] };
}
```

### Service Function Signatures
```typescript
// category-service.ts
updateTransactionCategory(db, transactionId: string, categoryId: number | null): void

// rules-service.ts
createRule(db, input: CreateRuleInput): Rule
updateRule(db, id: number, input: UpdateRuleInput): void
deleteRule(db, id: number): void
applyRule(db, ruleId: number): number  // returns affected count

// budget-service.ts
setAllocation(db, categoryId: number, period: string, amount: number): void
setDefaultAllocation(db, categoryId: number, amount: number): void

// transfer-service.ts
confirmTransfer(db, linkId: number): void  // throws if not found
dismissTransfer(db, linkId: number): void  // throws if not found

// sync-service.ts
runSync(db, client: SimpleFINClient, rateLimiter: RateLimiter, options?: SyncOptions): Promise<SyncResult>
```

### ChatPage Confirmation Parsing (existing)
```typescript
const match = content.match(/```json\s*\n(\{[\s\S]*?"type"\s*:\s*"confirmation"[\s\S]*?\})\s*\n```/);
// Extracts: { action: string, description: string }
```

## State of the Art

No external library changes needed. All patterns are established in the codebase.

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Query tools only (Phase 14) | Query + Action tools | Phase 16 | Agent can now modify data |
| `createMcpServer(db)` | `createMcpServer(db, ctx)` | Phase 16 | Sync tool gets tRPC context |
| Read-only system prompt | Prompt with write rules + confirmation | Phase 16 | Agent knows when to confirm |

## Open Questions

1. **Should `delete_rule` confirm rule name first?**
   - CONTEXT.md says: "delete operations (rules only) should confirm the rule name before deleting"
   - This is a system prompt instruction, not a tool-level concern
   - Recommendation: Add to system prompt: "Before deleting a rule, state its name and ask the user to confirm"

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ACTION-01 | Categorize transactions via chat | `categorize_transaction` tool wrapping `updateTransactionCategory()` |
| ACTION-02 | Create categorization rules via chat | `create_rule` tool wrapping `createRule()` |
| ACTION-03 | Update or delete existing rules via chat | `update_rule` and `delete_rule` tools wrapping `updateRule()` and `deleteRule()` |
| ACTION-04 | Apply rule retroactively to matching transactions | `apply_rule` tool wrapping `applyRule()`, returns affected count |
| ACTION-05 | Adjust budget allocation for category/period (requires confirmation) | `set_budget_allocation` tool with confirmation flow |
| ACTION-06 | Set default budget allocation (requires confirmation) | `set_default_allocation` tool with confirmation flow |
| ACTION-07 | Confirm or dismiss transfer suggestions | `confirm_transfer` and `dismiss_transfer` tools |
| ACTION-08 | Trigger manual SimpleFIN sync | `trigger_sync` tool wrapping `runSync()` with tRPC context |
| SAFE-02 | Require explicit user confirmation before budget changes | System prompt instructions + ChatPage confirmation UI (already built) |
</phase_requirements>

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/server/src/agent/tools/query-tools.ts` — established tool pattern
- Codebase analysis: `packages/server/src/agent/mcp-server.ts` — MCP server registration
- Codebase analysis: `packages/server/src/agent/agent-service.ts` — chat function signature
- Codebase analysis: `packages/server/src/agent/system-prompt.ts` — current system prompt
- Codebase analysis: `packages/client/src/pages/ChatPage.tsx` — confirmation parsing
- Codebase analysis: All service files — function signatures verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all existing
- Architecture: HIGH - extending established patterns
- Pitfalls: HIGH - identified from direct codebase analysis

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable internal patterns)
