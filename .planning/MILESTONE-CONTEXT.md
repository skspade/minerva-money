# Milestone Context

**Source:** Brainstorm session (Adding chat history to the chat functionality)
**Design:** .planning/designs/2026-03-28-chat-history-design.md

## Milestone Goal

Add persistent chat history so users can browse past conversations and resume them with full agent context. Uses a hybrid approach: SQLite stores all messages for browsing, and the Claude Agent SDK session is lazily rebuilt from stored messages only when the user resumes chatting.

## Features

### Database Schema

Two new tables (`chat_conversations`, `chat_messages`) in migration 008. Conversations track title, model, and timestamps. Messages store role, content, and tool call data (JSON) for SDK context rebuild. CASCADE delete from conversations to messages. Index on `(conversation_id, created_at)`.

### Service Layer

New `chat-history-service.ts` module with CRUD operations: createConversation, addMessage, listConversations, getConversation, deleteConversation, purgeOldConversations. Integrates with existing agent service — `chatStream()` and `chat()` gain `conversationId` parameter and persist messages after each exchange.

### API Layer (tRPC + SSE)

New `chat.history` tRPC router with list, get, delete, and updateTitle endpoints. SSE endpoint gains `conversationId` in request body and emits new `{type: 'conversation'}` event. Resume flow: server loads stored messages, creates new SDK session with injected history.

### Client UI

Conversation sidebar (left panel) with "New Chat" button, auto-titled conversation list, and rename/delete actions. Mobile: sidebar as toggleable overlay. URL routing: `/chat` and `/chat/:conversationId`. Lazy SDK rebuild — no agent session created until user sends a message in a resumed conversation.

### SDK Context Rebuild Strategy

On resume: load messages from DB, build SDK `messages` array with user/assistant/tool_result turns, pass as conversation history to new SDK session. Store tool calls as JSON (`{toolName, toolUseId, input, output}`). Context window management: inject last 20 turns max, display all in UI.

### Scheduled Cleanup & Configuration

Daily 3 AM croner job purges conversations older than 90 days (configurable via `CHAT_RETENTION_DAYS` env var). No new dependencies — uses crypto.randomUUID(), existing croner infrastructure.
