---
phase: 38-sse-event-protocol
plan: 01
subsystem: shared
tags: [typescript, sse, types, discriminated-union]

requires: []
provides:
  - SSE event discriminated union type (SSEEvent) with 6 event kinds
  - Individual event interfaces (SSESessionEvent, SSETextDeltaEvent, etc.)
  - SSEEventType string literal union for wire format
affects: [39-server-stream-processing, 40-express-sse-endpoint, 41-client-stream-hook, 42-chatpage-streaming-ui]

tech-stack:
  added: []
  patterns:
    - "Discriminated union on `type` field for SSE events"
    - "Type-only re-exports from shared package entry point"

key-files:
  created:
    - packages/shared/src/sse-events.ts
    - packages/shared/src/sse-events.test.ts
  modified:
    - packages/shared/src/types.ts

key-decisions:
  - "Used readonly properties on all event interfaces for immutability"
  - "Included type field in JSON payload (not just SSE event: line) so parsed objects are self-describing for discriminated union narrowing"
  - "Used SSEEvent['type'] extraction for SSEEventType rather than manual string union to stay DRY"

patterns-established:
  - "SSE event types: discriminated union with type literal, individual interfaces exported alongside union"

requirements-completed:
  - PROTO-01
  - PROTO-02
  - PROTO-03

duration: 5min
completed: 2026-03-24
---

# Phase 38: SSE Event Protocol Summary

**Defined compile-time SSE event contract with 6 discriminated event types shared between server and client packages.**

## Performance

- **Duration:** 5 min
- **Tasks:** 2/2 completed
- **Files modified:** 3

## Accomplishments

1. Created `packages/shared/src/sse-events.ts` with 6 event interfaces (`SSESessionEvent`, `SSETextDeltaEvent`, `SSEToolStartEvent`, `SSEToolEndEvent`, `SSEDoneEvent`, `SSEErrorEvent`), the `SSEEvent` discriminated union, and `SSEEventType` string literal union
2. Added re-exports from `packages/shared/src/types.ts` so the types are importable via `@minerva/shared`
3. Wrote 10 vitest tests verifying type correctness, exhaustive switch narrowing, and type relationships

## Verification

- All 10 SSE event type tests pass
- Full monorepo build succeeds (shared, server, client)
- Build output `dist/types.d.ts` contains all SSE type re-exports
- Full test suite: 375/375 tests pass (no regressions)

## Self-Check: PASSED

All success criteria met:
- [x] SSEEvent discriminated union defines all 6 event kinds (PROTO-01)
- [x] SSEDoneEvent has `text: string` field (PROTO-02)
- [x] SSEErrorEvent has `message: string` and `partialText?: string` (PROTO-03)
- [x] Both server and client compile with @minerva/shared types
