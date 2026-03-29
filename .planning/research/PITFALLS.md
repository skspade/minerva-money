# Domain Pitfalls

**Domain:** Chat history persistence — SDK context rebuild, message storage, conversation browsing/resume
**Researched:** 2026-03-28
**Confidence:** HIGH (based on direct codebase analysis of agent-service.ts, chat-stream-handler.ts, ChatPage.tsx, useStreamingChat.ts, SSE event protocol, and verified Claude Agent SDK documentation)

---

## Critical Pitfalls

### Pitfall 1: Design Document Assumes a `messages` Parameter That Does Not Exist on `query()`

**What goes wrong:**
The design document (section "SDK Context Rebuild Strategy") says "Pass this array as the `messages` option when creating a new SDK session." The Claude Agent SDK's `query()` function does NOT accept a `messages` parameter. The `Options` type has `resume` (session ID string), `continue` (boolean), and `forkSession` (boolean) -- but no way to inject an arbitrary message history array. The design's context rebuild approach as written is impossible.

**Why it happens:**
The design conflates the Claude Messages API (which accepts a `messages` array) with the Claude Agent SDK (which manages conversations via disk-persisted JSONL session files). The SDK's `resume` option works by reading the session transcript from `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`, not by accepting in-memory message arrays.

**Consequences:**
If implementation follows the design document literally, the context rebuild code will not compile. The developer will discover this at coding time and either: (a) hack a workaround that's fragile, (b) restructure the approach mid-phase, causing cascading delays, or (c) stuff conversation history into the prompt string, losing tool call context and wasting tokens.

**How to avoid:**
Use the SDK's native session persistence. The current code already uses `resume` with SDK session IDs (agent-service.ts line 37) and does NOT set `persistSession: false`, so SDK sessions already persist to disk as JSONL files. The correct approach:

1. Store the SDK `sessionId` (from the `system` init message) in the `chat_conversations` table alongside the app-level conversation ID
2. On resume, pass the stored SDK session ID to `options.resume` -- the SDK loads full context from its JSONL file automatically
3. Store messages in SQLite for UI display only (sidebar list, conversation browsing, message rendering), NOT for SDK context rebuild
4. The `tool_calls` column in `chat_messages` is still useful for displaying tool activity in historical conversations, but it does not need to round-trip through the SDK

This is simpler, more reliable, and avoids the entire class of message format mismatch bugs.

**Warning signs:**
- Code trying to construct `{role: 'user', content: [{type: 'text', text: '...'}]}` objects for SDK injection
- TypeScript compilation errors about `messages` not existing on `Options`
- Any attempt to write a "message format converter" between SQLite rows and SDK types

**Phase to address:**
Schema design phase. Add `sdk_session_id` column to `chat_conversations`. This changes the entire architecture of resume -- from "reconstruct messages" to "pass session ID."

---

### Pitfall 2: SDK Session Files Accumulate Unbounded on Disk

**What goes wrong:**
Since the SDK persists sessions to `~/.claude/projects/<encoded-cwd>/` as JSONL files by default, every new conversation creates a new file. The app's retention job (croner, daily at 3 AM) deletes old `chat_conversations` rows from SQLite, but the corresponding SDK session files on disk are never cleaned up. Over months, hundreds of JSONL files accumulate. Each file contains the full conversation transcript including tool call inputs/outputs -- potentially several MB per conversation if the agent ran many queries.

**Why it happens:**
The design document's retention job only knows about the SQLite database. It calls `purgeOldConversations(db, 90)` which deletes from `chat_conversations` (CASCADE to `chat_messages`). Nobody told it about the SDK's file-based sessions.

**Consequences:**
Disk usage grows without bound. The `~/.claude/projects/` directory fills with orphaned session files. If the server has limited disk space, this eventually causes problems. The SDK's `listSessions()` returns an ever-growing list.

**How to avoid:**
When the retention job deletes old conversations, it must also delete the corresponding SDK session files. Before deleting conversations, query the `sdk_session_id` values being purged. After deleting from SQLite, delete the JSONL files at `~/.claude/projects/<encoded-cwd>/<sdk_session_id>.jsonl`. Use `fs.unlink()` with error swallowing (the file may already be gone). The encoded cwd replaces every non-alphanumeric character with `-`.

**Warning signs:**
- Growing disk usage in `~/.claude/projects/` directory
- `listSessions()` returning conversations that were deleted from the app

**Phase to address:**
Retention/cleanup phase. The purge function must handle both SQLite rows and SDK session files.

---

### Pitfall 3: Race Condition -- Streaming Response vs. Message Persistence

**What goes wrong:**
The current `chatStream()` generator yields SSE events in real-time as the SDK produces them. The design adds message persistence: after the stream completes, `addMessage()` is called twice (user message, then assistant response). But the SSE `done` event is emitted BEFORE the database writes happen (because the generator yields `done` first, then the caller persists). If the client receives `done`, immediately navigates to a different conversation, and the sidebar refetches the conversation list, the new conversation's messages may not be persisted yet -- the conversation shows up in the sidebar with 0 messages or stale data.

**Why it happens:**
The `chatStream()` generator in agent-service.ts yields events as they arrive from the SDK (line 147-211). The persistence layer wraps the generator. If persistence happens after the generator completes (in the `finally` block or after the for-await loop), there's a window between the client seeing `done` and the database being updated.

**Consequences:**
- Sidebar shows the new conversation but clicking it shows no messages
- Message count in sidebar is wrong for a brief window
- If the client also stores the `conversationId` and immediately sends another message, the previous response may not be persisted yet, causing message ordering issues

**How to avoid:**
Persist the user message BEFORE starting the stream (it's available at request time). Persist the assistant message BEFORE emitting the `done` event. This means the persistence must happen inside the stream handler, not after it. Specifically in `chat-stream-handler.ts`, the flow should be:

1. Receive request with `message` and `conversationId`
2. Create/get conversation, persist user message -> SQLite
3. Start `chatStream()`, accumulate `fullText` and tool calls from events
4. On `result` success from SDK: persist assistant message -> SQLite
5. THEN yield `{type: 'done', text: fullText}` to the client

This requires the stream handler to intercept the `done` event rather than pass it through directly.

**Warning signs:**
- Sidebar showing 0 messages for a conversation that was just active
- TanStack Query refetch returning stale message counts
- Messages appearing out of order in conversation view

**Phase to address:**
SSE endpoint modification phase. The persistence-before-done ordering must be designed into the stream handler from the start.

---

### Pitfall 4: Conversation Switch During Active Stream Corrupts State

**What goes wrong:**
User is in conversation A, sends a message, streaming begins. While streaming is in progress, user clicks conversation B in the sidebar. The client must: (a) abort the active stream for conversation A, (b) clear streaming state, (c) load conversation B's messages. If this isn't handled atomically, several things can break:

- The `onComplete` callback fires for conversation A's stream AFTER the client has switched to conversation B, appending conversation A's response to conversation B's message list
- The `conversationId` state was updated to B, but the in-flight stream's `done` event still references A -- the server persists the message under A, but the client tries to display it under B
- The abort causes the `processStream` catch handler (useStreamingChat.ts line 189-204) to fire the tRPC fallback, which sends the SAME message again (this time to conversation B's context)

**Why it happens:**
The current `useStreamingChat` hook was designed for a single-conversation model. It has one set of state (`streamingText`, `activeTool`, `isStreaming`) that's implicitly tied to "the current conversation." Adding multi-conversation support means this state must be scoped per conversation, or switching must be guarded.

**Consequences:**
Messages appear in the wrong conversation. Duplicate messages from the tRPC fallback. Assistant response from conversation A rendered in conversation B's UI. Worst case: the wrong assistant response gets persisted to the wrong conversation in the database.

**How to avoid:**
Three defenses:

1. **Disable sidebar clicks during active stream.** Simplest approach. The sidebar items are disabled (grayed out, no click handler) while `isStreaming` is true. The user must wait for the response to finish (or a future stop button) before switching. This is the recommended approach for v2.9.

2. **Guard the onComplete callback.** If sidebar switching during streams is allowed, the `onComplete` callback must check that the `conversationId` at completion time matches the `conversationId` at send time. If they differ, discard the result silently.

3. **Abort suppresses tRPC fallback.** The current code (useStreamingChat.ts line 192) already checks `controller.signal.aborted` before falling back. But this check must also cover the case where abort was triggered by a conversation switch, not just by component unmount.

**Warning signs:**
- Messages from one conversation appearing in another
- Duplicate messages after switching conversations
- `onComplete` firing with a stale `conversationId` closure

**Phase to address:**
Client UI phase (sidebar + ChatPage integration). The conversation switching behavior must be defined before building the sidebar.

---

### Pitfall 5: SQLite JSON Column -- tool_calls TEXT With No Validation Causes Silent Corruption

**What goes wrong:**
The `chat_messages.tool_calls` column is `TEXT` storing JSON. better-sqlite3 does not validate JSON on write -- it stores whatever string you give it. If a tool call's `output` field contains a string that wasn't properly serialized (e.g., raw object passed to `JSON.stringify` that contains circular references, or a BigInt value), the write succeeds but `JSON.parse()` on read throws, making the entire message unrecoverable. More subtly, if tool outputs contain very large result sets (e.g., `get_transactions` returning hundreds of transactions), the JSON blob can be several MB per message row.

**Why it happens:**
The tool call data comes from the SDK's stream events, which contain the tool input and output as-is from the MCP tool handlers. The existing tools (query-tools.ts, action-tools.ts) return `{content: [{type: 'text', text: JSON.stringify(...)}]}`, so the output is already a JSON string. But the input comes from the SDK's content block, which may contain types that don't serialize cleanly.

**Consequences:**
- `JSON.parse(row.tool_calls)` throws on read, making the message display fail
- Large tool outputs bloat the database (a conversation with 10 tool calls returning account data could be 1-2 MB per message)
- On conversation load, parsing several large JSON blobs for all messages in a conversation adds latency

**How to avoid:**
1. **Validate before write:** Wrap the `JSON.stringify()` in a try-catch. If serialization fails, store `null` for `tool_calls` rather than corrupting the row. Log a warning.
2. **Truncate tool outputs:** Tool outputs are for context rebuild display, not for SDK injection (per Pitfall 1). Truncate output strings to a reasonable limit (e.g., 2000 chars) before storage. The full data is available in the SDK's session file.
3. **Validate on read:** When parsing `tool_calls` JSON from the database, wrap `JSON.parse()` in a try-catch and return an empty array on failure rather than crashing the conversation view.
4. **Consider skipping tool_calls entirely if using SDK resume:** If context rebuild uses `options.resume` with the SDK session ID (per Pitfall 1's recommendation), tool_calls don't need to be stored at all -- they're only needed for UI display of historical tool activity, which could simply show "Used N tools" without the details.

**Warning signs:**
- `JSON.parse` errors in server logs when loading conversations
- Message rows with multi-MB `tool_calls` values
- Conversation load times increasing with conversation length

**Phase to address:**
Service layer phase (addMessage function). Validation and truncation must be in the persistence function.

---

### Pitfall 6: CASCADE DELETE Without Foreign Key Enforcement

**What goes wrong:**
The design uses `ON DELETE CASCADE` on `chat_messages.conversation_id` referencing `chat_conversations.id`. SQLite has foreign keys disabled by default -- they must be enabled per-connection with `PRAGMA foreign_keys = ON`. The existing codebase already enables this (the migrations use foreign keys throughout), but if a new database connection is created without the pragma (e.g., in a test, a backup script, or the retention cron job), CASCADE won't work. Deleting a conversation leaves orphaned messages.

**Why it happens:**
SQLite's foreign key support is opt-in per connection, not per database. Every new `better-sqlite3` connection must explicitly enable it. The existing `db/connection.ts` does this, but any code that creates a separate connection (common in tests) must also do it.

**Consequences:**
Orphaned `chat_messages` rows accumulate. The `chat_messages` table grows without bound even as conversations are deleted. Disk usage increases. If a conversation ID is reused (unlikely with UUIDs but possible in tests), orphaned messages from a deleted conversation appear in a new one.

**How to avoid:**
Verify that `PRAGMA foreign_keys = ON` is set in the database connection setup (`packages/server/src/db/connection.ts`). Write a test that: creates a conversation, adds messages, deletes the conversation, then verifies messages are gone. This catches any future regression where a code path bypasses the connection setup.

**Warning signs:**
- `chat_messages` count growing despite conversation deletion
- `SELECT COUNT(*) FROM chat_messages WHERE conversation_id NOT IN (SELECT id FROM chat_conversations)` returning non-zero

**Phase to address:**
Schema migration phase. Include a CASCADE verification test.

---

## Moderate Pitfalls

### Pitfall 7: Model Change on Existing Conversation Loses Context

**What goes wrong:**
The current ChatPage (line 133-138) resets all state when the model changes: `setMessages([])`, `setSessionId(undefined)`. The design says "changing model on an existing conversation starts a new conversation (model is per-conversation)." But if the user changes the model while viewing a historical conversation, the current conversation's messages disappear from the UI (state reset) even though they're persisted in the database. The user sees a blank chat and thinks their messages were deleted.

**Why it happens:**
The current `handleModelChange` was designed for ephemeral sessions where messages only exist in React state. With persistence, the messages survive in the database, but the state reset makes them invisible.

**Prevention:**
When changing the model on an existing conversation: (1) start a new conversation (new UUID, new SDK session), (2) navigate to `/chat` (not `/chat/:oldConversationId`), (3) the old conversation remains in the sidebar, accessible and intact. Don't reset `messages` state -- navigate away, which unmounts and remounts with a clean state.

**Warning signs:**
- User changes model and thinks their conversation was deleted
- Conversation still in sidebar but UI is blank

**Phase to address:**
Client UI phase -- model change handler must create a new conversation and navigate.

---

### Pitfall 8: URL Routing Creates Stale State on Browser Back/Forward

**What goes wrong:**
The design adds URL routing: `/chat/:conversationId`. When the user navigates via browser back/forward buttons, React Router updates the URL and the `conversationId` param changes. But the ChatPage component's internal state (`messages`, `sessionId`, `streamingText`) is React state -- it doesn't re-initialize when the URL param changes (the component is already mounted). The user sees conversation A's messages but the URL says conversation B.

**Why it happens:**
React Router doesn't unmount/remount a component when only the params change. The component must detect the param change (via `useEffect` on the param) and reload.

**Prevention:**
Use a `useEffect` that watches `conversationId` from `useParams()`. When it changes: (a) if streaming, abort it, (b) clear local message state, (c) fetch the new conversation's messages via `chat.history.get`. Alternatively, use React Router's `key` prop on the ChatPage route to force a remount: `<Route path="/chat/:conversationId" element={<ChatPage key={conversationId} />} />`.

**Warning signs:**
- URL shows one conversation, messages show another
- Browser back button doesn't visually change the conversation

**Phase to address:**
URL routing phase. Must be implemented together with conversation loading.

---

### Pitfall 9: Auto-Title Generation Creates Meaningless Titles

**What goes wrong:**
The design says "auto-set from message content (first ~60 chars at word boundary)." Many user messages start with generic phrasing: "Hey, can you...", "I was wondering...", "What's my...". Truncating at 60 chars produces titles like "Hey, can you look at my budget and tell me if" -- not useful for scanning a sidebar.

**Why it happens:**
Simple truncation doesn't understand content. The first 60 characters of a message are often preamble, not the actual question.

**Prevention:**
Accept the simple truncation for v2.9 -- it's good enough for MVP. The title is editable via rename, so users can fix bad titles. More sophisticated titling (e.g., using the LLM to generate a summary) adds latency and complexity. If needed later, add a background job that re-titles conversations using a cheap model call after the first exchange completes.

**Warning signs:**
- Multiple sidebar entries starting with "Can you..." or "What's my..."
- User immediately renaming every conversation

**Phase to address:**
Service layer phase. Implement simple truncation first, document as known limitation.

---

### Pitfall 10: Mobile Sidebar Overlay Doesn't Close on Route Change

**What goes wrong:**
The design calls for a sidebar overlay on mobile (< 768px). User opens sidebar, taps a conversation, sidebar closes, conversation loads -- this works. But if the user taps "New Chat," the sidebar must also close AND navigate to `/chat`. If the sidebar close and the navigation happen in the wrong order, the overlay persists over the new empty chat, or the overlay closing animation fights with the page transition.

**Why it happens:**
Two state changes (sidebar open/close + URL navigation) need to be coordinated. If they're in separate event handlers or state updates, React may batch them unpredictably, and the visual result depends on render timing.

**Prevention:**
In the sidebar click handler: (1) set `sidebarOpen = false`, (2) call `navigate()`. These happen in the same synchronous handler, so React batches them into one render. Do NOT use `setTimeout` or `requestAnimationFrame` to sequence them -- let React's batching handle it. Test on mobile viewport specifically.

**Warning signs:**
- Sidebar overlay stays open after selecting a conversation on mobile
- Flash of sidebar content during page transition

**Phase to address:**
Mobile sidebar phase. Test overlay close + navigation together.

---

### Pitfall 11: Retention Job Deletes Conversation Mid-Stream

**What goes wrong:**
The retention job runs daily at 3 AM. If a conversation's `updated_at` is exactly at the threshold boundary and the user happens to be chatting at 3 AM (updating the conversation), there's a race: the job reads `updated_at < threshold`, then the user sends a message (updating `updated_at`), then the job deletes the conversation. The user's active conversation vanishes.

**Why it happens:**
The purge query and the message insertion are not in the same transaction. The purge uses `WHERE updated_at < datetime('now', '-90 days')` which is evaluated at query time, but the user's update happens between the WHERE evaluation and the DELETE execution.

**Prevention:**
This is extremely unlikely in a single-user system with a 90-day retention window. A conversation at the exact 90-day boundary at 3 AM is an edge case of an edge case. However, for safety: (1) the purge should only delete conversations where `updated_at < datetime('now', '-90 days')` AND the conversation has no messages in the last 24 hours. (2) Alternatively, simply accept the risk -- the 90-day window is generous enough that active conversations are never near the threshold.

**Warning signs:**
- Active conversation disappears from sidebar
- 404 when loading a conversation that was just active

**Phase to address:**
Retention phase. Low priority -- document as known theoretical risk.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store tool_calls JSON in TEXT column without schema validation | Simple, no extra columns or tables | Silent corruption if tool output format changes; parse errors on read | Acceptable for v2.9 with try-catch on read |
| Simple 60-char truncation for titles | Zero latency, no LLM call | Poor titles in sidebar | Acceptable for v2.9 with manual rename as escape hatch |
| Disable sidebar during active stream | Prevents race conditions | User can't browse history while waiting for response | Acceptable for v2.9; add stop button in future milestone |
| No pagination on conversation list | Simple query, simple UI | If user has 500+ conversations, sidebar load is slow | Acceptable for 90-day retention; ~180 conversations max at twice-daily use |
| SDK session files not cleaned up | Simpler retention job | Disk usage grows with orphaned JSONL files | Never -- must clean up from the start |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude Agent SDK `resume` | Assuming `resume` works by passing message history | `resume` reads from disk-persisted JSONL session files. Store the SDK session ID and pass it to `options.resume` |
| Claude Agent SDK `resume` cross-directory | Calling `resume` with a session ID from a different `cwd` | Sessions are stored under `~/.claude/projects/<encoded-cwd>/`. The server's `cwd` must be consistent across restarts |
| SDK `persistSession` default | Assuming sessions are ephemeral | Default is `true` -- sessions persist to disk. This is actually what we want for resume |
| better-sqlite3 + JSON | Storing JSON without validating, trusting it round-trips | Always wrap `JSON.parse` on read in try-catch; validate before `JSON.stringify` on write |
| TanStack Query invalidation | Only invalidating `chat.history.list` after message persistence | Must also invalidate `chat.history.get` for the active conversation to show the new message |
| SSE `done` event timing | Emitting `done` before database persistence completes | Persist the assistant message, THEN emit `done` to the client |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading all messages for a conversation on sidebar click | Slow conversation switch for long conversations | Already bounded by context window (~20 turns injected). For UI, load all but render only visible (virtual scroll if needed) | At ~100+ messages per conversation |
| JSON parsing tool_calls on every message render | Jank when scrolling through tool-heavy conversations | Parse once on load, store parsed result in React state | At ~50+ tool calls per conversation |
| sidebar refetch on every message send | Flicker in sidebar after every exchange | Only invalidate `chat.history.list` when conversation metadata changes (new conversation created, title updated), not on every message | At ~20+ conversations with frequent messaging |
| SDK session JSONL files growing without bound | Disk full errors, slow `listSessions()` | Clean up session files alongside SQLite retention | At ~500+ conversations over months |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading state when switching conversations | User clicks conversation, nothing happens for 500ms, then messages appear | Show a skeleton/spinner in the message area immediately on conversation switch |
| Sidebar doesn't indicate which conversation is streaming | User switches away and forgets a response is in progress | Keep the streaming conversation highlighted (pulsing dot or spinner) in the sidebar |
| "New Chat" doesn't scroll to top of sidebar | New conversation added to top of list, but sidebar is scrolled to the bottom | Scroll sidebar to top when creating a new conversation |
| Deleting the active conversation leaves blank screen | User deletes the conversation they're currently viewing | After delete, navigate to `/chat` (new conversation) or the next conversation in the list |
| Confirmation buttons from previous conversation visible | User resumes conversation, old confirmation prompt is still showing Confirm/Cancel | On conversation load, mark all confirmations as responded (stale) |

## "Looks Done But Isn't" Checklist

- [ ] **SDK session ID stored:** Verify that `chat_conversations` has an `sdk_session_id` column and it's populated from the SDK's `system` init message
- [ ] **Resume uses SDK session:** Verify that resuming a conversation passes the stored `sdk_session_id` to `options.resume`, not a reconstructed message array
- [ ] **User message persisted before stream:** Verify that the user's message is written to `chat_messages` BEFORE the SSE stream begins
- [ ] **Assistant message persisted before done event:** Verify that the assistant's response is written to `chat_messages` BEFORE the `done` SSE event is sent to the client
- [ ] **tool_calls JSON validated on write:** Verify that `JSON.stringify` is wrapped in try-catch in `addMessage()`
- [ ] **tool_calls JSON validated on read:** Verify that `JSON.parse` is wrapped in try-catch in `getConversation()`
- [ ] **CASCADE delete works:** Verify with a test: insert conversation + messages, delete conversation, assert messages are gone
- [ ] **SDK session files cleaned up:** Verify that the retention job deletes JSONL files from `~/.claude/projects/` for purged conversations
- [ ] **Conversation switch during stream is safe:** Verify that clicking a sidebar item during active stream either (a) is disabled or (b) aborts cleanly without cross-conversation contamination
- [ ] **Browser back/forward reloads conversation:** Verify that changing `conversationId` URL param triggers a data refetch, not just a URL update
- [ ] **Mobile sidebar closes on selection:** Verify on a mobile viewport that tapping a conversation closes the overlay AND loads the conversation
- [ ] **Stale confirmations handled:** Verify that loading a historical conversation doesn't show actionable Confirm/Cancel buttons from old tool confirmations
- [ ] **Migration number correct:** Verify migration is `009_chat_history.sql` (not `008` as design doc says -- `008_account_relink.sql` already exists)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Messages not persisted (race condition) | LOW | Messages are also in SDK session JSONL files. Rebuild from `getSessionMessages()` if needed |
| SDK session file missing (deleted or corrupted) | MEDIUM | Conversation display works from SQLite. Resume creates a fresh SDK session -- user loses prior context but can continue |
| tool_calls JSON corrupted | LOW | Set `tool_calls = NULL` on affected rows. Tool activity won't display for those messages but conversation is otherwise intact |
| Orphaned SDK session files | LOW | Script to list SDK sessions via `listSessions()`, compare with `chat_conversations.sdk_session_id`, delete unmatched files |
| Wrong conversation receives a message | HIGH | Must manually move the message row to the correct `conversation_id`. Prevention is far cheaper than recovery |
| CASCADE not working (orphaned messages) | LOW | `DELETE FROM chat_messages WHERE conversation_id NOT IN (SELECT id FROM chat_conversations)` |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SDK messages parameter doesn't exist (Pitfall 1) | Schema design | `sdk_session_id` column exists in `chat_conversations`; resume code uses `options.resume` |
| SDK session files unbounded (Pitfall 2) | Retention/cleanup | After purge, verify JSONL files are deleted for purged conversations |
| Stream vs. persistence race (Pitfall 3) | SSE endpoint modification | User message exists in DB before first SSE event; assistant message exists before `done` event |
| Conversation switch during stream (Pitfall 4) | Client UI (sidebar) | Sidebar items disabled during stream OR abort + guard in onComplete callback |
| JSON column corruption (Pitfall 5) | Service layer | try-catch on both write (addMessage) and read (getConversation) for tool_calls |
| CASCADE without FK enforcement (Pitfall 6) | Schema migration | Test: delete conversation, assert messages gone |
| Model change loses context (Pitfall 7) | Client UI | Model change navigates to `/chat`, old conversation intact in sidebar |
| URL routing stale state (Pitfall 8) | URL routing | Browser back/forward triggers conversation reload via useEffect or key prop |
| Meaningless auto-titles (Pitfall 9) | Service layer | Accept for MVP; document manual rename as escape hatch |
| Mobile overlay close timing (Pitfall 10) | Mobile sidebar | Test: tap conversation on mobile, overlay closes AND conversation loads |
| Retention deletes active conversation (Pitfall 11) | Retention | Accepted risk at 90-day window; documented as theoretical edge case |
| Migration number conflict | Schema migration | File is `009_chat_history.sql`, not `008` |

## Sources

- [Claude Agent SDK Sessions documentation](https://platform.claude.com/docs/en/agent-sdk/sessions) -- Sessions persist as JSONL files on disk; `resume` requires session ID and matching `cwd`; no `messages` parameter on `query()`
- [Claude Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript) -- Full `Options` type reference confirming no `messages` field; `persistSession` defaults to `true`
- [Claude Agent SDK TypeScript V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview) -- V2 `createSession()`/`resumeSession()` pattern; still requires session ID for resume
- Direct codebase analysis: `packages/server/src/agent/agent-service.ts` -- `chatStream()` generator yields events in real-time (lines 94-234); `resume` used at line 37/118; `persistSession` not set (defaults to true)
- Direct codebase analysis: `packages/server/src/agent/chat-stream-handler.ts` -- Express handler streams events directly from generator (lines 49-53); no persistence layer between generator and response
- Direct codebase analysis: `packages/client/src/hooks/useStreamingChat.ts` -- Single-conversation state model (lines 151-215); abort-then-fallback pattern (lines 189-204); `onComplete` closure captures stale state
- Direct codebase analysis: `packages/client/src/pages/ChatPage.tsx` -- Model change resets all state (lines 133-138); `sessionId` in React state (line 54); single-conversation assumption throughout
- Direct codebase analysis: `packages/shared/src/sse-events.ts` -- SSE event protocol with 6 event types; no `conversation` event type yet
- Direct codebase analysis: `packages/server/migrations/` -- Latest migration is `008_account_relink.sql`, so next must be `009`

---
*Pitfalls research for: Chat history persistence -- SDK context rebuild, message storage, conversation browsing/resume (v2.9)*
*Researched: 2026-03-28*
