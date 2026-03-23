# Phase 17: Audit Gap Closure — Safety Fixes, Verification, and Traceability - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Close all gaps identified in the v2.0 milestone audit: fix the trigger_sync rate limiter bypass, add an explicit SAFE-01 system prompt rule for auto-executing read-only tools, create the missing Phase 14 VERIFICATION.md to formally verify all 18 Phase 14 requirements, and update REQUIREMENTS.md traceability for ACTION-01 through ACTION-08 and SAFE-02 to show Complete with checked checkboxes. This is a gap closure phase -- no new features, only fixes and process artifacts.

</domain>

<decisions>
## Implementation Decisions

### trigger_sync Rate Limiter Fix (SAFE-04, ACTION-08)
- Add a `rateLimiter.canManualSync()` pre-check to the `trigger_sync` tool handler in `action-tools.ts` before calling `runSync()` (from ROADMAP.md success criteria 1)
- Mirror the same pattern used in `sync.trigger` tRPC route: query all accounts, check `canManualSync(accountId)` for each, return error if any are blocked (from `trpc-router.ts` lines 57-72)
- Return `errorResult` with a clear rate-limit message listing blocked account names, not a thrown exception (from Phase 14 established pattern: tool handlers return `{ isError: true }` on failure)

### System Prompt SAFE-01 Rule
- Add an explicit rule to the system prompt in `system-prompt.ts` stating that all read-only query tools auto-execute without requesting user confirmation (from ROADMAP.md success criteria 2)
- Place the rule in the existing Rules section, before the Write Operations section (Claude's Decision: logical ordering groups read behavior before write behavior)

### Phase 14 VERIFICATION.md
- Create `14-VERIFICATION.md` in the Phase 14 directory to formally verify all 18 Phase 14 requirements: AGENT-01 through AGENT-05, QUERY-01 through QUERY-10, SAFE-01, SAFE-03, SAFE-04, SAFE-05 (from ROADMAP.md success criteria 3)
- Verification evidence should reference existing code artifacts (agent-router.ts, mcp-server.ts, system-prompt.ts, query-tools.ts, action-tools.ts) and test results where applicable (Claude's Decision: verification is a documentation exercise confirming what already works, not new testing)
- SAFE-01 verification should note the new explicit prompt rule added by this phase
- SAFE-04 verification should note the trigger_sync rate limiter fix added by this phase

### REQUIREMENTS.md Traceability Update
- Update REQUIREMENTS.md traceability table: change ACTION-01 through ACTION-08 and SAFE-02 from Pending to Complete (from ROADMAP.md success criteria 4)
- Check the corresponding checkboxes in the Action Tools and Safety sections (from ROADMAP.md success criteria 4)
- Update SAFE-01 and SAFE-04 from their current status to reflect Phase 17 completion (Claude's Decision: these requirements span Phase 14 and Phase 17, traceability should reflect the gap closure)

### File Changes
- Modified: `packages/server/src/agent/tools/action-tools.ts` -- add rate limiter pre-check to trigger_sync
- Modified: `packages/server/src/agent/system-prompt.ts` -- add SAFE-01 explicit rule
- Created: `.planning/phases/14-agent-infrastructure-and-query-tools/14-VERIFICATION.md` -- Phase 14 formal verification
- Modified: `.planning/REQUIREMENTS.md` -- traceability and checkbox updates

### Claude's Discretion
- Exact wording of the SAFE-01 system prompt rule
- Exact wording and format of VERIFICATION.md evidence descriptions
- Rule numbering in the system prompt after inserting the new rule
- Order of requirement verification entries in VERIFICATION.md

</decisions>

<specifics>
## Specific Ideas

- The rate limiter pre-check in trigger_sync should query accounts with `db.prepare('SELECT id, name FROM accounts').all()` and check `ctx.rateLimiter.canManualSync(a.id)` for each, matching the exact pattern at `trpc-router.ts` lines 57-69
- The system prompt currently has 12 numbered rules. The new SAFE-01 rule should be inserted as a new numbered rule in the Rules section (e.g., "Always execute read-only query tools immediately without asking the user for confirmation")
- The existing `action-tools.test.ts` has 21 tests covering action tool behavior -- a new test for the rate limiter pre-check in trigger_sync should be added there
- Phase 14 VERIFICATION.md should follow the same format as `16-VERIFICATION.md` for consistency

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `trpc-router.ts` lines 57-69: Rate limiter pre-check pattern that trigger_sync should mirror -- queries all accounts, filters blocked ones, returns error with account names
- `action-tools.test.ts`: Existing test file with 21 tests for action tools -- extend with trigger_sync rate limiter test
- `tool-helpers.ts`: `errorResult()` helper for returning tool errors in MCP format
- `16-VERIFICATION.md`: Verification format reference for Phase 14 VERIFICATION.md

### Established Patterns
- Tool error handling: try/catch with `errorResult(error)` return, never throwing exceptions
- System prompt: numbered rules in a flat list, grouped by concern (Rules, Write Operations, Budget Confirmations)
- Verification files: requirement-by-requirement verification with evidence and pass/fail status

### Integration Points
- `packages/server/src/agent/tools/action-tools.ts` line 211-223: `trigger_sync` tool handler -- add rate limiter pre-check before `runSync()` call
- `packages/server/src/agent/system-prompt.ts` line 19: Rules section -- insert new SAFE-01 rule
- `.planning/REQUIREMENTS.md` lines 33-41: ACTION checkboxes to check; lines 53-54: SAFE-01 and SAFE-02 checkboxes
- `.planning/REQUIREMENTS.md` lines 119-127: Traceability table rows to update from Pending to Complete

</code_context>

<deferred>
## Deferred Ideas

- **Unit tests for Phase 14 query tools:** Audit noted 0 test files for query tools. Not in scope for this gap closure phase -- could be a future tech debt reduction task.
- **Redundant backup test pruning:** Audit identified `run-backup.test.ts` as redundant (3 tests). Not in scope for this phase.
- **SUMMARY.md frontmatter updates:** Audit noted missing requirements-completed frontmatter in Phase 15 summaries. Minor process gap, not in scope.

</deferred>

---

*Phase: 17-audit-gap-closure*
*Context gathered: 2026-03-23 via auto-context*
