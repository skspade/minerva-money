# Phase 42: ChatPage Streaming UI - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users experience real-time token-by-token chat responses with tool activity feedback and no regressions to existing chat features. This phase wires the `useStreamingChat` hook (Phase 41) into `ChatPage.tsx`, replacing the tRPC mutation as the primary send path. The assistant message bubble renders incrementally as text-delta events arrive, a tool activity label appears during tool calls, auto-scroll follows new tokens unless the user scrolls up, the bouncing dots indicator shows only before the first token, and confirmation buttons appear after the stream completes using the existing `parseConfirmation()` logic on the full response text. Input remains disabled while streaming (same as today).

</domain>

<decisions>
## Implementation Decisions

### Hook Integration
- Replace `chatMutation.mutate()` with `useStreamingChat.send()` as the primary send path in ChatPage
- The `onComplete` callback receives the full response text and sessionId; it calls `parseConfirmation()` and appends the final assistant message (with confirmation data) to the `messages` array, exactly as `chatMutation.onSuccess` does today
- `useStreamingChat` already falls back to tRPC internally (CLNT-05), so removing the explicit `chatMutation` is safe -- the fallback is transparent to ChatPage (Claude's Decision: keeping a single send path avoids dual code paths and state synchronization bugs)
- Session state (`sessionId`) is updated from the `onComplete` callback's sessionId parameter, matching existing behavior

### Incremental Text Rendering (UI-01)
- While `isStreaming` is true and `streamingText` is non-empty, render a "live" assistant bubble that displays `streamingText` through the existing `<Markdown>` component
- This live bubble is separate from the `messages` array -- it exists only during streaming and is replaced by the final message when `onComplete` fires (Claude's Decision: avoids mutating the messages array on every token; a single reactive streamingText string drives the live bubble without array churn)
- The live bubble uses the same styling as regular assistant messages (white background, rounded corners, prose markdown) for visual consistency
- When `onComplete` fires, the live bubble disappears and the final message is appended to messages with confirmation data attached

### Tool Activity Indicator (UI-02)
- When `activeTool` is non-null during streaming, display a human-readable label below or inside the live assistant bubble
- Map raw tool names to user-friendly labels using a client-side lookup object (Claude's Decision: tool names like `get_budget_summary` are meaningless to users; a static map is simple and covers all 21 tools)
- Tool label examples: `get_account_balances` -> "Checking account balances...", `get_budget_summary` -> "Reviewing your budget...", `list_transactions` -> "Looking up transactions...", `categorize_transaction` -> "Categorizing transaction...", `create_rule` -> "Creating rule...", `trigger_sync` -> "Syncing accounts..."
- Display as a subtle gray italic text line with a small spinner or pulsing dot, visually distinct from message content (Claude's Decision: italic gray text communicates "in progress" without dominating the message bubble)
- The indicator disappears when `activeTool` becomes null (tool-end event clears it in the hook)
- Fallback for unknown tool names: format as `Working on ${toolName.replace(/_/g, ' ')}...` (Claude's Decision: future-proofs against new tools being added without updating the map)

### Smart Auto-Scroll (UI-03)
- Auto-scroll the message container to the bottom as new text arrives during streaming
- Detect when the user manually scrolls up by checking if the scroll position is near the bottom before each auto-scroll (Claude's Decision: standard pattern -- if user is within a threshold of the bottom, they want to follow; if they've scrolled up, they're reading history)
- Use a `useRef` boolean (`userScrolledUp`) that is set to `true` when a scroll event fires and the container is not near the bottom (threshold: ~50px from bottom) (Claude's Decision: 50px threshold accounts for rounding and provides a comfortable "snap zone")
- Reset `userScrolledUp` to `false` when a new message is sent (the user expects to see the response to their message) (Claude's Decision: sending a new message is an implicit intent to see the response)
- Replace the current `useEffect` that calls `scrollIntoView` on every `messages` change with a more granular approach: scroll on new user messages always, scroll during streaming only if not scrolled up (Claude's Decision: the current scroll behavior scrolls on every message change which is correct for non-streaming; streaming needs per-token scroll gating)
- Use `requestAnimationFrame` for scroll updates during streaming to avoid layout thrashing (Claude's Decision: batching scroll updates with rAF prevents jank from high-frequency text-delta events)

### Loading Indicator (UI-04)
- Show the bouncing dots animation only when `isStreaming` is true AND `streamingText` is empty (no text tokens received yet)
- Once the first `text-delta` arrives and `streamingText` becomes non-empty, the dots disappear and the live assistant bubble takes over
- This replaces the current `chatMutation.isPending` condition which shows dots for the entire response duration (Claude's Decision: the dots serve as a "thinking" indicator before content appears; once tokens flow, the incrementally rendering text is its own loading indicator)

### Confirmation Buttons (UI-05)
- Confirmation parsing happens in `onComplete` using the existing `parseConfirmation()` function on the full response text from the `done` event
- Buttons render on the final assistant message in the `messages` array, identical to today's behavior
- No confirmation parsing during streaming -- the `done` event carries the complete text specifically for this purpose (from REQUIREMENTS.md: "Streaming confirmation block parsing -- too fragile with partial JSON; parse from completed message")
- The `respondedConfirmations` set and `handleConfirm`/`handleCancel` functions remain unchanged

### Input Disabling (UI-06)
- Disable the textarea, Send button, and model selector when `isStreaming` is true
- This replaces the current `chatMutation.isPending` guard with `isStreaming` from the hook
- Example questions in the empty state should also be disabled during streaming (Claude's Decision: prevents queuing messages while a response is in flight, matching existing behavior)

### Error Handling
- When the hook's `error` state is non-null, append an error message to the `messages` array with `role: 'error'` (Claude's Decision: matches the existing `chatMutation.onError` pattern of appending an error bubble)
- Clear error state on new send (the hook already resets error internally)
- If the stream produces partial text before an error, the partial text is lost from the UI (the live bubble disappears) (Claude's Decision: displaying partial responses on error adds complexity and the partial text may be incomplete/confusing; clean error display is simpler)

### Testing Approach
- Add or update tests in `packages/client/src/pages/ChatPage.test.ts` (Claude's Decision: ChatPage has no tests currently per PROJECT.md tech debt, but this phase should test the new streaming behavior)
- Test cases: streaming text renders in live bubble, tool activity label appears during tool-start, bouncing dots disappear after first token, confirmation buttons appear after onComplete, input disabled during streaming (Claude's Decision: maps 1:1 to the success criteria)
- Mock `useStreamingChat` hook to return controlled state values (Claude's Decision: unit testing the page component in isolation from the hook; the hook itself is tested in Phase 41)

### Claude's Discretion
- Exact tool label wording for all 21 tools (as long as they are human-readable)
- Whether the tool activity indicator is inside or below the live assistant bubble
- CSS animation style for the tool activity indicator (pulsing dot, spinner icon, etc.)
- Exact auto-scroll threshold value (40px, 50px, 100px)
- Whether to debounce scroll event listeners
- Internal naming for the live bubble component (inline JSX vs extracted component)
- Whether to extract the tool label map to a separate file or keep it in ChatPage

</decisions>

<specifics>
## Specific Ideas

- The 21 agent tool names that need human-readable labels: `get_account_balances`, `get_budget_summary`, `get_spending_by_category`, `get_spending_over_time`, `get_net_worth`, `get_available_to_budget`, `list_transactions`, `get_uncategorized_transactions`, `list_categories`, `list_rules`, `get_sync_status`, `get_transfer_suggestions`, `categorize_transaction`, `create_rule`, `update_rule`, `delete_rule`, `apply_rule`, `set_budget_allocation`, `set_default_allocation`, `confirm_transfer`, `dismiss_transfer`, `trigger_sync`, `create_category_group`, `create_category`
- The existing `parseConfirmation()` function extracts JSON blocks matching `"type": "confirmation"` from markdown code fences -- this runs on the `done` event's `text` field, not on streaming partial text
- The existing ChatPage is 245 lines with a single component and no extracted sub-components. The streaming additions will add complexity; extracting the live bubble and tool indicator as inline JSX blocks within the existing component is likely sufficient
- The `useStreamingChat` hook exposes `{ send, streamingText, activeTool, isStreaming, error }` -- all the reactive state this phase needs
- The `onComplete` callback shape matches the hook's interface: `(text: string, sessionId: string) => void`
- Vite dev proxy already forwards `/api/*` to the Express server (confirmed by Phase 40 curl testing)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/client/src/hooks/useStreamingChat.ts`: Phase 41 output -- the hook that this phase consumes. Exposes `send`, `streamingText`, `activeTool`, `isStreaming`, `error` reactive state.
- `packages/client/src/pages/ChatPage.tsx`: The existing 245-line chat UI with message bubbles, confirmation flow, model selector, bouncing dots, and auto-scroll. This is the file being modified.
- `ChatPage.tsx` `parseConfirmation()`: Existing function that extracts confirmation blocks from completed response text -- reused as-is for the `onComplete` callback.
- `react-markdown` + `remark-gfm`: Already imported and configured for rendering assistant messages -- reused for the live streaming bubble.

### Established Patterns
- Messages stored as `ChatMessage[]` state with `role`, `content`, and `confirmation` fields. New messages appended via `setMessages(prev => [...prev, newMsg])`.
- Confirmation tracking via `respondedConfirmations` Set indexed by message array position.
- Input disabling keyed off `chatMutation.isPending` boolean -- will switch to `isStreaming`.
- Auto-scroll via `useEffect` watching `messages` and `chatMutation.isPending`, calling `messagesEndRef.current?.scrollIntoView()`.
- Model selector resets session state on change (clears messages, sessionId, respondedConfirmations).
- All styling is Tailwind utility classes with no component library.

### Integration Points
- `useStreamingChat` hook imported from `../hooks/useStreamingChat` -- primary new dependency.
- The hook's `send()` function replaces `chatMutation.mutate()` in `handleSend()`.
- The hook's `isStreaming` replaces `chatMutation.isPending` for all disabled/loading state checks.
- The `onComplete` callback bridges streaming completion to the existing messages array and sessionId state.
- The `chatMutation` and `useMutation` import can be removed since the hook handles tRPC fallback internally.

</code_context>

<deferred>
## Deferred Ideas

- Stop button to cancel streaming mid-response -- STOP-01, explicitly deferred from v2.6 per REQUIREMENTS.md
- Collapsible tool call log showing all tools used during a response -- MTOOL-01, explicitly deferred from v2.6
- SSE reconnection on mid-stream disconnect -- RESUME-01, explicitly deferred from v2.6
- Token buffering or speed normalization -- explicitly out of scope per REQUIREMENTS.md
- Streaming tool input JSON display -- explicitly out of scope per REQUIREMENTS.md
- Extracting ChatPage into smaller sub-components (MessageBubble, InputBar, etc.) -- tech debt, not required for this phase

</deferred>

---

*Phase: 42-chatpage-streaming-ui*
*Context gathered: 2026-03-25 via auto-context*
