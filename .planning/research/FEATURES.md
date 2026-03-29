# Feature Landscape

**Domain:** Chat history persistence for AI budgeting assistant
**Researched:** 2026-03-28

## Context

This is a subsequent milestone research file for v2.9. The features below describe ONLY what is new:
persistent chat history with conversation browsing, resumption, title generation, and SDK context
rebuild. Existing features (ChatPage with message bubbles, SSE streaming with tool indicators,
model selector with session reset, 21 MCP tools, useStreamingChat hook) are fully shipped and working
but conversations are ephemeral -- lost on page refresh or navigation.

**The core problem:** The current ChatPage stores messages in React state only. Navigating away or
refreshing the browser loses the entire conversation. There is no way to browse past conversations
or resume a prior discussion with the agent. The SDK session (server-side) is also ephemeral --
tied to a `sessionId` that has no persistence layer behind it.

---

## Table Stakes

Features users expect from any AI chat app with history. Missing any = the milestone feels incomplete.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Conversation list sidebar | ChatGPT, Claude.ai, Gemini all have a left sidebar with past conversations. This is the universal pattern for chat history browsing. | Medium | `chat_conversations` table, tRPC `chat.history.list` query, new `ConversationSidebar` component | Ordered by `updated_at DESC`. Each item shows title (truncated) + relative timestamp ("2h ago", "Yesterday"). Active conversation highlighted. Scrollable. |
| New Chat button | Every chat app has a prominent "New Chat" action at top of sidebar. Users need a clear way to start fresh without ambiguity. | Low | Clears `conversationId`, `sessionId`, and `messages` state | Position at top of sidebar. ChatGPT uses a pencil/compose icon. Should also reset to empty state with example questions. |
| Message persistence | Messages must survive page refresh. This is the fundamental promise of "chat history". | Medium | `chat_conversations` + `chat_messages` tables, SSE endpoint integration with `conversationId` | Store user message before agent call, store assistant response after completion. Include `tool_calls` JSON column for SDK rebuild. Two INSERT operations per exchange. |
| Conversation resumption with context | Click a past conversation, send a new message, get a contextual response that understands prior discussion. This is the core value proposition -- without it, history is just a read-only log. | High | SDK context rebuild from stored messages, `getConversation()` service, message-to-SDK-format transform | Must reconstruct Claude SDK `messages` array with `tool_use` and `tool_result` content blocks. New SDK session created lazily on first message in resumed conversation. Highest-complexity feature in the milestone. |
| Auto-generated conversation titles | Conversations named "New conversation" are useless for browsing. Users expect meaningful titles. | Low | Title generation logic in `addMessage()` service | Design specifies first ~60 chars of first user message at word boundary. Simpler and cheaper than LLM-generated titles. Appropriate for single-user app. Example: "What did I spend on groceries this month" becomes title immediately. |
| Delete conversation | Users need to remove irrelevant conversations. Both ChatGPT and Claude.ai support this. | Low | `deleteConversation()` service, CASCADE handles messages, confirmation dialog | Simple confirm dialog before hard delete. No undo needed for single-user. |
| Rename conversation | Auto-titles from first message are often imperfect ("Hey can you help me" is a bad title). Users expect inline rename. | Low | `updateTitle()` mutation, inline text edit in sidebar | ChatGPT pattern: click edit icon, inline text field appears, Enter to save, Escape to cancel. |
| Mobile-responsive sidebar | App is accessed from phones/tablets on the home network. Sidebar must not break mobile layout. | Medium | Overlay/drawer pattern with hamburger toggle, click-outside-to-close | Hidden by default below 768px. History/hamburger icon in chat header toggles overlay from left edge. Selecting a conversation auto-closes overlay. Standard pattern across all major chat apps. |
| URL routing per conversation | Browser back/forward should navigate between conversations. Direct URL access should load a specific conversation. | Low | React Router `/chat/:conversationId` optional param | Current route is `/chat` (flat). Add `/chat/:conversationId` as nested or optional param. Navigate programmatically on conversation select. Handle invalid conversationId gracefully (redirect to `/chat`). |

## Differentiators

Features that add polish beyond basic expectations. Not required but improve the experience for a power user.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Keyboard shortcuts | Power user efficiency. ChatGPT has Cmd+Shift+O (new chat), Ctrl+Shift+S (toggle sidebar). Adds professional feel. | Low | `useEffect` event listeners in ChatPage | Cmd+Shift+O for new chat, Cmd+Shift+S for sidebar toggle. Two keybindings, minimal code. |
| Context window management | Long conversations degrade response quality and increase latency/cost. Sliding window keeps responses sharp. | Medium | Sliding window logic in SDK rebuild function | Design specifies last 20 turns injected into SDK. All messages displayed in UI. System message prefix: "This is a resumed conversation." Prevents context overflow on long-running conversations. |
| Relative timestamp grouping | "Today", "Yesterday", "Previous 7 days", "Older" groups in sidebar. More scannable than a flat list. ChatGPT uses this exact pattern. | Low | Date grouping utility function | Group conversations by recency buckets. Pure display logic, no backend changes. |
| Message count badge | Helps distinguish substantial conversations (25 messages) from quick questions (2 messages) at a glance. | Low | `messageCount` via COUNT subquery in `listConversations` | Already in design doc. Small number next to title or timestamp. |
| Automatic retention cleanup | Prevents unbounded database growth without user intervention. | Low | Croner job calling `purgeOldConversations()` | Daily at 3 AM. Default 90 days via `CHAT_RETENTION_DAYS` env var. Uses existing croner infrastructure alongside sync and budget funding jobs. |
| Model badge in conversation list | Shows which model (Haiku/Sonnet/Opus) was used. Helps recall which conversations used expensive models vs quick Haiku queries. | Low | `model` column already in `chat_conversations` schema | Small label or abbreviated badge. Useful since model affects response quality and the user actively switches between them. |
| Conversation SSE event | Emit `{type: 'conversation', conversationId}` early in SSE stream so client can update URL and sidebar immediately, before agent finishes responding. | Low | New SSE event type in shared types | Enables optimistic sidebar update. Client gets conversationId without waiting for full response. |
| Empty state preservation | When no conversation is selected, show example questions (already built). Clicking one starts a new conversation seamlessly. | Low | Existing `exampleQuestions` array in ChatPage | Already works for the initial empty state. Just ensure it renders when `conversationId` is null and no messages exist. |

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| LLM-generated titles | Extra API call per conversation ($0.001-0.01 each), adds 1-3s latency to first message, and quality is inconsistent for short budgeting queries. ChatOllama and HuggingFace Chat UI both report issues with LLM title quality. | Truncate first user message to ~60 chars at word boundary. Free, instant, deterministic. User can rename manually. |
| Search across conversations | Significant UI complexity (search input, result highlighting, fuzzy matching). Single user with 90-day retention means ~50-100 conversations max. Scrolling a chronological list is fast enough. | Flat chronological list with relative timestamps and grouping. Defer search to future milestone if volume becomes a problem. |
| Conversation folders / tags / projects | Claude.ai added Projects, ChatGPT added folders -- but both serve multi-context power users. A single-purpose budgeting assistant does not need topic organization. | Flat chronological list. 90-day auto-cleanup keeps it manageable. |
| Export / share conversations | No other users to share with. No compliance requirement. Data is in SQLite for manual access if ever needed. | Skip entirely. |
| Branching / forking conversations | Complex data model (tree instead of list), complex UI (branch selector), minimal value for Q&A about budgets. | Linear conversations only. Start a new chat if direction changes. |
| Pinned / starred conversations | Premature organization feature. With 90-day retention and single-user scale, the list never gets long enough to need pinning. | Skip. Recent conversations are already at top. |
| Stop / cancel generation button | Already deferred in PROJECT.md as STOP-01. Orthogonal to history persistence. | Defer to dedicated milestone. |
| Real-time title evolution | Some apps update titles as conversation develops (e.g., after 5 messages). Adds complexity, confuses users when titles change unexpectedly. | Title set once from first user message. Manual rename available if user wants something different. |
| Conversation archiving (soft delete) | Adds `deleted_at` column, filtering logic, "restore" UI. Hard delete is simpler and appropriate for single-user with no compliance needs. | Hard delete with CASCADE. Retention job handles automatic cleanup. |
| Infinite scroll / pagination for conversation list | With 90-day retention, max ~100 conversations. A single query returning all is fine. Pagination adds complexity for no benefit at this scale. | Load all conversations in one query. Re-evaluate if retention is extended significantly. |
| Message editing / regeneration | Complex: requires re-running agent from edited message, handling branching history, UI for "regenerate". Out of scope for history persistence. | Not needed. User can ask a follow-up question to correct course. |

---

## Feature Dependencies

```
chat_conversations + chat_messages tables (migration 008)
    |
    v
chat-history-service.ts (CRUD: create, addMessage, list, get, delete, updateTitle, purge)
    |
    +---> tRPC chat.history router (list, get, delete, updateTitle)
    |         |
    |         v
    |     ConversationSidebar component (list, new chat, delete, rename)
    |         |
    |         v
    |     URL routing (/chat/:conversationId)
    |         |
    |         v
    |     Mobile-responsive overlay behavior
    |
    +---> SSE endpoint gains conversationId param + conversation event
    |         |
    |         v
    |     Message persistence (save user msg + assistant response per exchange)
    |         |
    |         v
    |     SDK context rebuild (load messages, transform to SDK format, inject into new session)
    |
    +---> Croner retention cleanup job (independent, just needs service function)
```

**Critical path:** Schema -> Service -> SSE integration + Message persistence -> SDK context rebuild

**Parallelism opportunity:** Once the service layer is built, the tRPC/sidebar UI track and the SSE/persistence track can proceed in parallel. They converge when the sidebar needs to display conversations that are being created via SSE.

---

## MVP Recommendation

**Must have (ship-blocking):**

1. Database schema + migration -- Foundation for everything
2. Chat history service with full CRUD -- Core logic layer
3. SSE endpoint integration with `conversationId` -- Persistence mechanism
4. Message persistence after each exchange -- The data
5. SDK context rebuild on resume -- The killer feature that makes history useful
6. Conversation sidebar with list, new chat, delete, rename -- The UI
7. URL routing for `/chat/:conversationId` -- Browser navigation
8. Mobile-responsive sidebar overlay -- Mobile usability

**Should have (low effort, high polish):**

9. Keyboard shortcuts (Cmd+Shift+O, Cmd+Shift+S) -- Two keybindings, big quality-of-life
10. Retention cleanup croner job -- Already designed, prevents unbounded growth
11. Context window management (last 20 turns) -- Prevents quality degradation on long conversations
12. Conversation SSE event for optimistic UI updates -- Better perceived performance
13. Relative timestamp grouping in sidebar -- More scannable than flat list

**Defer:**

- Search, folders, export, branching, starred, stop button -- All premature or out of scope
- LLM-generated titles -- Cost and latency for marginal benefit over truncation
- Message editing/regeneration -- Complex, orthogonal to history persistence

---

## Complexity Assessment

| Feature Area | Complexity | Rationale |
|-------------|------------|-----------|
| Database schema | Low | Two tables, one index, one migration file. Standard pattern. |
| Chat history service | Low-Medium | CRUD operations are straightforward. Title generation from first message is simple string truncation. |
| SSE endpoint changes | Medium | Adding `conversationId` param, creating conversation on first message, saving messages after exchange. Must handle both new and resumed flows. |
| SDK context rebuild | High | Transforming stored messages back into Claude SDK format with tool_use/tool_result content blocks. Must handle edge cases: empty tool calls, failed tool calls, long conversations exceeding context window. This is the most technically challenging feature. |
| Conversation sidebar UI | Medium | New component with list rendering, active state, inline rename, delete confirmation. Mobile overlay adds responsive complexity. |
| URL routing | Low | Adding optional param to existing route. React Router handles this natively. |
| Retention cleanup | Low | One croner job, one SQL DELETE with date comparison. Reuses existing scheduling infrastructure. |

**Overall milestone scope:** Medium. The SDK context rebuild is the only High-complexity feature and represents the primary technical risk. Everything else follows established patterns in the codebase.

---

## Sources

- [ChatGPT UX case study - conversation history management](https://shooka95k.com/portfolio-items/chat-gpt-history-and-chat-management-ux-case-study/) -- Sidebar layout, conversation management patterns (MEDIUM confidence)
- [Comparing Conversational AI Tool User Interfaces 2025](https://intuitionlabs.ai/articles/conversational-ai-ui-comparison-2025) -- Cross-app comparison of Claude, ChatGPT, Gemini UX (MEDIUM confidence)
- [ChatOllama: Using AI to Generate Titles for Conversations](https://blog.chatollama.cloud/blog/2025-09-09-improving-ai-chat-experience-with-smart-title-generation/) -- Title generation timing and approaches (MEDIUM confidence)
- [Vercel AI Chatbot - auto title generation discussion](https://github.com/vercel/ai-chatbot/issues/242) -- Community patterns for title generation (LOW confidence)
- [HuggingFace Chat UI - title generation optimization](https://github.com/huggingface/chat-ui/issues/947) -- Problems with LLM-generated titles (MEDIUM confidence)
- [ChatGPT Keyboard Shortcuts guide](https://guides.ai/chatgpt-keyboard-shortcuts/) -- Standard keyboard shortcuts (HIGH confidence)
- [Chat UI Design Patterns 2025](https://bricxlabs.com/blogs/message-screen-ui-deisgn) -- Navigation and categorization patterns (MEDIUM confidence)
- [Message Persistence in Real-Time Chat Applications](https://dev.to/hexshift/implementing-message-persistence-in-real-time-chat-applications-18eo) -- Persist-then-publish pattern, schema design (MEDIUM confidence)
- [ClaudeAI redesigned UX with recent chats and sidebar](https://www.testingcatalog.com/claudeai-rolled-out-redesigned-ux-with-prompt-suggestions-and-recent-chats-feature/) -- Claude.ai sidebar patterns (MEDIUM confidence)
- Existing codebase: `ChatPage.tsx` (current state management), `useStreamingChat.ts` (SSE hook), `agent-service.ts` (SDK session handling), `chat-stream-handler.ts` (SSE endpoint) -- all HIGH confidence

---
*Feature research for: Minerva Money v2.9 Chat History*
*Researched: 2026-03-28*
