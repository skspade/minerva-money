# Phase 42: ChatPage Streaming UI - Research

**Researched:** 2026-03-25
**Status:** Complete

## Existing Code Analysis

### ChatPage.tsx (245 lines)
- Single component, no extracted sub-components
- Uses `useMutation` from TanStack Query wrapping `trpc.agent.chat`
- `chatMutation.isPending` gates: bouncing dots, input/button/select disabling, confirm/cancel buttons
- `chatMutation.mutate()` called in `handleSend()` with `{ message, sessionId, model }`
- `onSuccess`: calls `parseConfirmation()`, appends assistant message, updates `sessionId`
- `onError`: appends error message to messages array
- Auto-scroll: `useEffect` watching `[messages, chatMutation.isPending]`, calls `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })`
- Confirmation: `respondedConfirmations` Set tracks which messages have been responded to
- Model selector: `handleModelChange` clears messages, sessionId, respondedConfirmations

### useStreamingChat Hook (Phase 41 output)
- Exports: `{ send, streamingText, activeTool, isStreaming, error }`
- `send(message, sessionId?, model?)` — replaces `chatMutation.mutate()`
- `isStreaming` — replaces `chatMutation.isPending`
- `onComplete` callback shape: `(text: string, sessionId: string) => void`
- Internally handles tRPC fallback on SSE failure (CLNT-05)
- Already tested in `useStreamingChat.test.ts` (12 tests for parseSSEChunk + processStream)

### Agent Tool Names (24 tools)
Query tools (12): `get_account_balances`, `get_budget_summary`, `get_spending_by_category`, `get_spending_over_time`, `get_net_worth`, `get_available_to_budget`, `list_transactions`, `get_uncategorized_transactions`, `list_categories`, `list_rules`, `get_sync_status`, `get_transfer_suggestions`

Action tools (12): `categorize_transaction`, `create_rule`, `update_rule`, `delete_rule`, `apply_rule`, `set_budget_allocation`, `set_default_allocation`, `confirm_transfer`, `dismiss_transfer`, `trigger_sync`, `create_category_group`, `create_category`

## Integration Points

### What Changes in ChatPage
1. **Import**: Replace `useMutation` with `useStreamingChat` import
2. **Hook call**: Replace `chatMutation` block with `useStreamingChat({ onComplete })`
3. **handleSend**: Replace `chatMutation.mutate()` with `send(messageText, sessionId, selectedModel)`
4. **Disabled states**: Replace `chatMutation.isPending` with `isStreaming` (6 occurrences)
5. **Bouncing dots**: Change condition from `chatMutation.isPending` to `isStreaming && !streamingText`
6. **New: Live bubble**: Render `streamingText` through `<Markdown>` during streaming
7. **New: Tool indicator**: Show `activeTool` label below live bubble
8. **Auto-scroll**: Replace simple `useEffect` with scroll-gating logic

### What Stays the Same
- `parseConfirmation()` function — untouched
- `ChatMessage` type, `messages` state, `setMessages` pattern
- Confirmation buttons UI and handlers (`handleConfirm`, `handleCancel`)
- Model selector and `handleModelChange`
- Empty state with example questions
- All Tailwind styling for existing elements

## Testing Strategy

### Testable Without React Testing Library
The project's existing page tests (BudgetPage.test.ts, TransactionsPage.test.ts) test **exported utility functions**, not rendered components. Following this pattern:

1. **Tool label map** — export the map, test that all 24 tools have labels and unknown tools get formatted fallback
2. **parseConfirmation** — already tested implicitly by current code (could add explicit tests but it's existing code)

### What Can't Be Unit Tested Easily
- React rendering behavior (live bubble appearing/disappearing)
- Auto-scroll with intersection logic
- These are integration/E2E concerns — the CONTEXT.md acknowledges testing via mocked hook state

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Markdown re-render on every token causes jank | react-markdown already handles incremental content; key the component to avoid unmount/remount |
| Scroll listener fires too frequently | Use passive scroll listener; consider debounce if needed |
| Live bubble flash when onComplete fires | Clear streamingText and append final message in same render cycle via batched state updates (React 18 auto-batches) |
| Example questions clickable during streaming | Gate with `isStreaming` same as other inputs |

## Complexity Assessment

This is a **single-plan phase**. All changes are in one file (`ChatPage.tsx`) plus a new small utility (tool labels). The hook is already built and tested. The work is:
1. Wire hook into ChatPage (replace mutation)
2. Add live streaming bubble + tool indicator
3. Add smart auto-scroll
4. Add tests for the tool label map

Estimated: ~150-200 lines of changes across ChatPage.tsx + new tool-labels utility + tests.

---
*Phase: 42-chatpage-streaming-ui*
*Research completed: 2026-03-25*
