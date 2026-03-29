# Phase 55: Client Conversation Lifecycle - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users can navigate between conversations via URL and the chat UI loads the correct conversation state. This phase adds `/chat/:conversationId` as a route parameter, wires ChatPage to load conversation history on navigation, updates the URL after the first message creates a new conversation, handles invalid conversation IDs gracefully, and ensures browser back/forward navigation works between conversations. No sidebar UI or mobile concerns -- purely client-side routing and conversation state management.

</domain>

<decisions>
## Implementation Decisions

### Route Configuration (NAV-01, NAV-02)
- Add `<Route path="chat/:conversationId" element={<ChatPage />} />` alongside the existing `<Route path="chat" element={<ChatPage />} />` in `App.tsx`
- Both routes render the same `ChatPage` component -- `/chat` is the empty/new chat state, `/chat/:conversationId` loads a specific conversation
- react-router v7.13.1 is already installed with BrowserRouter/Routes/Route; `useParams` and `useNavigate` are available from `react-router`

### ChatPage Conversation Loading (NAV-01)
- ChatPage reads `conversationId` from `useParams()` on mount and on param changes
- When `conversationId` is present, fetch conversation data via `trpc.chatHistory.get.queryOptions({ conversationId })` using TanStack Query
- On successful load, populate the `messages` state array from the conversation's `messages` field, mapping each `ChatMessage` to the existing `{ role, content, confirmation }` shape
- Set `selectedModel` from the loaded conversation's `model` field so the model selector reflects the conversation's model (Claude's Decision: prevents confusion when a loaded conversation used a different model than the current selector default)
- Parse assistant messages for confirmation blocks using the existing `parseConfirmation()` function, but mark all confirmations as already responded (Claude's Decision: historical confirmations should not be re-actionable -- they are display-only context)

### URL Update on New Conversation (NAV-01)
- After the SSE stream emits the `conversation` event with a new `conversationId`, update the browser URL to `/chat/{conversationId}` using `useNavigate()` with `{ replace: true }` (Claude's Decision: `replace` prevents a back-button entry for the empty `/chat` state that immediately preceded the conversation, which would feel broken to navigate back to)
- The `useStreamingChat` hook needs a new `onConversation` handler callback in `StreamHandlers` to surface the `conversationId` from the `conversation` SSE event to ChatPage
- ChatPage stores `conversationId` in component state (initially from `useParams`, updated by `onConversation` callback)

### Invalid Conversation Redirect (NAV-03)
- When `trpc.chatHistory.get` returns a NOT_FOUND error for the URL param, redirect to `/chat` via `useNavigate('/chat', { replace: true })` (Claude's Decision: `replace` avoids polluting browser history with the invalid URL)
- No error toast or flash message -- the user simply lands on a fresh chat (from success criteria: "redirects to /chat without an error screen")

### Browser History Navigation (NAV-02)
- Browser back/forward works naturally because each conversation has its own URL and `useParams()` is reactive to route changes
- When the route param changes (user presses back/forward), ChatPage detects the new `conversationId` via a `useEffect` dependency on the param and loads the corresponding conversation (Claude's Decision: useEffect on the params value is the standard react-router pattern for reacting to navigation)
- Navigating back to `/chat` (no param) clears messages and resets to empty state

### useStreamingChat Hook Changes
- Add `onConversation` handler to `StreamHandlers` interface: `onConversation: (conversationId: string) => void`
- Handle the `conversation` SSE event type in the `processStream` switch statement (currently unhandled -- falls through silently)
- Add `conversationId` parameter to the `send` function signature and include it in the fetch request body
- In the tRPC fallback path, pass `conversationId` to `trpc.agent.chat.mutate()` and surface the returned `conversationId` via the `onConversation` handler (Claude's Decision: ensures both SSE and fallback paths provide the conversationId to the caller)

### State Management on Conversation Switch
- When `conversationId` param changes, abort any in-progress stream before loading the new conversation (Claude's Decision: prevents cross-conversation contamination where a streaming response from one conversation bleeds into another)
- Clear `messages`, `streamingText`, `sessionId`, and `respondedConfirmations` state before populating from the loaded conversation
- The existing `sessionId` state in ChatPage can be removed entirely -- the server now manages SDK session IDs via the `conversationId` lookup (from ARCHITECTURE.md anti-pattern 2)

### Model Change Behavior
- When the user changes model via the dropdown, reset to a fresh chat state and navigate to `/chat` (no conversationId) (Claude's Decision: model changes start a new conversation, matching the existing behavior of clearing messages and sessionId)

### TanStack Query Integration
- Use `trpc.chatHistory.get.queryOptions()` with `enabled: !!conversationId` to conditionally fetch only when a conversationId is in the URL
- After a new conversation is created (first message sent), invalidate `trpc.chatHistory.list` query cache so the sidebar (Phase 56) will show the new conversation immediately when it mounts (Claude's Decision: pre-invalidating now avoids Phase 56 needing to add this logic retroactively)

### Claude's Discretion
- Exact loading spinner/skeleton while conversation is being fetched
- Whether to use a separate `useConversation` custom hook or inline the query in ChatPage
- Error handling UX for network failures when loading a conversation (beyond the invalid-ID redirect)
- Whether to debounce rapid back/forward navigation

</decisions>

<specifics>
## Specific Ideas

- The `conversation` SSE event (`{ type: 'conversation', conversationId: string }`) is already emitted by the server (Phase 54) but the client `processStream` switch does not yet handle it -- it silently falls through
- The `ChatMessage` type from chat-history-service includes `tool_calls` as `unknown | null` -- for display purposes, tool call content does not need to be rendered in loaded conversations (tool activity is only shown during live streaming)
- The existing `send()` function signature is `send(message, sessionId, model)` -- it needs `conversationId` added as a fourth parameter, and `sessionId` can be removed since the server manages it
- The `chatHistory.get` tRPC endpoint returns `ConversationWithMessages` which includes `messages: ChatMessage[]` with `role`, `content`, and `tool_calls` fields
- The server `chat-stream-handler.ts` already accepts `conversationId` in the request body and returns 400 for invalid IDs -- the client just needs to send it

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/client/src/hooks/useStreamingChat.ts`: The `processStream` function and `useStreamingChat` hook -- modification targets for adding `conversationId` and `onConversation` handler
- `packages/client/src/pages/ChatPage.tsx`: The main modification target -- already has `messages` state, `parseConfirmation()`, model selector, and streaming UI
- `packages/client/src/trpc.ts`: Exports `useTRPC()` which provides `trpc.chatHistory.get.queryOptions()` for fetching conversations
- `packages/shared/src/sse-events.ts`: Already defines `SSEConversationEvent` with `{ type: 'conversation', conversationId: string }` -- no changes needed

### Established Patterns
- TanStack Query with `trpc.*.queryOptions()` for data fetching (used throughout all pages)
- react-router v7.13.1 with `BrowserRouter`, `Routes`, `Route` -- currently no parameterized routes in the app but `useParams` and `useNavigate` are standard react-router APIs
- ChatPage uses `useState` for messages array and manages streaming state via the `useStreamingChat` hook return values
- `parseConfirmation()` is a pure function that extracts confirmation blocks from assistant messages -- reusable for loaded historical messages

### Integration Points
- `packages/client/src/App.tsx` line 27: Where the `/chat` route is defined -- add the parameterized route here
- `packages/client/src/pages/ChatPage.tsx` line 54: The `sessionId` state that should be removed (server manages it now)
- `packages/client/src/pages/ChatPage.tsx` line 120: The `send()` call in `handleSend` -- needs to pass `conversationId` instead of `sessionId`
- `packages/client/src/hooks/useStreamingChat.ts` line 104: The switch statement in `processStream` -- add `case 'conversation'` handler
- `packages/client/src/hooks/useStreamingChat.ts` line 72: The `body: JSON.stringify(...)` -- add `conversationId` to the payload
- `packages/server/src/agent/chat-stream-handler.ts`: Already accepts `conversationId` in request body (Phase 54) -- no server changes needed
- `packages/server/src/chat-history/chat-history-router.ts`: Already exposes `chatHistory.get` tRPC endpoint -- no server changes needed

</code_context>

<deferred>
## Deferred Ideas

- Conversation sidebar with list, rename, delete, grouping -- Phase 56 (Sidebar UI and Mobile)
- Mobile responsive sidebar overlay -- Phase 56
- Retention cleanup scheduler -- Phase 57
- Keyboard shortcuts for new chat (Cmd+Shift+O) -- deferred per REQUIREMENTS.md (KB-01)
- Conversation search -- deferred per REQUIREMENTS.md (SEARCH-01)
- Stop button for in-progress streams -- deferred per PROJECT.md (STOP-01)
- Disabling sidebar clicks during active stream -- Phase 56 concern

</deferred>

---

*Phase: 55-client-conversation-lifecycle*
*Context gathered: 2026-03-28 via auto-context*
