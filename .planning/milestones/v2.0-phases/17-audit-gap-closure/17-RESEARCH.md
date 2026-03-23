# Phase 17: Audit Gap Closure — Research

**Researched:** 2026-03-23
**Status:** Complete

## Phase Goal

Close all gaps from v2.0 milestone audit: fix trigger_sync rate limiter bypass, add explicit SAFE-01 system prompt rule, create Phase 14 VERIFICATION.md, update REQUIREMENTS.md traceability.

## Codebase Analysis

### 1. trigger_sync Rate Limiter Fix (SAFE-04)

**Current code** (`action-tools.ts` lines 211-223):
```typescript
tool('trigger_sync', '...', {}, async () => {
  try {
    const result = await runSync(db, ctx.client, ctx.rateLimiter);
    return jsonResult(result);
  } catch (error) {
    return errorResult(error);
  }
})
```

**Problem:** Calls `runSync()` directly without checking `canManualSync()` first. The tRPC route (`trpc-router.ts` lines 57-69) does enforce this check.

**tRPC pattern to mirror:**
```typescript
const accounts = ctx.db.prepare('SELECT id, name FROM accounts').all() as { id: string; name: string }[];
if (accounts.length > 0) {
  const blocked = accounts.filter(a => !ctx.rateLimiter.canManualSync(a.id));
  if (blocked.length > 0) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: `Rate limit: ...` });
  }
}
```

**Fix:** Add the same pre-check inside the trigger_sync handler, but return `errorResult()` instead of throwing (matches tool error pattern).

**RateLimiter interface** (`rate-limiter.ts`):
- `canManualSync(accountId: string): boolean` - returns true when `dailyLimit - count >= manualReserve`
- Already available via `ctx.rateLimiter`

### 2. System Prompt SAFE-01 Rule

**Current system prompt** (`system-prompt.ts`): 12 numbered rules in three sections: Rules (1-7), Write Operations (8-10), Budget Confirmations (11-12).

**Fix:** Insert a new rule in the Rules section stating read-only query tools auto-execute without user confirmation. This makes the implicit behavior explicit per SAFE-01.

**Insertion point:** After rule 7 (formatting rule) and before "Write Operations" section header. This will require renumbering rules 8-12 to 9-13.

### 3. Phase 14 VERIFICATION.md

**Phase 14 requirements (18 total):** AGENT-01 through AGENT-05, QUERY-01 through QUERY-10, SAFE-01, SAFE-03, SAFE-04, SAFE-05.

**Key source files for evidence:**
- `packages/server/src/agent/agent-router.ts` - tRPC endpoint (AGENT-01)
- `packages/server/src/agent/mcp-server.ts` - custom MCP tools (AGENT-02)
- `packages/server/src/agent/system-prompt.ts` - domain knowledge (AGENT-03)
- `packages/server/src/agent/agent-service.ts` - session persistence + maxTurns (AGENT-04, AGENT-05)
- `packages/server/src/agent/tools/query-tools.ts` - all 10 query tools (QUERY-01 through QUERY-10)
- `packages/server/src/agent/tools/action-tools.ts` - validation (SAFE-04)
- No delete account/transaction tools (SAFE-03)
- `.env` in `.gitignore` (SAFE-05)

**Format:** Follow `16-VERIFICATION.md` structure: frontmatter, requirement table, must-haves, key links, test summary, success criteria check.

**Note for SAFE-01 and SAFE-04:** These span Phases 14 and 17. Verification should note that Phase 17 adds the explicit prompt rule (SAFE-01) and the trigger_sync rate limiter fix (SAFE-04).

### 4. REQUIREMENTS.md Traceability Update

**Current state:**
- ACTION-01 through ACTION-08: checkboxes unchecked `[ ]`, traceability shows "Pending"
- SAFE-02: checkbox unchecked `[ ]`, traceability shows "Pending"
- SAFE-01: traceability shows "Phase 17 | Pending"
- SAFE-04: traceability shows "Phase 17 | Pending"

**Fix:** Check all ACTION checkboxes, check SAFE-02 checkbox, update all traceability rows to "Complete". Also update SAFE-01 and SAFE-04 to Complete.

### 5. Testing Impact

**Existing tests:** 258 total, 21 action tool tests in `action-tools.test.ts`.

**New test needed:** 1 test for trigger_sync rate limiter pre-check. The test mock needs `canManualSync` added to the rateLimiter mock (currently only has `canRequest` and `recordRequest`).

**Test budget:** 258/800 project (32%), well within budget. 1 new test is trivial.

## Risk Assessment

- **Low risk:** All changes are well-defined with clear patterns to follow
- **No new features:** Only fixes and documentation
- **Test coverage:** Single new test for the rate limiter pre-check
- **No breaking changes:** Adding a pre-check to trigger_sync only adds safety, doesn't change success paths

## RESEARCH COMPLETE
