# Phase 38: SSE Event Protocol - Research

**Researched:** 2026-03-24
**Status:** Complete

## Summary

Phase 38 is a pure type-definition phase. No runtime logic, no new dependencies, no migrations. The deliverable is a TypeScript discriminated union type for 6 SSE event kinds, exported from `packages/shared` so both server and client can import it.

## Codebase Findings

### Shared Package Structure
- **Single source file:** `packages/shared/src/types.ts` exports `Cents` type and `toCents` function
- **Package entry:** `"main": "./dist/types.js"`, `"types": "./dist/types.d.ts"` — everything must re-export through `types.ts`
- **Build:** `tsc` with `outDir: dist`, `rootDir: src`. Any new `.ts` file in `src/` is automatically included
- **TypeScript config:** strict mode, ES2022 target, Node16 module resolution, composite/declaration enabled

### Cross-Package Import Pattern
- Server and client import via `@minerva/shared` (npm workspace resolution)
- Both packages already list `@minerva/shared` as a dependency
- ESM throughout — `.js` extensions in import specifiers

### Downstream Consumers (Future Phases)
- Phase 39: Server async generator will `yield` SSE events — needs the union type for return type
- Phase 40: Express handler will serialize events to SSE wire format — needs individual event interfaces
- Phase 41: Client hook will parse SSE events — needs the union type for type narrowing in switch/case

## Architecture Decision

### File Organization
Create `packages/shared/src/sse-events.ts` with all type definitions, then re-export from `types.ts`. This keeps the SSE types in their own module while preserving the single-entry-point pattern the package uses.

### Type Design
Discriminated union on `type` field:
- `type: 'session'` — `sessionId: string`
- `type: 'text-delta'` — `text: string`
- `type: 'tool-start'` — `tool: string`
- `type: 'tool-end'` — `tool: string`
- `type: 'done'` — `text: string` (full assembled response)
- `type: 'error'` — `message: string`, `partialText?: string`

Export individual interfaces AND the union type AND a string literal union of event type names.

### Why `type` in JSON Payload
The CONTEXT.md decision to include `type` in the JSON data (not just the SSE `event:` line) is correct: the client-side parser returns parsed objects, and having `type` in the data makes the discriminated union work directly without re-attaching the event name from the SSE envelope.

## Verification Approach

1. `npm run build` succeeds (shared package compiles without errors)
2. Add trivial import test in server and client test files to confirm cross-package resolution
3. TypeScript exhaustive switch check: a function that switches on `event.type` must handle all 6 cases

## Risk Assessment

**Complexity:** Very Low — pure type definitions, no runtime behavior
**Risk:** Minimal — cannot break existing functionality (additive only)
**Estimated size:** ~50 lines of TypeScript type definitions + ~5 lines of re-exports

---

## RESEARCH COMPLETE

*Phase: 38-sse-event-protocol*
*Researched: 2026-03-24*
