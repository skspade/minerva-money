# Requirements: Minerva Money

**Defined:** 2026-03-28
**Core Value:** Accurate, auto-synced financial data with envelope budgeting that lets you see where every dollar goes and how spending trends over time.

## v2.9 Requirements

Requirements for Chat History milestone. Each maps to roadmap phases.

### Schema

- [x] **SCHEMA-01**: chat_conversations table persists conversation metadata with id (UUID), title, model, sdk_session_id, created_at, and updated_at columns
- [x] **SCHEMA-02**: chat_messages table persists per-message data with conversation_id FK (CASCADE delete), role, content, tool_calls (JSON), and created_at
- [x] **SCHEMA-03**: Index on chat_messages(conversation_id, created_at) for efficient retrieval

### Service

- [x] **SVC-01**: Chat history service creates conversations with UUID and stores SDK session ID
- [x] **SVC-02**: Chat history service appends messages (user + assistant) with optional tool_calls JSON after each exchange
- [x] **SVC-03**: Chat history service auto-generates conversation title from first user message (~60 chars, truncated at word boundary)
- [x] **SVC-04**: Chat history service lists conversations ordered by updated_at DESC with message count
- [x] **SVC-05**: Chat history service returns full conversation with all messages for browsing and display
- [x] **SVC-06**: Chat history service deletes conversations (CASCADE handles messages)
- [x] **SVC-07**: Chat history service renames conversation title
- [x] **SVC-08**: Chat history service purges conversations older than configurable retention threshold

### API

- [x] **API-01**: tRPC chat.history.list query returns conversation list for sidebar
- [x] **API-02**: tRPC chat.history.get query returns conversation with all messages
- [x] **API-03**: tRPC chat.history.delete mutation removes a conversation
- [x] **API-04**: tRPC chat.history.updateTitle mutation renames a conversation
- [ ] **API-05**: SSE endpoint accepts optional conversationId in request body
- [ ] **API-06**: SSE stream emits conversation event with conversationId early in response
- [ ] **API-07**: Agent service persists user message and assistant response (with tool calls) after each exchange

### Resume

- [ ] **RESUME-01**: Resumed conversations use SDK resume with stored sdk_session_id for full context continuity
- [ ] **RESUME-02**: When SDK session file is missing, gracefully fall back to new session without error
- [ ] **RESUME-03**: Context window management limits injected history to last 20 turns on fallback rebuild

### Sidebar UI

- [ ] **SIDE-01**: Conversation sidebar displays auto-titled conversation list ordered by recency
- [ ] **SIDE-02**: "New Chat" button at top of sidebar starts a fresh conversation
- [ ] **SIDE-03**: Active conversation is visually highlighted in sidebar
- [ ] **SIDE-04**: User can delete a conversation from the sidebar with confirmation
- [ ] **SIDE-05**: User can rename a conversation title inline in the sidebar
- [ ] **SIDE-06**: Sidebar shows relative timestamps ("2h ago", "Yesterday") and model badge per conversation
- [ ] **SIDE-07**: Conversations grouped by recency ("Today", "Yesterday", "Previous 7 days", "Older")

### Mobile

- [ ] **MOBILE-01**: Sidebar hidden by default on screens below 768px
- [ ] **MOBILE-02**: History icon in chat header toggles sidebar as overlay on mobile
- [ ] **MOBILE-03**: Selecting a conversation auto-closes the mobile sidebar overlay

### Navigation

- [x] **NAV-01**: URL routing supports /chat and /chat/:conversationId for direct linking
- [x] **NAV-02**: Browser back/forward navigates between conversations
- [x] **NAV-03**: Invalid conversationId in URL redirects to /chat

### Cleanup

- [ ] **CLEAN-01**: Croner job runs daily at 3 AM purging conversations older than CHAT_RETENTION_DAYS (default 90)
- [ ] **CLEAN-02**: Retention cleanup removes both SQLite rows and associated SDK session JSONL files

## Future Requirements

### Deferred

- **KB-01**: Keyboard shortcuts (Cmd+Shift+O for new chat, Cmd+Shift+S for sidebar toggle)
- **STOP-01**: Stop button for streaming (already deferred in PROJECT.md)
- **MTOOL-01**: Collapsible tool call log (already deferred in PROJECT.md)
- **SEARCH-01**: Search across conversations (premature at single-user scale with 90-day retention)

## Out of Scope

| Feature | Reason |
|---------|--------|
| LLM-generated conversation titles | Extra API call, 1-3s latency, inconsistent quality for short queries — first-message truncation is free and instant |
| Conversation folders / tags / projects | Single-purpose budgeting assistant doesn't need topic organization |
| Export / share conversations | No other users to share with, no compliance requirement |
| Branching / forking conversations | Complex data model, minimal value for Q&A about budgets |
| Pinned / starred conversations | 90-day retention keeps list manageable without pinning |
| Message editing / regeneration | Complex, orthogonal to history persistence |
| Infinite scroll / pagination | Max ~100 conversations with 90-day retention — single query sufficient |
| Conversation archiving (soft delete) | Hard delete simpler, appropriate for single-user with no compliance needs |
| Real-time title evolution | Adds complexity, confuses users when titles change unexpectedly |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01 | Phase 53 | Done |
| SCHEMA-02 | Phase 53 | Done |
| SCHEMA-03 | Phase 53 | Done |
| SVC-01 | Phase 53 | Done |
| SVC-02 | Phase 53 | Done |
| SVC-03 | Phase 53 | Done |
| SVC-04 | Phase 53 | Done |
| SVC-05 | Phase 53 | Done |
| SVC-06 | Phase 53 | Done |
| SVC-07 | Phase 53 | Done |
| SVC-08 | Phase 53 | Done |
| API-01 | Phase 53 | Done |
| API-02 | Phase 53 | Done |
| API-03 | Phase 53 | Done |
| API-04 | Phase 53 | Done |
| API-05 | Phase 54 | Pending |
| API-06 | Phase 54 | Pending |
| API-07 | Phase 54 | Pending |
| RESUME-01 | Phase 54 | Pending |
| RESUME-02 | Phase 54 | Pending |
| RESUME-03 | Phase 54 | Pending |
| NAV-01 | Phase 55 | Pending |
| NAV-02 | Phase 55 | Pending |
| NAV-03 | Phase 55 | Pending |
| SIDE-01 | Phase 56 | Pending |
| SIDE-02 | Phase 56 | Pending |
| SIDE-03 | Phase 56 | Pending |
| SIDE-04 | Phase 56 | Pending |
| SIDE-05 | Phase 56 | Pending |
| SIDE-06 | Phase 56 | Pending |
| SIDE-07 | Phase 56 | Pending |
| MOBILE-01 | Phase 56 | Pending |
| MOBILE-02 | Phase 56 | Pending |
| MOBILE-03 | Phase 56 | Pending |
| CLEAN-01 | Phase 57 | Pending |
| CLEAN-02 | Phase 57 | Pending |

**Coverage:**
- v2.9 requirements: 36 total
- Mapped to phases: 36
- Unmapped: 0

---
*Requirements defined: 2026-03-28*
*Last updated: 2026-03-28 after roadmap creation*
