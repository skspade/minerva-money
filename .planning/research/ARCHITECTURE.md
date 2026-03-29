# Architecture Patterns

**Domain:** Chat history persistence for existing budgeting app with Claude Agent SDK
**Researched:** 2026-03-28

## Critical Finding: SDK Session Storage

**The Claude Agent SDK persists sessions as JSONL files on the filesystem.** The `resume` option on `query()` loads conversation history from these files, not from a `messages` array. This means:

- SDK sessions survive server restarts (filesystem-based)
- Context rebuild = `resume: sessionId` (no message array reconstruction needed)
- The `chat_conversations` table must store the SDK `sessionId` to enable resume
- The `chat_messages` table serves **UI display** and **conversation browsing**, not SDK context rebuild

**This significantly simplifies the design doc's "SDK context rebuild from stored messages" approach.** The stored messages in SQLite are the display layer; the SDK's own session files are the context layer. They stay in sync because every SDK interaction produces both.

**Confidence: HIGH** -- verified by reading `sdk.d.ts` type definitions directly. The SDK Options type has `resume?: string` (session ID) but no `messages` parameter.

### Fallback: Session File Missing

SDK session files could be lost (disk cleanup, deployment). When `resume` fails, the fallback is:
1. Start a new SDK session (no `resume`)
2. Prepend a system-message-style summary of prior conversation to the user's new message
3. The conversation continues with partial context -- acceptable for a budgeting app

This fallback is rare enough that it does not need to be in the initial implementation. A `try/catch` around `resume` with graceful degradation to a new session is sufficient.

## Recommended Architecture

### Component Map (New + Modified)

```
SHARED PACKAGE (packages/shared/src/)
  sse-events.ts .............. MODIFY: add SSEConversationEvent to discriminated union

SERVER (packages/server/src/)
  chat/
    chat-history-service.ts .. NEW: CRUD for conversations + messages (SQLite)
    chat-history-router.ts ... NEW: tRPC router (list, get, delete, updateTitle)
    chat-cleanup-scheduler.ts  NEW: croner job for retention purge
  agent/
    agent-service.ts ......... MODIFY: chatStream() and chat() gain conversationId param,
                               persist messages after exchange, emit conversation event
    chat-stream-handler.ts ... MODIFY: accept conversationId in request body, pass through
    agent-router.ts .......... MODIFY: agent.chat mutation gains conversationId in/out
  db/
    migrations/009-chat-history.sql ... NEW: schema for chat_conversations + chat_messages
  index.ts ................... MODIFY: register cleanup scheduler, import new router

CLIENT (packages/client/src/)
  pages/ChatPage.tsx ......... MODIFY: layout split (sidebar + chat area), conversationId state,
                               URL param integration, conversation loading
  components/
    ConversationSidebar.tsx .. NEW: conversation list, new chat, rename, delete
  hooks/
    useStreamingChat.ts ...... MODIFY: accept + propagate conversationId, handle conversation event
  App.tsx .................... MODIFY: add /chat/:conversationId route
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `chat-history-service.ts` | SQLite CRUD for conversations/messages. Pure data layer, no SDK awareness | agent-service (called after exchange), chat-history-router (tRPC queries) |
| `chat-history-router.ts` | tRPC endpoints for browsing/managing conversations | Client via tRPC, chat-history-service |
| `chat-cleanup-scheduler.ts` | Croner job calling purgeOldConversations on schedule | chat-history-service, index.ts (registration) |
| `agent-service.ts` (modified) | Orchestrates SDK query + message persistence | chat-history-service (persist), chat-stream-handler (caller) |
| `chat-stream-handler.ts` (modified) | HTTP handler accepts/passes conversationId | agent-service (calls chatStream) |
| `ConversationSidebar.tsx` | UI for conversation list, navigation, rename, delete | tRPC chat.*, ChatPage (parent) |
| `ChatPage.tsx` (modified) | Layout orchestrator, state management | ConversationSidebar, useStreamingChat, react-router |

### Data Flow

#### New Conversation Flow

```
User types message in ChatPage
  -> useStreamingChat.send(message, undefined, model, undefined)
    -> POST /api/chat/stream { message, model }
      -> chat-stream-handler validates, calls chatStream(db, ctx, message, signal, undefined, model)
        -> agent-service: no conversationId -> create conversation via chat-history-service
        -> agent-service: call SDK query({ prompt: message, options })
        -> SDK yields system.init -> emit SSE { type: 'session', sessionId }
        -> agent-service: store sdk_session_id on conversation row
        -> agent-service: emit SSE { type: 'conversation', conversationId }
        -> SDK yields stream_event(text-delta) -> emit SSE { type: 'text-delta', text }
        -> SDK yields stream_event(content_block_start, tool_use) -> emit SSE { type: 'tool-start' }
          -> ALSO: capture tool name + toolUseId for storage
        -> SDK yields user.tool_use_result -> emit SSE { type: 'tool-end' }
          -> ALSO: capture tool result for storage
        -> SDK yields result.success -> emit SSE { type: 'done', text }
        -> agent-service: addMessage(db, conversationId, 'user', message)
        -> agent-service: addMessage(db, conversationId, 'assistant', fullText, toolCalls)
    -> Client receives conversation event -> store conversationId in state
    -> Client receives done event -> add to messages array
    -> Client: update URL to /chat/{conversationId} via navigate()
    -> Client: invalidate chat.list query (sidebar updates)
```

#### Resume Conversation Flow

```
User clicks conversation in sidebar OR navigates to /chat/:conversationId
  -> ChatPage: fetch chat.get(conversationId) -> populate messages state for display
  -> User types new message
    -> useStreamingChat.send(message, undefined, model, conversationId)
      -> POST /api/chat/stream { message, model, conversationId }
        -> agent-service: conversationId provided -> load conversation from DB
        -> agent-service: conversation.sdk_session_id exists -> use resume: sessionId
        -> SDK query({ prompt: message, options: { resume: sdk_session_id } })
        -> Normal SSE flow continues (session, conversation, text-delta, done)
        -> agent-service: persist new user + assistant messages
```

#### Tool Call Capture for Storage

The existing `chatStream()` generator already processes `content_block_start` (tool_use) and `user.tool_use_result` events. The modification adds accumulation alongside yielding:

```typescript
// In chatStream() -- existing tool-start handling, add capture:
if (contentBlock.type === 'tool_use' && contentBlock.name) {
  // EXISTING: yield tool-start event
  yield { type: 'tool-start', tool: contentBlock.name };
  // NEW: capture for storage
  pendingToolCalls.push({
    toolName: contentBlock.name,
    toolUseId: (contentBlock as { id?: string }).id || '',
    input: {},
  });
}

// In tool result handling -- capture output:
if (msg.type === 'user' && 'tool_use_result' in msg) {
  // EXISTING: yield tool-end events
  // NEW: attach result to pending tool call
  const result = (msg as { tool_use_result: { content: string } }).tool_use_result;
  if (pendingToolCalls.length > 0) {
    pendingToolCalls[pendingToolCalls.length - 1].output = JSON.stringify(result.content);
  }
}
```

**Note:** Tool input capture is optional for v1. The tool name + output is sufficient for display. Full input capture requires accumulating `input_json_delta` events, which adds complexity for marginal benefit.

## Key State Management

### Dual ID Problem: conversationId vs sessionId

The client manages two IDs that serve different purposes:

| ID | Source | Purpose | Lifecycle |
|----|--------|---------|-----------|
| `conversationId` | Server (UUID, stored in SQLite) | Identifies the conversation for CRUD, URL routing, message persistence | Created once, persists until deleted |
| `sessionId` | SDK (UUID, stored in filesystem JSONL) | Identifies the SDK session for LLM context continuity | Created per SDK query chain, persists in filesystem |

**The conversationId is the stable identifier.** The sessionId is an implementation detail managed server-side. The client should:
1. Track `conversationId` as primary state (persists in URL)
2. NOT track `sessionId` at all -- the server manages SDK session association internally via the `sdk_session_id` column on `chat_conversations`
3. The `session` SSE event can still be emitted for debugging but the client no longer needs to pass `sessionId` back

**This simplifies the client significantly.** Today, `useStreamingChat` captures `sessionId` and ChatPage passes it back on subsequent sends. With conversationId, the server looks up the associated SDK sessionId from the database.

### Server-Side Session Management

The `chat_conversations` table includes:

```sql
sdk_session_id TEXT  -- nullable, set after first SDK response
```

The server flow:
1. First message: create conversation, run SDK query, store `sdk_session_id` from SDK init event
2. Subsequent messages with same conversationId: look up `sdk_session_id`, pass as `resume` to SDK
3. If resume fails (session file missing): start new SDK session, update `sdk_session_id`

### Message Persistence Timing

Messages are persisted **after** the complete exchange, not during streaming. This avoids partial writes on errors/disconnects:

```
SDK stream starts -> accumulate text + tool calls
SDK stream completes (done event) -> persist user message + assistant message in a single db.transaction()
SDK stream errors -> do not persist (conversation stays at its last successful state)
```

## Patterns to Follow

### Pattern 1: Service-First with tRPC Thin Router (existing pattern)

**What:** All business logic in service functions, tRPC routers are thin wrappers with Zod validation.
**When:** All new server features.
**Why:** Matches every other module in the codebase (categories, rules, budget, transfers, sync, agent).

```typescript
// chat-history-router.ts -- thin wrapper
export const chatRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    return listConversations(ctx.db);
  }),
  get: publicProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      return getConversation(ctx.db, input.conversationId);
    }),
  delete: publicProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      deleteConversation(ctx.db, input.conversationId);
    }),
  updateTitle: publicProcedure
    .input(z.object({ conversationId: z.string().uuid(), title: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      updateConversationTitle(ctx.db, input.conversationId, input.title);
    }),
});
```

### Pattern 2: Router Nesting Under Existing Main Router

**What:** New router registered as `chat` namespace in `appRouter`.
**When:** Adding this feature.
**Why:** Matches existing pattern (agent, import, sync are all nested routers).

```typescript
// trpc-router.ts
import { chatRouter } from '../chat/chat-history-router.js';

export const appRouter = router({
  // ... existing 11 routers ...
  chat: chatRouter,  // 12th nested router
});
```

The design doc suggests `chat.history.*` but since the `chat` namespace has no other sub-routers needed, flat `chat.list`, `chat.get`, `chat.delete`, `chat.updateTitle` is simpler and matches the depth pattern of other routers like `accounts.list`, `rules.list`.

### Pattern 3: Scheduler Registration (existing pattern)

**What:** Croner jobs registered in `index.ts` alongside sync and budget schedulers.
**When:** Adding cleanup job.

```typescript
// index.ts
import { startChatCleanupScheduler, stopChatCleanupScheduler } from './chat/chat-cleanup-scheduler.js';

startChatCleanupScheduler(db);

// In SIGTERM handler:
stopChatCleanupScheduler();
```

### Pattern 4: SSE Event Extension (existing pattern)

**What:** Add new event type to the shared discriminated union.
**When:** Adding `conversation` event.

```typescript
// packages/shared/src/sse-events.ts
export interface SSEConversationEvent {
  readonly type: 'conversation';
  readonly conversationId: string;
}

export type SSEEvent =
  | SSESessionEvent
  | SSEConversationEvent  // NEW -- emitted after session event
  | SSETextDeltaEvent
  | SSEToolStartEvent
  | SSEToolEndEvent
  | SSEDoneEvent
  | SSEErrorEvent;
```

### Pattern 5: URL Routing with Optional Param

**What:** Parameterized route for conversation deep links.
**When:** Adding `/chat/:conversationId`.

```typescript
// App.tsx
<Route path="chat" element={<ChatPage />} />
<Route path="chat/:conversationId" element={<ChatPage />} />
```

ChatPage reads the param with `useParams()` from react-router and loads the conversation on mount. Both routes render the same component -- `/chat` shows empty state or last conversation, `/chat/:id` loads a specific one.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Reconstructing SDK Messages Array

**What:** Building a `messages[]` array from stored chat_messages to inject into SDK `query()`.
**Why bad:** The SDK has no `messages` parameter on `query()`. The `resume` option loads from its own JSONL session storage. Attempting to reconstruct would require writing to the SDK's undocumented internal format.
**Instead:** Store and use the `sdk_session_id` for resume. If the SDK session file is lost, degrade gracefully to a new session.

### Anti-Pattern 2: Client-Side sessionId Management for Resume

**What:** Having the client track and pass back `sessionId` for conversation resume.
**Why bad:** The client already tracks `conversationId`. Adding `sessionId` creates confusion about which ID to send when. The server has both IDs in the `chat_conversations` table.
**Instead:** Client sends only `conversationId`. Server looks up `sdk_session_id` internally.

### Anti-Pattern 3: Eager Conversation Creation

**What:** Creating a conversation record before the user sends their first message.
**Why bad:** Creates empty conversations if user navigates away. Requires cleanup logic for orphans.
**Instead:** Create conversation on first message send (server-side). Client starts with no conversationId; receives it from the `conversation` SSE event.

### Anti-Pattern 4: Persisting Messages During Streaming

**What:** Writing each message to SQLite as the stream progresses (user message on send, assistant message token by token).
**Why bad:** Partial writes on disconnect/error leave orphaned messages. Requires rollback logic.
**Instead:** Accumulate during streaming, persist both user + assistant messages atomically after `done` event in a single `db.transaction()`.

### Anti-Pattern 5: Over-engineering the Sidebar

**What:** Building virtual scrolling, pagination, search, or filtering for the conversation list.
**Why bad:** Single-user app with 90-day retention. At most a few hundred conversations. Simple `listConversations()` returning all rows is sufficient.
**Instead:** Flat list ordered by `updated_at DESC`. Add pagination later if needed (it will not be needed).

## Schema Design

```sql
-- Migration 009-chat-history.sql

CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,                    -- crypto.randomUUID()
  title TEXT NOT NULL DEFAULT 'New conversation',
  model TEXT NOT NULL,                    -- model ID used for this conversation
  sdk_session_id TEXT,                    -- nullable: set after first SDK response
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  tool_calls TEXT,                        -- JSON array for assistant messages with tools
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON chat_messages(conversation_id, created_at);
```

**Key difference from design doc:** Added `sdk_session_id` column to `chat_conversations`. This is the bridge between our persistence layer and the SDK's session storage.

**Note on migration numbering:** The design doc says `008_chat_history.sql` but migration `008-account-relink.sql` already exists. This should be `009-chat-history.sql`.

## Suggested Build Order

Dependencies flow strictly downward. Each phase builds on the previous.

### Phase 1: Schema + Service Layer (no UI changes)

1. **Migration 009-chat-history.sql** -- tables + indexes
2. **chat-history-service.ts** -- CRUD functions (createConversation, addMessage, listConversations, getConversation, deleteConversation, updateConversationTitle, purgeOldConversations) + tests
3. **chat-history-router.ts** -- tRPC endpoints (list, get, delete, updateTitle) + register in appRouter as `chat` router

**Why first:** Everything else depends on the data layer. Tests validate the service in isolation. The tRPC router can be tested immediately.

### Phase 2: SSE Protocol + Server Integration

4. **sse-events.ts** -- add `SSEConversationEvent` to shared types
5. **agent-service.ts** -- modify `chatStream()` to accept conversationId, create/load conversations, persist messages after exchange, emit conversation event, capture tool calls for storage, store sdk_session_id
6. **chat-stream-handler.ts** -- accept conversationId in Zod schema, pass to chatStream()
7. **agent-router.ts** -- add conversationId to agent.chat mutation input/output (tRPC fallback path)

**Why second:** Server must be able to create and persist conversations before the client can display them. This phase is testable via curl.

### Phase 3: Client Integration (conversation lifecycle)

8. **useStreamingChat.ts** -- handle `conversation` SSE event (new case in switch), accept/propagate conversationId in send() and processStream(), add `onConversation` handler
9. **App.tsx** -- add `/chat/:conversationId` route alongside existing `/chat`
10. **ChatPage.tsx** -- add conversationId state from useParams(), load conversation on mount/navigation, update URL on new conversation via `useNavigate()`, pass conversationId to send(), remove sessionId from client state

**Why third:** Client changes depend on the SSE protocol and server being ready. This phase makes conversations work end-to-end without sidebar.

### Phase 4: Sidebar + Polish

11. **ConversationSidebar.tsx** -- new component: conversation list via `chat.list` query, "New Chat" button, inline rename, delete with confirmation
12. **ChatPage.tsx** -- integrate sidebar into layout (flex row: sidebar + chat area), responsive behavior (overlay on mobile, persistent on desktop), model change starts new conversation

**Why fourth:** The sidebar is pure UI on top of working conversation CRUD. Can be styled and polished independently.

### Phase 5: Cleanup Scheduler

13. **chat-cleanup-scheduler.ts** -- croner job + registration in index.ts + SIGTERM cleanup

**Why last:** Least critical. Conversations accumulate slowly (single user). Can ship without this initially.

## Sources

- Claude Agent SDK `sdk.d.ts` type definitions (local: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`) -- Options type, query function signature, resume mechanism
- Existing codebase direct inspection: agent-service.ts, chat-stream-handler.ts, sse-events.ts, trpc-router.ts, ChatPage.tsx, useStreamingChat.ts, App.tsx, index.ts, agent-router.ts
- Design document: `.planning/designs/2026-03-28-chat-history-design.md`
- Migration directory listing: `packages/server/migrations/` (008 already taken)

---
*Architecture research for: Minerva Money v2.9 -- Chat History Persistence*
*Researched: 2026-03-28*
