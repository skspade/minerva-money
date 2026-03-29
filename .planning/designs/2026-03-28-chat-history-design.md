# Chat History — Design

**Date:** 2026-03-28
**Approach:** Hybrid — Database Messages + Lazy SDK Rebuild

## Database Schema

Two new tables for chat persistence:

**`chat_conversations`** — one row per conversation

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | UUID generated server-side |
| `title` | TEXT NOT NULL | Auto-generated from first user message (truncated to ~60 chars) |
| `model` | TEXT NOT NULL | Model used (e.g., `claude-sonnet-4-20250514`) |
| `created_at` | TEXT NOT NULL | ISO 8601 timestamp |
| `updated_at` | TEXT NOT NULL | ISO 8601 timestamp, updated on each new message |

**`chat_messages`** — one row per message turn

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Sequential ID |
| `conversation_id` | TEXT NOT NULL | FK → `chat_conversations.id` ON DELETE CASCADE |
| `role` | TEXT NOT NULL | `'user'` or `'assistant'` |
| `content` | TEXT NOT NULL | Full message text (markdown for assistant) |
| `tool_calls` | TEXT | JSON array of `{toolName, toolUseId, input, output}` for assistant messages with tool use — needed for SDK context rebuild |
| `created_at` | TEXT NOT NULL | ISO 8601 timestamp |

Index on `chat_messages(conversation_id, created_at)` for efficient message retrieval.

**Retention**: A scheduled cleanup (via existing `croner` infrastructure) deletes conversations older than a configurable threshold (default 90 days) by deleting from `chat_conversations` — CASCADE handles messages.

Migration file: `008_chat_history.sql`

## Service Layer

New `packages/server/src/chat/` module with a `chat-history-service.ts`:

**Core functions:**

- **`createConversation(db, model)`** → `{id, title, model, createdAt, updatedAt}`
  - Generates UUID, sets title to "New conversation" (updated after first message)
  - Called when user sends first message with no `conversationId`

- **`addMessage(db, conversationId, role, content, toolCalls?)`** → `{id, conversationId, role, content, createdAt}`
  - Appends message to conversation, updates `updated_at` on the conversation
  - If this is the first user message, auto-generates title from content (first ~60 chars at word boundary)

- **`listConversations(db)`** → `Array<{id, title, model, createdAt, updatedAt, messageCount}>`
  - Returns all conversations ordered by `updated_at DESC`
  - Includes message count via subquery for display

- **`getConversation(db, conversationId)`** → `{conversation, messages[]}`
  - Returns conversation metadata + all messages ordered by `created_at ASC`
  - Used for both browsing and SDK context rebuild

- **`deleteConversation(db, conversationId)`** → `void`
  - Hard delete — CASCADE handles messages

- **`purgeOldConversations(db, maxAgeDays)`** → `{deletedCount}`
  - Deletes conversations where `updated_at` < now - maxAgeDays
  - Called by croner scheduled job

**Integration with agent service:**

- `chatStream()` and `chat()` gain an optional `conversationId` parameter
- After each complete exchange, the service calls `addMessage()` twice (user message, then assistant response with tool calls)
- On resume: `getConversation()` retrieves stored messages, which are formatted into the SDK's `messages` array for context injection

## API Layer (tRPC + SSE)

**New tRPC router: `chat.history`** (nested under main router)

- **`chat.history.list`** (query) — Returns conversation list for sidebar
- **`chat.history.get`** (query) — Returns full conversation with messages (input: `conversationId`)
- **`chat.history.delete`** (mutation) — Deletes a conversation (input: `conversationId`)
- **`chat.history.updateTitle`** (mutation) — Manual title rename (input: `conversationId, title`)

**SSE endpoint changes (`POST /api/chat/stream`):**

Request body gains optional `conversationId`:

```typescript
{ message: string, sessionId?: string, model?: string, conversationId?: string }
```

Response SSE events gain a new event type:

```typescript
{ type: 'conversation', conversationId: string }  // emitted after session event
```

**Flow for new conversation:**

1. Client sends `{message, model}` (no conversationId)
2. Server creates conversation, emits `{type: 'conversation', conversationId: '...'}`
3. Server stores user message, runs agent, stores assistant response
4. Client stores `conversationId` in state for subsequent messages

**Flow for resumed conversation:**

1. Client sends `{message, model, conversationId}` (no sessionId — SDK session is gone)
2. Server loads stored messages via `getConversation()`
3. Server creates new SDK session with prior messages injected
4. Server emits `{type: 'session', sessionId}` and `{type: 'conversation', conversationId}`
5. Proceeds normally — new messages appended to existing conversation

**tRPC fallback (`agent.chat`):** Same changes — gains `conversationId` in input/output.

## Client UI

**ChatPage layout change:**

The chat page gains a conversation sidebar (left panel) and the existing chat area becomes the right panel.

**Sidebar component (`ConversationSidebar`):**

- "New Chat" button at top — clears current conversation, starts fresh
- Scrollable list of past conversations ordered by `updated_at` DESC
- Each item shows: title (truncated), relative time ("2h ago", "Yesterday")
- Active conversation highlighted
- Right-click or swipe reveals "Rename" and "Delete" options
- Fetched via `chat.history.list` query with TanStack Query (refetched when conversation list changes)

**Mobile behavior:**

- Sidebar hidden by default on mobile (< 768px)
- Hamburger/history icon in chat header toggles sidebar as overlay
- Selecting a conversation closes the sidebar overlay

**Conversation loading:**

- Clicking a conversation calls `chat.history.get`, populates `messages` state
- `conversationId` stored in React state (like `sessionId` today)
- No SDK session created until user sends a new message (lazy rebuild)

**URL routing:**

- `/chat` — new conversation (or last active)
- `/chat/:conversationId` — specific conversation
- Enables browser back/forward navigation between conversations

**State changes to ChatPage:**

- New state: `conversationId` (replaces implicit new-conversation assumption)
- `sessionId` still tracked separately (SDK session, may differ from conversation)
- Model selector: changing model on an existing conversation starts a new conversation (model is per-conversation)
- Auto-scroll behavior unchanged within a conversation

**Title generation:**

- After first user message is sent, title is auto-set from message content (first ~60 chars at word boundary)
- Title displayed in sidebar immediately, editable via inline rename

## SDK Context Rebuild Strategy

**When rebuilding context for a resumed conversation:**

1. Load all messages from `chat_messages` for the conversation
2. Build a `messages` array in the Claude Agent SDK's expected format:
   - User messages → `{role: 'user', content: text}`
   - Assistant messages → `{role: 'assistant', content: text}` plus any `tool_use` blocks reconstructed from `tool_calls` JSON
   - Tool results → `{role: 'user', content: [{type: 'tool_result', tool_use_id, content}]}` reconstructed from stored tool call outputs
3. Pass this array as the `messages` option when creating a new SDK session
4. The new user message is sent as the `prompt`

**What gets stored in `tool_calls` column:**

```json
[
  {
    "toolName": "get_account_balances",
    "toolUseId": "toolu_abc123",
    "input": {},
    "output": "{\"accounts\": [...]}"
  }
]
```

This is captured from the SDK's stream events — `content_block_start` (tool_use type) provides the tool name and ID, and the tool result is captured from the SDK's internal execution.

**Context window management:**

- For conversations with many turns, inject only the last N messages (e.g., last 20 turns) to stay within context limits
- Older messages still displayed in UI but not injected into SDK
- A system message prefix like "This is a resumed conversation. Prior messages are shown for context." helps the agent orient

**Limitations:**

- Resumed sessions won't have the agent's internal chain-of-thought from prior turns (only visible messages and tool calls)
- This is acceptable — the agent gets enough context from message history to continue meaningfully

## Scheduled Cleanup & Configuration

**Retention cleanup job:**

- Registered alongside existing croner jobs in `packages/server/src/index.ts`
- Schedule: daily at 3 AM (low-activity window, doesn't conflict with 6 AM/6 PM sync)
- Calls `purgeOldConversations(db, 90)` — configurable via environment variable `CHAT_RETENTION_DAYS` (default 90)
- Logs deleted count to console

**Environment variable:**

```
CHAT_RETENTION_DAYS=90  # optional, defaults to 90
```

**No new dependencies required:**

- UUID generation: `crypto.randomUUID()` (Node built-in)
- Date handling: existing patterns in codebase
- croner: already used for sync and budget funding schedules
