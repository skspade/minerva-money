# Phase 38: SSE Event Protocol - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Server and client share a compile-time contract for all streaming events, preventing protocol drift. This phase defines a TypeScript discriminated union type for the 6 SSE event kinds (session, text-delta, tool-start, tool-end, done, error) in the shared package, so both `packages/server` and `packages/client` can import the types and stay in sync. No runtime behavior -- pure type definitions and exports.

</domain>

<decisions>
## Implementation Decisions

### Event Type Design
- Discriminated union on a `type` field with 6 literal variants: `session`, `text-delta`, `tool-start`, `tool-end`, `done`, `error`
- The `done` event carries a `text` field containing the full assembled response (from ROADMAP.md success criteria 2)
- The `error` event carries a `message` field for user-friendly display and an optional `partialText` field (from ROADMAP.md success criteria 3)
- `session` event carries `sessionId: string` for conversation continuity (from design doc)
- `text-delta` event carries `text: string` for incremental token data (from design doc)
- `tool-start` event carries `tool: string` for the tool name being invoked (from design doc)
- `tool-end` event carries `tool: string` for the tool name that completed (from design doc)
- Each variant is a separate interface with a `type` literal, unioned into a single `SSEEvent` type (Claude's Decision: discriminated unions are the standard TypeScript pattern for tagged event types and enable exhaustive switch checking)

### Shared Package Integration
- New file `packages/shared/src/sse-events.ts` for all SSE event types (from research ARCHITECTURE.md)
- Re-export from `packages/shared/src/types.ts` so existing import paths (`@minerva/shared`) continue to work (Claude's Decision: shared package currently uses types.ts as its sole entry point via package.json main/types fields)
- Alternatively, update `package.json` exports to add the new module (Claude's Decision: re-exporting from types.ts is simpler and matches the existing single-entry-point pattern)
- Both server and client already reference `@minerva/shared` in their dependencies -- no workspace config changes needed

### Type Export Strategy
- Export individual event interfaces (e.g., `SSESessionEvent`, `SSETextDeltaEvent`) AND the union type `SSEEvent` (Claude's Decision: individual exports allow type narrowing in handlers while the union is used for function signatures)
- Export a `SSEEventType` string literal union (`'session' | 'text-delta' | ...`) for use in `event:` field of SSE wire format (Claude's Decision: downstream server handler needs the event type string for the SSE `event:` line separate from the data payload)

### Wire Format Convention
- SSE events use the standard `event: <type>\ndata: <json>\n\n` format (from design doc)
- The `data` JSON payload matches the corresponding interface (minus the `type` field which is in the SSE `event:` line) (Claude's Decision: keeping type in both the SSE event line and the JSON data enables client-side parsing that works whether reading raw SSE lines or pre-parsed objects)
- Actually, include `type` in the JSON data payload too so the parsed object is self-describing (Claude's Decision: the client SSE parser returns the full JSON object -- having type in the data makes the discriminated union work directly on parsed objects without re-attaching the event name)

### Testing Approach
- Type-only verification: build the shared package and confirm no TypeScript errors (Claude's Decision: this phase is pure types with no runtime logic -- a successful tsc build is the verification)
- Verify server and client can import the types by adding a trivial import in each package's test or source (Claude's Decision: confirms the cross-package import path works end-to-end through the monorepo workspace resolution)

### Claude's Discretion
- Exact naming convention for individual event interfaces (e.g., `SSESessionEvent` vs `SessionEvent` vs `SseSessionEvent`)
- Whether to add JSDoc comments on each event interface
- File organization within sse-events.ts (interfaces first then union, or interleaved)
- Whether to include a type guard helper function (e.g., `isTextDelta(event)`) or leave that to consumers

</decisions>

<specifics>
## Specific Ideas

- The design doc shows `done` event with `fullText` field name, but ROADMAP.md success criteria says `text` field. Use `text` to match the success criteria exactly.
- The design doc shows `error` event with only `message` field, but ROADMAP.md success criteria requires an optional `partialText` field. Include both.
- The shared package currently exports only `Cents` type and `toCents` function from `types.ts`. The SSE event types are the second export from this package.
- The `package.json` for shared uses `"main": "./dist/types.js"` and `"types": "./dist/types.d.ts"` -- re-exporting from types.ts keeps these paths valid without changing package.json.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared/src/types.ts`: Current single source file exporting `Cents` type and `toCents` function. Will re-export new SSE event types from here.
- `packages/shared/tsconfig.json`: Already configured with `outDir: "dist"`, `rootDir: "src"`, extends base config. New file in `src/` will be included automatically.
- `packages/shared/package.json`: `"main": "./dist/types.js"`, `"types": "./dist/types.d.ts"` -- re-exports from types.ts flow through these paths.

### Established Patterns
- Shared package uses branded types (`Cents = number & { readonly __brand: 'Cents' }`) -- SSE events will use a different pattern (discriminated union on `type` field) since they are structured event objects, not branded primitives.
- Cross-package imports use `@minerva/shared` package name, resolved by npm workspaces. Server and client both already have this dependency.
- ESM throughout with `.js` extensions in import paths (e.g., `import { toCents } from '@minerva/shared'`).

### Integration Points
- `packages/server/src/agent/` will import SSE types in Phase 39 to type the async generator yield values
- `packages/client/src/hooks/` will import SSE types in Phase 41 to type the parsed SSE events from the stream
- `npm run build` builds shared first (workspace dependency order), so downstream packages always see the latest types

</code_context>

<deferred>
## Deferred Ideas

- SSE event helper functions (type guards, event constructors, SSE line formatters) -- Phase 39/40 will add these as needed alongside runtime code
- Tool label mapping (`tool-start` tool name to human-readable string) -- Phase 42 (ChatPage UI) scope
- Zod schemas for runtime validation of SSE event payloads -- not needed for compile-time contract; Zod validation is for the HTTP input in Phase 40
- SSE event ID field for resumption -- explicitly out of scope per REQUIREMENTS.md

</deferred>

---

*Phase: 38-sse-event-protocol*
*Context gathered: 2026-03-24 via auto-context*
