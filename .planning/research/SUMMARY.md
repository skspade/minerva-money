# Project Research Summary

**Project:** Minerva Money v2.9 — Chat History Persistence
**Domain:** Persistent conversation history for Claude Agent SDK-backed chat interface
**Researched:** 2026-03-28
**Confidence:** HIGH

## Executive Summary

Adding persistent chat history to Minerva Money's existing AI chat interface is a well-scoped milestone with zero new dependencies. Every required capability — UUID generation, JSON storage, URL routing, SSE streaming, scheduled cleanup — is already present in the codebase. The recommended approach follows the same layered pattern established by every other feature: SQLite migration, service module with CRUD functions, tRPC router as a thin wrapper, and client-side React state tied to URL params. The critical architectural insight from research is that the Claude Agent SDK already persists conversation sessions as JSONL files on disk via its `resume` mechanism — which means SQLite stores the display layer (messages for the sidebar and conversation view), while the SDK handles the context layer for LLM continuity. These two layers stay in sync because every exchange produces both.

The primary technical risk is the design document's "SDK context rebuild from stored messages" approach, which is architecturally impossible: `query()` has no `messages` parameter. The SDK's `Options` type has `resume: string` (a session ID) but no way to inject an arbitrary message history array. Any implementation that follows the design doc literally will fail to compile. The fix is already known: add an `sdk_session_id` column to `chat_conversations`, store the SDK session ID from the init event, and pass it to `options.resume` on subsequent messages. This is simpler than the design doc's approach, not harder.

The only High-complexity feature in the milestone is conversation resumption, and with the correct SDK approach it reduces to a lookup and a parameter pass. The remaining features — sidebar UI, message persistence, URL routing, retention cleanup — all follow established patterns in this codebase and carry low-to-medium complexity. The milestone is buildable in a clean sequence of five phases with clear verification points at each phase boundary.

## Key Findings

### Recommended Stack

No new dependencies are needed. The entire feature builds on packages already installed and patterns already established. `crypto.randomUUID()` (Node 22 built-in, already used in two server modules) generates conversation IDs. `better-sqlite3` TEXT columns store JSON for tool calls. `react-router` v7's `useParams` and `useNavigate` handle URL routing. `croner` adds a third scheduled job for retention cleanup. The `@anthropic-ai/claude-agent-sdk` `resume` option provides SDK context continuity via its existing JSONL session file mechanism.

Full details: `.planning/research/STACK.md`

**Core technologies:**
- `better-sqlite3 ^11.7.0`: Two new tables (`chat_conversations`, `chat_messages`) with CASCADE foreign key — standard SQLite pattern already proven across 8 migrations
- `@anthropic-ai/claude-agent-sdk ^0.2.81`: `resume: sessionId` in query options handles context continuity from disk-persisted session files — no message array reconstruction needed
- `react-router ^7.13.1`: `useParams()` + `useNavigate()` for `/chat/:conversationId` deep links — both hooks already in the package, not yet used in any page
- `croner ^10.0.1`: Third croner job for daily 3 AM retention cleanup alongside existing sync and budget funding jobs
- `crypto.randomUUID()` (built-in): Consistent UUID pattern already established in `accounts-service.ts` and `import-service.ts`

### Expected Features

The feature set forms a dependency chain. All table-stakes features are achievable because the existing codebase already has SSE streaming, session management, and a working ChatPage — this milestone adds persistence and browsing on top of working foundations.

Full details: `.planning/research/FEATURES.md`

**Must have (table stakes):**
- Conversation list sidebar — universal pattern in all major chat apps; users expect to browse and resume past conversations
- Message persistence across page refresh — the fundamental promise of "chat history"
- Conversation resumption with SDK context — without this, history is a read-only log, not a useful feature
- New Chat button — clear mechanism to start a fresh conversation
- Auto-generated titles from first user message — truncated at word boundary; sufficient for MVP with manual rename as escape hatch
- Delete and rename conversation — standard management actions expected by any chat UI
- Mobile-responsive sidebar overlay — app is accessed from home network on mobile devices
- URL routing per conversation (`/chat/:conversationId`) — browser back/forward must navigate between conversations

**Should have (polish, low effort):**
- Keyboard shortcuts (Cmd+Shift+O new chat, Cmd+Shift+S sidebar toggle) — power user quality-of-life, ~10 lines of code
- Context window management (last 20 turns via SDK resume) — prevents quality degradation on long conversations
- Relative timestamp grouping in sidebar ("Today", "Yesterday", "Previous 7 days") — more scannable than flat list; pure display logic
- Conversation SSE event for optimistic URL update — client gets `conversationId` before stream completes
- Automatic retention cleanup via croner — prevents unbounded database and disk growth

**Defer to future milestone:**
- Search across conversations — overkill at 90-day retention with ~100 conversations max
- LLM-generated titles — cost and latency for marginal benefit over first-message truncation
- Message editing or regeneration — complex, orthogonal to history persistence
- Folders, tags, pinned conversations — premature organization for single-user scale
- Stop/cancel generation button — already deferred in PROJECT.md as STOP-01

### Architecture Approach

The feature fits cleanly into the existing service-first layered architecture. A new `chat/` module under `packages/server/src/` handles CRUD and scheduling. The existing `agent/` module gains `conversationId` awareness. The client gains a `ConversationSidebar` component and URL param handling in `ChatPage`. The key architectural decision: the `chat_conversations` table stores `sdk_session_id` as the bridge between the SQLite display layer and the SDK's filesystem context layer. Client state is simplified — it tracks only `conversationId`; the server looks up the corresponding SDK session ID internally, eliminating the current client-managed `sessionId` state.

Full details: `.planning/research/ARCHITECTURE.md`

**Major components:**
1. `chat-history-service.ts` (NEW) — SQLite CRUD: createConversation, addMessage, listConversations, getConversation, deleteConversation, updateConversationTitle, purgeOldConversations
2. `chat-history-router.ts` (NEW) — tRPC thin wrapper registered as `chat` namespace in `appRouter`
3. `agent-service.ts` (MODIFY) — gains `conversationId` param, creates/loads conversations, persists messages atomically after exchange, emits `conversation` SSE event, stores `sdk_session_id`
4. `ConversationSidebar.tsx` (NEW) — conversation list, new chat button, inline rename, delete with confirmation, mobile overlay
5. `ChatPage.tsx` (MODIFY) — layout split into sidebar + chat area, URL param integration, conversation loading on mount/param change, remove client-managed `sessionId`
6. `chat-cleanup-scheduler.ts` (NEW) — croner job deleting old conversation SQLite rows AND their SDK session JSONL files from disk

### Critical Pitfalls

Full details: `.planning/research/PITFALLS.md`

1. **Design doc assumes a `messages` parameter that does not exist on `query()`** — Add `sdk_session_id` column to `chat_conversations` and use `options.resume: sessionId` instead. SQLite messages serve display only, not SDK context rebuild. Any code constructing a messages array for SDK injection will fail to compile.

2. **SDK session files accumulate unbounded on disk** — The retention job must delete `~/.claude/projects/<encoded-cwd>/<sdk_session_id>.jsonl` files for each purged conversation, not only the SQLite rows. Failure to do this will result in unchecked disk growth over months.

3. **Stream vs. persistence race condition** — Persist the user message before starting the stream. Persist the assistant message before emitting the `done` SSE event. Both writes must complete before the client receives `done`. If `done` is emitted first, the sidebar may show a conversation with 0 messages.

4. **Conversation switch during active stream corrupts state** — For v2.9: disable sidebar clicks while streaming. The `onComplete` callback captures a `conversationId` closure that becomes stale after a switch, potentially appending one conversation's response to another's message list.

5. **URL routing creates stale state on browser back/forward** — React Router does not unmount/remount `ChatPage` when only the `conversationId` param changes. Use a `useEffect` watching the param (or a `key` prop on the route) to clear message state and refetch on param change.

## Implications for Roadmap

Based on research, the build order follows a strict dependency chain. Each phase is independently testable before the next begins.

### Phase 1: Schema and Service Layer

**Rationale:** Everything else depends on the data layer. No UI or protocol changes needed. Can be built and tested in complete isolation via unit tests and direct tRPC calls.
**Delivers:** Migration `009-chat-history.sql` with two tables and CASCADE FK; complete CRUD service with JSON validation; tRPC `chat.*` router registered as 12th namespace in `appRouter`
**Addresses:** Message persistence foundation, conversation CRUD (list, get, delete, rename), retention purge function
**Avoids:** Pitfall 5 (JSON corruption) — try-catch in `addMessage()` and `getConversation()`; Pitfall 6 (CASCADE without FK) — verified with a test deleting a conversation and asserting messages are gone

### Phase 2: SSE Protocol and Server Integration

**Rationale:** Server must be able to create and persist conversations before the client can display them. This phase is independently testable via curl without any client changes.
**Delivers:** Working end-to-end conversation persistence — new conversations created on first message, `sdk_session_id` stored from SDK init event, messages persisted atomically after each exchange, `conversation` SSE event emitted, SDK `resume` path operational for returning conversationId
**Addresses:** Message persistence mechanism, conversation resumption (SDK `resume` path), SSE protocol extension with new `SSEConversationEvent` type
**Avoids:** Pitfall 1 (messages parameter doesn't exist) — use `options.resume: sdk_session_id`; Pitfall 3 (persistence race) — persist assistant message before emitting `done`

### Phase 3: Client — Conversation Lifecycle

**Rationale:** Once the server creates and persists conversations, the client needs to handle `conversationId` state and URL routing. This phase makes the feature work end-to-end without sidebar.
**Delivers:** `useStreamingChat` handles `conversation` SSE event and propagates `conversationId`; `ChatPage` reads `conversationId` from URL params and loads conversation on mount; `App.tsx` gains `/chat/:conversationId` route; browser URL updates after new conversation creation; client stops managing `sessionId`
**Addresses:** URL routing per conversation, browser back/forward navigation, client state simplification
**Avoids:** Pitfall 8 (stale state on URL param change) — `useEffect` or `key` prop on route triggers data refetch when param changes

### Phase 4: Sidebar and Polish

**Rationale:** Sidebar is pure UI on top of working conversation CRUD. Can be styled and iterated independently. Mobile overlay adds responsive complexity that benefits from the rest of the layout being stable first.
**Delivers:** `ConversationSidebar` with conversation list, new chat, inline rename, delete confirmation; ChatPage layout split into flex row; mobile overlay at < 768px; relative timestamp grouping; keyboard shortcuts (Cmd+Shift+O, Cmd+Shift+S)
**Addresses:** All table-stakes UI features; "should have" polish items (timestamp grouping, keyboard shortcuts)
**Avoids:** Pitfall 4 (conversation switch during stream) — disable sidebar clicks while `isStreaming` is true; Pitfall 7 (model change loses context) — navigate to `/chat` on model change rather than resetting state; Pitfall 10 (mobile overlay close timing) — batch state updates in same synchronous handler

### Phase 5: Retention Cleanup

**Rationale:** Least urgent. Conversations accumulate slowly for a single user. Can ship without it for the initial release but should land before v2.9 is considered complete.
**Delivers:** Croner job at daily 3 AM; `purgeOldConversations()` deletes both SQLite rows and SDK JSONL files from disk; `CHAT_RETENTION_DAYS` env var (default 90)
**Addresses:** Automatic retention, prevents unbounded database growth and SDK session file accumulation
**Avoids:** Pitfall 2 (SDK session files accumulate) — query `sdk_session_id` values before DELETE, then delete matching JSONL files via `fs.unlink()` with error swallowing

### Phase Ordering Rationale

- Schema must come first: every other phase depends on the tables existing
- Server integration before client: the client cannot display conversations the server cannot yet create
- Conversation lifecycle before sidebar: URL and state management must work correctly before adding multi-conversation navigation
- Sidebar before cleanup: cleanup is independent but lowest priority — at twice-daily use, conversations won't overflow in the time it takes to build the rest
- The FEATURES.md critical path confirms this order: Schema -> Service -> SSE integration + persistence -> SDK resume path -> sidebar UI
- Note on migration numbering: use `009-chat-history.sql` — `008-account-relink.sql` already exists

### Research Flags

Phases with well-documented patterns (skip additional research-phase):
- **Phase 1:** SQLite schema, better-sqlite3 CRUD, tRPC router nesting — all established patterns in this codebase with direct analogs in existing modules
- **Phase 3:** React Router hooks — `useParams` and `useNavigate` are standard v7; URL param routing is trivial
- **Phase 4:** React component patterns, Tailwind responsive layout — standard; mobile overlay is a well-known pattern
- **Phase 5:** Croner scheduling — already used in two places; third job requires no research

Phase warranting attention during execution (not a blocker, but verify early):
- **Phase 2:** SDK `resume` mechanism — verified from SDK type definitions, but the exact field name for `sdk_session_id` capture from the SDK's `system` init message event should be confirmed early in Phase 2 execution before building the rest of the server integration

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified in codebase; versions confirmed; zero new dependencies; patterns already in use in multiple modules |
| Features | HIGH | Core features derived from codebase analysis of current gaps; UI patterns from ChatGPT/Claude.ai consensus; anti-features well-reasoned with specific rationale |
| Architecture | HIGH | SDK behavior verified from local `sdk.d.ts` type definitions; component map derived from direct codebase inspection; data flow fully specified; anti-patterns identified with exact error scenarios |
| Pitfalls | HIGH | Pitfall 1 (the critical one) verified from SDK type definitions and documentation; remaining pitfalls from direct codebase analysis of existing code paths in agent-service.ts, chat-stream-handler.ts, useStreamingChat.ts, ChatPage.tsx |

**Overall confidence:** HIGH

### Gaps to Address

- **SDK `system` init event field name for session ID capture:** The `sdk_session_id` must be captured from the SDK's initial `system` message in the `chatStream()` generator. The exact field name and event shape should be confirmed against the actual SDK event during Phase 2 execution (type definitions indicate `system` event type but the session ID extraction point needs verification against the live event structure).
- **SDK session file path encoding:** The encoded `cwd` in `~/.claude/projects/<encoded-cwd>/` replaces non-alphanumeric characters with `-`. The exact encoding must be confirmed when implementing retention cleanup in Phase 5 to ensure JSONL file paths are constructed correctly.
- **SDK `resume` failure mode:** When implementing the fallback path (session file missing), the correct detection mechanism needs to be confirmed during Phase 2 — whether the SDK throws on `resume` with a missing session ID, or whether a pre-check via `listSessions()` is preferred. A `try/catch` with fallback to a new session is the expected approach based on the architecture research, but the exact error type/message from the SDK is not yet confirmed.

## Sources

### Primary (HIGH confidence)

- Codebase: `packages/server/src/agent/agent-service.ts` — `chatStream()` generator, `resume` usage at lines 37/118, SDK session handling
- Codebase: `packages/server/src/agent/chat-stream-handler.ts` — SSE streaming pipeline, event pass-through pattern
- Codebase: `packages/client/src/hooks/useStreamingChat.ts` — current single-conversation state model, abort-then-fallback pattern
- Codebase: `packages/client/src/pages/ChatPage.tsx` — current session state at line 54, model change handler at lines 133-138
- Codebase: `packages/shared/src/sse-events.ts` — discriminated union with 6 event types
- Codebase: `packages/server/migrations/` — confirmed 8 migrations exist (001-008), next is 009
- Codebase: `packages/server/src/accounts/accounts-service.ts`, `import-service.ts` — `randomUUID` import and usage pattern
- SDK: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` — `Options` type confirming `resume` field and absence of `messages` parameter
- Runtime: Node 22.19.0 confirmed via `node --version` — `crypto.randomUUID()` stable since Node 19

### Secondary (MEDIUM confidence)

- [Claude Agent SDK Sessions documentation](https://platform.claude.com/docs/en/agent-sdk/sessions) — disk-based JSONL persistence, `resume` mechanism, session ID as the resume key
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) — full `Options` type reference confirming no `messages` field; `persistSession` defaults to `true`
- [Conversational AI UI comparison 2025](https://intuitionlabs.ai/articles/conversational-ai-ui-comparison-2025) — sidebar patterns across ChatGPT, Claude.ai, Gemini
- [ChatGPT UX case study — conversation history management](https://shooka95k.com/portfolio-items/chat-gpt-history-and-chat-management-ux-case-study/) — sidebar layout and management patterns
- [Message persistence in real-time chat applications](https://dev.to/hexshift/implementing-message-persistence-in-real-time-chat-applications-18eo) — persist-then-publish pattern, schema design

### Tertiary (LOW confidence)

- [Vercel AI Chatbot auto title generation discussion](https://github.com/vercel/ai-chatbot/issues/242) — community patterns for title generation timing
- [HuggingFace Chat UI title generation optimization](https://github.com/huggingface/chat-ui/issues/947) — documented problems with LLM-generated titles justifying first-message truncation approach

---
*Research completed: 2026-03-28*
*Ready for roadmap: yes*
