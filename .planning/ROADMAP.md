# Roadmap: Minerva Money

## Milestones

- ✅ **v1.0 MVP** — Phases 1-13 (shipped 2026-03-22)
- ✅ **v2.0 Claude Agent** — Phases 14-17 (shipped 2026-03-23)
- ✅ **v2.1 Deployment Hardening** — Phases 18-20 (shipped 2026-03-24)
- ✅ **v2.2 Mobile-Friendly UI** — Phases 21-25 (shipped 2026-03-24)
- ✅ **v2.3 CSV Import** — Phases 26-28 (shipped 2026-03-24)
- ✅ **v2.4 CSV Import Account Filtering** — Phases 29-32 (shipped 2026-03-24)
- ✅ **v2.5 Chat Enhancements** — Phases 33-37 (shipped 2026-03-24)
- 🚧 **v2.6 Streaming Chat** — Phases 38-42 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-13) — SHIPPED 2026-03-22</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-03-22
- [x] Phase 2: SimpleFIN Data Pipeline (4/4 plans) — completed 2026-03-22
- [x] Phase 3: Accounts and Transactions UI (4/4 plans) — completed 2026-03-22
- [x] Phase 4: Category Management (4/4 plans) — completed 2026-03-22
- [x] Phase 5: Categorization Rules Engine (4/4 plans) — completed 2026-03-23
- [x] Phase 6: Transfer Detection (3/3 plans) — completed 2026-03-22
- [x] Phase 7: Budget Engine (4/4 plans) — completed 2026-03-22
- [x] Phase 8: Budget UI (3/3 plans) — completed 2026-03-22
- [x] Phase 9: Dashboard and Reporting (4/4 plans) — completed 2026-03-22
- [x] Phase 10: Foundation Bug Fix & Verification (2/2 plans) — completed 2026-03-23 [Gap Closure]
- [x] Phase 11: Reporting Date Fix & Verification Sweep (2/2 plans) — completed 2026-03-23 [Gap Closure]
- [x] Phase 12: Budget Defaults UI (1/1 plan) — completed 2026-03-23 [Gap Closure]
- [x] Phase 13: Transaction Filter Completion (1/1 plan) — completed 2026-03-23 [Gap Closure]

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

<details>
<summary>✅ v2.0 Claude Agent (Phases 14-17) — SHIPPED 2026-03-23</summary>

- [x] Phase 14: Agent Infrastructure and Query Tools (3/3 plans) — completed 2026-03-23
- [x] Phase 15: Chat UI (2/2 plans) — completed 2026-03-23
- [x] Phase 16: Action Tools and Confirmation Flow (2/2 plans) — completed 2026-03-23
- [x] Phase 17: Audit Gap Closure (1/1 plan) — completed 2026-03-23 [Gap Closure]

Full details: [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md)

</details>

<details>
<summary>✅ v2.1 Deployment Hardening (Phases 18-20) — SHIPPED 2026-03-24</summary>

- [x] Phase 18: Production Build and Directory Layout (2/2 plans) — completed 2026-03-23
- [x] Phase 19: Service Configuration (1/1 plan) — completed 2026-03-24
- [x] Phase 20: Deploy Scripts (2/2 plans) — completed 2026-03-24

Full details: [milestones/v2.1-ROADMAP.md](milestones/v2.1-ROADMAP.md)

</details>

<details>
<summary>✅ v2.2 Mobile-Friendly UI (Phases 21-25) — SHIPPED 2026-03-24</summary>

- [x] Phase 21: Layout Foundation (2/2 plans) — completed 2026-03-24
- [x] Phase 22: Transaction Cards (1/1 plan) — completed 2026-03-24
- [x] Phase 23: Budget Cards (1/1 plan) — completed 2026-03-24
- [x] Phase 24: Modal Conversions (1/1 plan) — completed 2026-03-24
- [x] Phase 25: Remaining Pages (2/2 plans) — completed 2026-03-24

Full details: [milestones/v2.2-ROADMAP.md](milestones/v2.2-ROADMAP.md)

</details>

<details>
<summary>✅ v2.3 CSV Import (Phases 26-28) — SHIPPED 2026-03-24</summary>

- [x] Phase 26: Import Service and API (2/2 plans) — completed 2026-03-24
- [x] Phase 27: Import UI and Navigation (2/2 plans) — completed 2026-03-24
- [x] Phase 28: Phase 26 Verification (1/1 plan) — completed 2026-03-24 [Gap Closure]

Full details: [milestones/v2.3-ROADMAP.md](milestones/v2.3-ROADMAP.md)

</details>

<details>
<summary>✅ v2.4 CSV Import Account Filtering (Phases 29-32) — SHIPPED 2026-03-24</summary>

- [x] Phase 29: Server Skip Support (1/1 plan) — completed 2026-03-24
- [x] Phase 30: Client Skip UI (1/1 plan) — completed 2026-03-24
- [x] Phase 31: Stats Filtering and Polish (1/1 plan) — completed 2026-03-24
- [x] Phase 32: Phase 31 Verification (1/1 plan) — completed 2026-03-24 [Gap Closure]

Full details: [milestones/v2.4-ROADMAP.md](milestones/v2.4-ROADMAP.md)

</details>

<details>
<summary>✅ v2.5 Chat Enhancements (Phases 33-37) — SHIPPED 2026-03-24</summary>

- [x] Phase 33: Model Selector Server (1/1 plan) — completed 2026-03-24
- [x] Phase 34: Category Creation Tools (1/1 plan) — completed 2026-03-24
- [x] Phase 35: System Prompt Updates (1/1 plan) — completed 2026-03-25
- [x] Phase 36: Model Selector UI (1/1 plan) — completed 2026-03-24
- [x] Phase 37: Verification Gap Closure (1/1 plan) — completed 2026-03-24 [Gap Closure]

Full details: [milestones/v2.5-ROADMAP.md](milestones/v2.5-ROADMAP.md)

</details>

### 🚧 v2.6 Streaming Chat (In Progress)

**Milestone Goal:** Add true token-by-token streaming of LLM responses to the chat interface using SSE, with tool activity indicators

- [x] **Phase 38: SSE Event Protocol** - Shared TypeScript types defining the 6-event SSE contract imported by both server and client (completed 2026-03-25)
- [x] **Phase 39: Server Stream Processing** - Async generator that iterates Agent SDK streaming output and yields typed SSE events (completed 2026-03-25)
- [x] **Phase 40: Express SSE Endpoint** - HTTP handler that wires the stream generator to POST /api/chat/stream with validation and SSE headers (completed 2026-03-25)
- [x] **Phase 41: Client Stream Hook** - React hook that consumes the SSE stream via fetch/ReadableStream and exposes reactive streaming state (completed 2026-03-25)
- [x] **Phase 42: ChatPage Streaming UI** - Incremental text rendering, tool activity indicators, smart auto-scroll, and graceful fallback in ChatPage (completed 2026-03-25)
- [x] **Phase 43: Verification and Session Fix** - Fix session ID continuity bug, add missing verification docs, update requirement checkboxes [Gap Closure] (completed 2026-03-25)

## Phase Details

### Phase 38: SSE Event Protocol
**Goal**: Server and client share a compile-time contract for all streaming events, preventing protocol drift
**Depends on**: Nothing (first phase of v2.6)
**Requirements**: PROTO-01, PROTO-02, PROTO-03
**Success Criteria** (what must be TRUE):
  1. A TypeScript discriminated union type defines all 6 SSE event kinds (session, text-delta, tool-start, tool-end, done, error)
  2. The `done` event type carries a `text` field containing the full assembled response
  3. The `error` event type carries a `message` field for user-friendly display and an optional `partialText` field
  4. Both `packages/server` and `packages/client` can import the SSE event types from `packages/shared`
**Plans**: 1 plan

Plans:
- [ ] 38-01-PLAN.md — Define SSE event types, re-export from shared package

### Phase 39: Server Stream Processing
**Goal**: The agent service can stream LLM responses as a sequence of typed events, handling tool calls and errors in real-time
**Depends on**: Phase 38
**Requirements**: SRVR-03, SRVR-04, SRVR-05, SRVR-06
**Success Criteria** (what must be TRUE):
  1. A `chatStream()` async generator yields typed SSE events by iterating the Agent SDK with `includePartialMessages: true`
  2. Tool-start events are emitted when the agent begins a tool call and tool-end events when the tool completes
  3. The generator terminates cleanly when an abort signal fires (client disconnect), preventing memory leaks
  4. An idle timeout (no new events for extended period) terminates the stream instead of a monolithic request timeout
**Plans**: 1 plan

Plans:
- [ ] 39-01-PLAN.md — Implement chatStream async generator with TDD (streaming, tool events, abort, idle timeout)

### Phase 40: Express SSE Endpoint
**Goal**: The streaming chat endpoint is reachable over HTTP and can be tested with curl before any client changes
**Depends on**: Phase 39
**Requirements**: SRVR-01, SRVR-02
**Success Criteria** (what must be TRUE):
  1. POST /api/chat/stream accepts JSON body with message, sessionId, and model fields
  2. Invalid input returns a standard JSON error response before SSE headers are sent
  3. Valid requests return `Content-Type: text/event-stream` with properly formatted SSE data lines
**Plans**: 1 plan

Plans:
- [x] 40-01-PLAN.md — Implement SSE chat stream handler with TDD (validation, SSE formatting, abort handling, route registration)

### Phase 41: Client Stream Hook
**Goal**: React components can consume streaming chat responses through a clean hook interface without knowing SSE details
**Depends on**: Phase 40
**Requirements**: CLNT-01, CLNT-02, CLNT-03, CLNT-04, CLNT-05
**Success Criteria** (what must be TRUE):
  1. The `useStreamingChat` hook sends a POST request and reads the SSE response via `fetch()` with `ReadableStream`
  2. Streaming text accumulates into reactive state that updates as text-delta events arrive
  3. The currently active tool name is tracked from tool-start/tool-end events and exposed as reactive state
  4. When the `done` event arrives, an onComplete callback fires with the full response text and sessionId
  5. If the SSE connection fails to establish, the hook falls back to the existing tRPC chat mutation
**Plans**: TBD

Plans:
- [ ] 41-01: TBD

### Phase 42: ChatPage Streaming UI
**Goal**: Users experience real-time token-by-token chat responses with tool activity feedback and no regressions to existing chat features
**Depends on**: Phase 41
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06
**Success Criteria** (what must be TRUE):
  1. User sees text tokens appear incrementally in the assistant message bubble as the LLM generates them
  2. User sees a human-readable tool activity label (e.g., "Checking your budget...") when the agent calls a tool
  3. Chat auto-scrolls during streaming but stops auto-scrolling if the user scrolls up to read earlier messages
  4. Bouncing dots loading indicator shows only before the first text token arrives, then disappears
  5. Confirmation buttons (Confirm/Cancel) appear after the stream completes, parsed from the full response text
**Plans**: 1 plan

Plans:
- [ ] 42-01: Wire streaming hook into ChatPage with live bubble, tool indicator, smart scroll

### Phase 43: Verification and Session Fix
**Goal**: All v2.6 requirements are verified, documented, and the session ID continuity bug is fixed
**Depends on**: Phases 39, 40, 42
**Requirements**: SRVR-01, SRVR-02, SRVR-03, SRVR-04, SRVR-05, SRVR-06, UI-01, UI-02, UI-03, UI-04, UI-05, UI-06
**Gap Closure:** Closes gaps from audit
**Success Criteria** (what must be TRUE):
  1. Session ID fallback in `useStreamingChat.ts` prevents empty session on resumed turns
  2. 40-VERIFICATION.md exists and confirms SRVR-01, SRVR-02 pass
  3. 42-VERIFICATION.md exists and confirms UI-01 through UI-06 pass
  4. All SUMMARY.md files have correct `requirements-completed` YAML frontmatter
  5. All v2.6 requirement checkboxes in REQUIREMENTS.md are checked
**Plans**: 1 plan

Plans:
- [ ] 43-01: Fix session ID bug, create verification docs, update requirements

## Progress

**Execution Order:**
Phases execute in numeric order: 38 → 39 → 40 → 41 → 42

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-13 | v1.0 | 39/39 | Complete | 2026-03-22 |
| 14-17 | v2.0 | 8/8 | Complete | 2026-03-23 |
| 18-20 | v2.1 | 5/5 | Complete | 2026-03-24 |
| 21-25 | v2.2 | 7/7 | Complete | 2026-03-24 |
| 26-28 | v2.3 | 5/5 | Complete | 2026-03-24 |
| 29-32 | v2.4 | 4/4 | Complete | 2026-03-24 |
| 33-37 | v2.5 | 5/5 | Complete | 2026-03-24 |
| 38. SSE Event Protocol | 1/1 | Complete    | 2026-03-25 | - |
| 39. Server Stream Processing | 1/1 | Complete    | 2026-03-25 | - |
| 40. Express SSE Endpoint | v2.6 | 1/1 | Complete | 2026-03-25 |
| 41. Client Stream Hook | 1/1 | Complete    | 2026-03-25 | - |
| 42. ChatPage Streaming UI | 1/1 | Complete   | 2026-03-25 | - |
