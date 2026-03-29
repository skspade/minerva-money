# Phase 56: Sidebar UI and Mobile - Research

**Researched:** 2026-03-28
**Status:** Complete

## Phase Boundary

Phase 56 is purely client-side UI. All server endpoints (`chatHistory.list`, `chatHistory.get`, `chatHistory.delete`, `chatHistory.updateTitle`) are already built by Phases 53-55. No migrations, no server changes needed.

## Existing Code Analysis

### ChatPage.tsx (377 lines)
- Outermost div: `fixed inset-0 top-0 md:top-[56px] bottom-[calc(env(safe-area-inset-bottom)+60px)] md:bottom-0 flex flex-col bg-gray-50 z-10`
- Already has `conversationId` state (line 60), `isStreaming` from `useStreamingChat` (line 137), `useNavigate`, `queryClient`
- Already invalidates `trpc.chatHistory.list` on new conversation (line 134)
- Already handles URL-based conversation switching and browser back/forward (lines 108-120)
- `handleModelChange` resets conversation state and navigates to `/chat` (line 199-204)

### Data Types Available
- `ConversationSummary`: `{ id, title, model, message_count, created_at, updated_at }` from chat-history-service.ts
- `listConversations()` returns array ordered by `updated_at DESC` -- sidebar just needs to group these

### tRPC Endpoints (chat-history-router.ts)
- `chatHistory.list` -- query, returns `ConversationSummary[]`
- `chatHistory.get` -- query, takes `{ conversationId }`
- `chatHistory.delete` -- mutation, takes `{ conversationId }`
- `chatHistory.updateTitle` -- mutation, takes `{ conversationId, title }`

### Existing UI Patterns
- **Mobile breakpoint**: `md:` (768px) used consistently: `md:hidden` for mobile-only, `hidden md:block` for desktop-only
- **Overlay pattern**: `fixed inset-0 bg-black/40 z-50` for backdrop (MoreSheet.tsx line 31)
- **Icon library**: lucide-react already installed; Pencil, Trash2, Plus, Clock, History, X all available
- **Bottom tab bar**: `BottomTabBar.tsx` uses `z-40`, so sidebar overlay at `z-50` will layer correctly
- **Navigation**: `useNavigate()` for programmatic, `NavLink` for active-state links
- **vaul Drawer**: Used in MoreSheet for bottom-sheet; NOT appropriate for left-sidebar (slides from bottom)

### Layout Integration Points
- ChatPage line 214: outermost `<div>` needs restructuring to flex row with sidebar + chat area
- The `fixed inset-0` positioning on ChatPage needs adjustment for desktop sidebar width
- ChatPage already has a `bottom-[calc(env(safe-area-inset-bottom)+60px)]` for mobile bottom tab bar

## Implementation Approach

### Component Structure
1. **ConversationSidebar.tsx** -- new component in `packages/client/src/components/`
   - Self-contained: fetches own data via `trpc.chatHistory.list.queryOptions()`
   - Props: `conversationId?: string`, `isStreaming: boolean`, `onClose?: () => void`
   - Contains all sidebar UI: new chat button, grouped list, inline rename, delete

2. **Helper functions** -- pure utility functions, either in the component file or a separate utils file
   - `formatRelativeTime(dateString)` -- returns "Just now", "5m ago", "2h ago", "Yesterday", "3d ago", "Mar 15"
   - `groupConversationsByRecency(conversations)` -- groups into "Today", "Yesterday", "Previous 7 Days", "Older"
   - `getModelBadge(model)` -- maps model ID to abbreviation and color

3. **ChatPage.tsx modifications** -- wrap existing content in flex layout, add mobile toggle state

### Desktop Layout
```
┌──────────────────────────────────────────────┐
│ ┌──────────┬───────────────────────────────┐ │
│ │ Sidebar  │  Chat Area (existing)         │ │
│ │ (280px)  │  - Messages                   │ │
│ │          │  - Input bar                  │ │
│ │ New Chat │                               │ │
│ │ ──────── │                               │ │
│ │ Today    │                               │ │
│ │  Conv 1  │                               │ │
│ │  Conv 2  │                               │ │
│ │ Yesterday│                               │ │
│ │  Conv 3  │                               │ │
│ └──────────┴───────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Mobile Overlay
- History icon button in chat header area (only visible `md:hidden`)
- Tapping opens left-edge overlay: backdrop (`fixed inset-0 bg-black/40 z-50`) + sidebar panel sliding in from left
- CSS `transform translate-x` transition for slide-in animation
- Selecting a conversation or tapping backdrop calls `onClose()`

### Inline Rename UX
- Edit icon appears on hover (desktop) or always for active conversation
- Clicking replaces title text with `<input>` pre-filled with current title
- Enter saves via `trpc.chatHistory.updateTitle.mutate()`, Escape cancels
- On save: invalidate `trpc.chatHistory.list` query

### Delete UX
- Trash icon appears on hover (desktop) or always for active conversation
- `window.confirm()` before deletion (simple, sufficient for single-user app)
- If deleted conversation is active, navigate to `/chat`
- Invalidate list query after delete

### Streaming Guard
- When `isStreaming === true`, conversation items are visually dimmed and clicks disabled
- Prevents cross-conversation contamination during active streams (Phase 54 deferred item)

## Risk Assessment

### Low Risk
- All server endpoints already exist and are tested
- Data types are well-defined
- UI patterns are established in the codebase
- No state management complexity (local state + TanStack Query)

### Medium Risk
- ChatPage layout restructuring may affect the fixed positioning for mobile bottom tab bar spacing
- Need to ensure the sidebar doesn't interfere with the bottom tab bar z-index layering

### Mitigations
- Test mobile layout carefully: sidebar overlay z-50, bottom tab bar z-40
- Keep ChatPage's `bottom-[calc(env(safe-area-inset-bottom)+60px)]` on the chat area, not the sidebar

## Dependencies

- Phase 55 (conversation lifecycle, URL routing) -- COMPLETE
- lucide-react -- already installed
- TanStack Query -- already integrated
- No new packages needed

---

## RESEARCH COMPLETE
