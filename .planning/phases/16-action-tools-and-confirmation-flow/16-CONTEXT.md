# Phase 16: Action Tools and Confirmation Flow - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users can modify financial data through chat -- categorize transactions, manage rules, adjust budgets, handle transfers, and trigger sync. This phase adds write-operation action tools to the existing MCP server, implements a confirmation flow for budget amount changes, and updates the system prompt to guide the agent on when to auto-execute vs request confirmation. The Chat UI (Phase 15) and agent infrastructure (Phase 14) are already complete.

</domain>

<decisions>
## Implementation Decisions

### Action Tool Architecture
- Action tools follow the same factory pattern as query tools: `createActionTools(db, ctx)` returns a tool array with db and tRPC context closure (from Phase 14 pattern: `createQueryTools(db)`)
- Action tools registered in the existing MCP server alongside query tools (from REQUIREMENTS.md AGENT-02: agent uses only custom MCP tools)
- All action tools use `readOnlyHint: false` to signal write operations (Claude's Decision: MCP convention distinguishes read vs write tools for permission systems)
- Tool handlers return `{ isError: true }` on failure, matching query tool error pattern (from Phase 14 established pattern)
- Tool results return structured JSON with success/failure status and affected counts (Claude's Decision: consistent with query tool output format and enables clear agent response generation)

### Transaction Categorization (ACTION-01)
- `categorize_transaction` tool accepts `{ transactionId: string, categoryId: number }` and wraps `updateTransactionCategory()` from category-service
- Validate that both transactionId and categoryId exist before executing (from REQUIREMENTS.md SAFE-04)
- Auto-executes without confirmation (from REQUIREMENTS.md SAFE-01: agent auto-executes most write actions)

### Rule Management (ACTION-02, ACTION-03, ACTION-04)
- `create_rule` tool accepts `{ name, merchantPattern?, matchType?, amountMin?, amountMax?, memoPattern?, categoryId }` and wraps `createRule()` from rules-service
- `update_rule` tool accepts `{ ruleId, name, merchantPattern?, matchType?, amountMin?, amountMax?, memoPattern?, categoryId }` and wraps `updateRule()` from rules-service
- `delete_rule` tool accepts `{ ruleId: number }` and wraps `deleteRule()` from rules-service
- `apply_rule` tool accepts `{ ruleId: number }` and wraps `applyRule()` from rules-service, returns count of affected transactions (from REQUIREMENTS.md ACTION-04)
- All rule tools auto-execute without confirmation (from REQUIREMENTS.md SAFE-01)
- Validate categoryId exists before creating/updating rules (from REQUIREMENTS.md SAFE-04)
- Validate ruleId exists before updating/deleting/applying rules (from REQUIREMENTS.md SAFE-04)

### Budget Adjustments (ACTION-05, ACTION-06)
- `set_budget_allocation` tool accepts `{ categoryId: number, period: string, amountInCents: number }` and wraps `setAllocation()` from budget-service
- `set_default_allocation` tool accepts `{ categoryId: number, amountInCents: number }` and wraps `setDefaultAllocation()` from budget-service
- Both budget tools require explicit user confirmation before executing (from REQUIREMENTS.md SAFE-02)
- Validate categoryId exists and amount is non-negative (from REQUIREMENTS.md SAFE-04)

### Confirmation Flow (SAFE-02)
- Agent handles confirmation via system prompt instructions: when a budget amount change is requested, the agent describes the change and asks the user to confirm before calling the tool (Claude's Decision: prompt-driven confirmation is simpler than middleware-based tool interception and works with the existing collect-and-return architecture)
- System prompt instructs the agent to emit a fenced JSON confirmation block with `{ "type": "confirmation", "description": "..." }` for budget changes (from Phase 15 CONTEXT.md: ChatPage already parses this format)
- The agent only calls `set_budget_allocation` or `set_default_allocation` after the user replies with confirmation (from REQUIREMENTS.md SAFE-02)
- No server-side enforcement of confirmation -- the agent is trusted to follow system prompt instructions (Claude's Decision: single-user app with no adversarial risk; adding middleware complexity is unnecessary)

### Transfer Management (ACTION-07)
- `confirm_transfer` tool accepts `{ linkId: number }` and wraps `confirmTransfer()` from transfer-service
- `dismiss_transfer` tool accepts `{ linkId: number }` and wraps `dismissTransfer()` from transfer-service
- Both auto-execute without confirmation (from REQUIREMENTS.md SAFE-01)
- Validate linkId exists before executing (from REQUIREMENTS.md SAFE-04)

### Sync Trigger (ACTION-08)
- `trigger_sync` tool accepts no parameters and wraps `runSync(db, client, rateLimiter)` from sync-service
- Requires tRPC context for `client` and `rateLimiter` -- action tool factory signature is `createActionTools(db, ctx)` where ctx includes these (Claude's Decision: sync is the only tool needing context beyond db; passing full ctx keeps the factory signature clean)
- Auto-executes without confirmation (from REQUIREMENTS.md SAFE-01)
- Returns sync result with counts of accounts synced and transactions added

### System Prompt Updates
- Add rules for write operations: describe what action was taken after executing, report counts when applicable
- Add confirmation instruction: "Before changing budget allocations or defaults, describe the proposed change and include a confirmation JSON block. Only call the budget tool after the user confirms."
- Add instruction that delete operations (rules only) should confirm the rule name before deleting (Claude's Decision: prevents accidental deletion of wrong rule without requiring the full confirmation flow)

### File Structure
- New file: `packages/server/src/agent/tools/action-tools.ts` -- action tool factory (Claude's Decision: parallel to query-tools.ts, keeps read and write tools in separate files for clarity)
- Modified: `packages/server/src/agent/mcp-server.ts` -- add action tools to MCP server
- Modified: `packages/server/src/agent/system-prompt.ts` -- add write operation and confirmation instructions
- Modified: `packages/server/src/agent/agent-service.ts` -- pass tRPC context to MCP server factory for sync tool

### Claude's Discretion
- Exact wording of action tool descriptions
- Exact system prompt phrasing for confirmation instructions
- Internal ordering of action tools within action-tools.ts
- Whether to add a `preview_rule` tool (useful but not required by any requirement)
- Exact Zod schema field descriptions for action tool inputs

</decisions>

<specifics>
## Specific Ideas

- The ChatPage already parses confirmation blocks via regex: `/```json\s*\n(\{[\s\S]*?"type"\s*:\s*"confirmation"[\s\S]*?\})\s*\n```/` and renders Confirm/Cancel buttons. The agent system prompt must instruct it to produce this exact format.
- The `applyRule()` function in rules-service already handles retroactive application correctly: it only applies to uncategorized transactions and those categorized by a different rule (not manually categorized ones). The tool just needs to call it and report the count.
- The `runSync()` function requires `client: SimpleFINClient` and `rateLimiter: RateLimiter` from tRPC context -- the agent-service.ts `chat()` function signature needs to expand to accept these.
- Budget tool inputs should accept amounts in cents (matching all other tool conventions) -- the agent handles dollar-to-cent conversion based on system prompt instructions.
- The `createRule` service function requires at least one condition (merchant, amount range, or memo) and throws if `computeSpecificity()` returns 0. The tool should validate this and return a clear error message.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `category-service.ts`: `updateTransactionCategory(db, transactionId, categoryId)` -- direct wrapper for ACTION-01
- `rules-service.ts`: `createRule()`, `updateRule()`, `deleteRule()`, `applyRule()`, `previewRule()` -- direct wrappers for ACTION-02/03/04
- `budget-service.ts`: `setAllocation()`, `setDefaultAllocation()` -- direct wrappers for ACTION-05/06
- `transfer-service.ts`: `confirmTransfer()`, `dismissTransfer()` -- direct wrappers for ACTION-07
- `sync-service.ts`: `runSync(db, client, rateLimiter)` -- wrapper for ACTION-08 (needs ctx)
- `query-tools.ts`: `xmlWrap()`, `jsonResult()`, `errorResult()` helper functions -- reusable in action tools

### Established Patterns
- Tool factory closure: `createQueryTools(db)` returns tool array with db in closure -- action tools follow the same pattern with expanded context
- Tool registration: `createSdkMcpServer({ tools: [...createQueryTools(db)] })` -- extend with `...createActionTools(db, ctx)`
- Error handling: try/catch with `errorResult()` return -- action tools use the same pattern
- Input validation: service functions throw on invalid input (e.g., rule with no conditions) -- tools catch and return `isError: true`

### Integration Points
- `packages/server/src/agent/mcp-server.ts` line 9: `tools: [...createQueryTools(db)]` -- extend to include action tools
- `packages/server/src/agent/agent-service.ts` line 12-16: `chat(db, message, sessionId)` -- expand signature to accept ctx for sync tool
- `packages/server/src/agent/agent-router.ts` line 12: `chat(ctx.db, ...)` -- pass full ctx
- `packages/server/src/agent/system-prompt.ts`: SYSTEM_PROMPT constant -- add confirmation and write operation rules

</code_context>

<deferred>
## Deferred Ideas

- **Streaming responses (v2.x STREAM-01, STREAM-02):** Token-by-token rendering via WebSocket; collect-and-return is the v2.0 approach
- **Persistent chat history (v2.x HIST-01, HIST-02):** No database storage for conversations
- **Category creation via agent:** Out of scope per REQUIREMENTS.md ("UI concern with sort ordering; agent suggests, user creates in UI")
- **Server-side confirmation enforcement:** Middleware-based tool interception to block budget tools without prior confirmation. Deferred because single-user app has no adversarial risk.
- **Undo/rollback for action tools:** No undo mechanism for write operations in v2.0
- **Batch categorization tool:** Tool to categorize multiple transactions at once; agent can call single-transaction tool in a loop via multi-turn

</deferred>

---

*Phase: 16-action-tools-and-confirmation-flow*
*Context gathered: 2026-03-23 via auto-context*
