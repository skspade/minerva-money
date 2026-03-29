# Phase 56: Sidebar UI and Mobile - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users can browse, manage, and switch between conversations from a sidebar that works on both desktop and mobile. This phase delivers a new `ConversationSidebar` component with recency-grouped conversation list, inline rename, delete with confirmation, "New Chat" button, active conversation highlighting, relative timestamps, model badges, and a responsive mobile overlay triggered by a history icon in the chat header. All data layer (tRPC `chatHistory` router) and conversation lifecycle (URL routing, `conversationId` state) are already built by Phases 53-55 -- this phase is purely client-side UI.

</domain>

<decisions>
## Implementation Decisions

### Sidebar Component Structure
- New component `packages/client/src/components/ConversationSidebar.tsx` (Claude's Decision: co-located with other shared components like BottomTabBar, MoreSheet -- sidebar is used by ChatPage but is a standalone component)
- Sidebar receives props: `conversationId?: string`, `isStreaming: boolean`, `onClose?: () => void` (Claude's Decision: `onClose` is only used by mobile overlay; `isStreaming` disables clicks to prevent cross-conversation contamination during active streams per Phase 54 CONTEXT.md deferred item)
- Sidebar fetches its own data via `trpc.chatHistory.list.queryOptions()` with TanStack Query (Claude's Decision: self-contained data fetching follows the pattern of other pages like DashboardPage; ChatPage already pre-invalidates this query key on new conversation creation)

### Conversation List Display (SIDE-01, SIDE-06)
- Each conversation item shows: truncated title, relative timestamp ("2h ago", "Yesterday"), and a small model badge (abbreviated: "H" / "S" / "O" for Haiku/Sonnet/Opus)
- Title truncated with CSS `truncate` class (single-line ellipsis) -- the full title is set via `title` attribute for hover tooltip (Claude's Decision: CSS truncation is simpler than re-truncating in JS; title attribute provides full text on hover)
- Relative timestamps computed by a pure helper function `formatRelativeTime(dateString: string): string` returning "Just now", "5m ago", "2h ago", "Yesterday", "3d ago", "Mar 15" (Claude's Decision: short format keeps sidebar compact; falls back to date for anything older than 7 days)

### Recency Grouping (SIDE-07)
- Conversations grouped into buckets: "Today", "Yesterday", "Previous 7 Days", "Older"
- Grouping logic is a pure function `groupConversationsByRecency(conversations: ConversationSummary[]): GroupedConversations` that returns an ordered array of `{ label: string, conversations: ConversationSummary[] }` (Claude's Decision: pure function is testable without React; ordered array preserves display order)
- Group headers rendered as small uppercase gray labels between conversation items
- Empty groups are omitted from display

### New Chat Button (SIDE-02)
- Positioned at the top of the sidebar, full-width, with a plus or pencil/compose icon from lucide-react
- Clicking navigates to `/chat` via `useNavigate()` and calls `onClose?.()` on mobile (Claude's Decision: navigating to /chat without a conversationId triggers ChatPage's existing fresh-chat behavior from Phase 55)

### Active Conversation Highlighting (SIDE-03)
- The conversation matching the current `conversationId` prop gets a distinct background color (e.g., `bg-blue-50 border-l-2 border-blue-600`) while others have `hover:bg-gray-100`
- Active state determined by comparing `conversation.id === conversationId` (Claude's Decision: simple prop comparison is sufficient; no need for URL parsing since ChatPage already passes conversationId)

### Conversation Navigation
- Clicking a conversation item navigates to `/chat/${conversation.id}` via `useNavigate()`
- On mobile, also calls `onClose?.()` to dismiss the overlay (MOBILE-03)
- During active streaming (`isStreaming === true`), conversation items are visually dimmed and clicks are disabled (Claude's Decision: prevents cross-conversation contamination where switching mid-stream could corrupt state -- flagged as a concern in Phase 54 deferred items)

### Inline Rename (SIDE-05)
- Clicking an edit icon (Pencil from lucide-react) on the active conversation toggles inline rename mode
- Inline rename replaces the title text with a text input pre-filled with the current title; Enter saves via `trpc.chatHistory.updateTitle.mutate()`, Escape cancels (Claude's Decision: matches ChatGPT's rename UX per FEATURES.md)
- On successful rename, invalidate `trpc.chatHistory.list` query to refresh the sidebar
- Edit icon only visible on hover (desktop) or always visible for the active conversation (Claude's Decision: reduces visual clutter while keeping the action discoverable)

### Delete Conversation (SIDE-04)
- Clicking a trash icon (Trash2 from lucide-react) shows a `window.confirm()` dialog before deleting (Claude's Decision: native confirm is simple and sufficient for single-user app; REQUIREMENTS.md says "confirmation prompt" without specifying custom modal)
- On confirm, call `trpc.chatHistory.delete.mutate({ conversationId })` then invalidate the list query
- If the deleted conversation is the currently active one, navigate to `/chat` to start fresh (Claude's Decision: prevents displaying a now-nonexistent conversation)
- Trash icon only visible on hover (desktop) or always visible for the active conversation

### Model Badge (SIDE-06)
- Small colored badge next to timestamp: Haiku = gray, Sonnet = blue, Opus = purple (Claude's Decision: color-coding matches model "tier" perception and adds visual differentiation without text clutter)
- Badge shows abbreviated model name extracted from the model ID string: map `claude-haiku-*` to "H", `claude-sonnet-*` to "S", `claude-opus-*` to "O" (Claude's Decision: single-letter abbreviation keeps badge compact in the sidebar)

### Desktop Layout Integration
- ChatPage's outer container changes from single-column to a flex row: sidebar on the left (fixed width ~280px), chat area fills the remaining space
- Sidebar has `min-w-[280px] max-w-[280px]` with `border-r border-gray-200` and `bg-white` (Claude's Decision: 280px is enough for truncated titles + timestamp + badge without feeling cramped; matches typical chat app sidebar widths)
- The sidebar is always visible on screens >= 768px (`hidden md:flex md:flex-col`)
- ChatPage's existing `fixed inset-0` positioning needs adjustment to accommodate the sidebar width on desktop (Claude's Decision: the sidebar becomes part of ChatPage's layout rather than a global layout change, since only the chat route needs it)

### Mobile Overlay (MOBILE-01, MOBILE-02, MOBILE-03)
- On screens < 768px, the sidebar is hidden by default
- A history/clock icon button (Clock or History from lucide-react) is added to the chat header area (above the message area, left side) visible only on mobile (`md:hidden`)
- Tapping the icon opens the sidebar as a left-edge overlay with a semi-transparent backdrop (`fixed inset-0 bg-black/40 z-50`)
- The sidebar slides in from the left with the same content as desktop
- Selecting a conversation or tapping the backdrop calls `onClose()` to dismiss (MOBILE-03)
- Use CSS transitions for slide-in animation (`transform translate-x`) rather than vaul Drawer (Claude's Decision: vaul Drawer pulls from bottom which is wrong for a left sidebar; CSS transform is simpler and gives left-edge slide-in behavior matching standard chat app patterns)

### ChatPage Layout Changes
- ChatPage wraps its existing content in a flex container: `<div className="flex h-full"><ConversationSidebar .../><div className="flex-1 flex flex-col">...existing chat UI...</div></div>`
- Mobile sidebar toggle state managed via `useState<boolean>` in ChatPage (Claude's Decision: local state is sufficient; no need for context or global state since only ChatPage uses the sidebar)
- The mobile header bar with the history icon is rendered inside ChatPage, only on mobile, positioned above the message area

### Claude's Discretion
- Exact Tailwind color values for active/hover states
- Animation duration and easing for mobile slide-in
- Whether rename input gets auto-focus via `useEffect` + `ref.focus()` or `autoFocus` prop
- Exact spacing between sidebar items (py-2 vs py-3)
- Whether to use `useMutation` hook or direct `.mutate()` for rename/delete operations
- z-index values for mobile overlay layers (as long as they're above the chat content)

</decisions>

<specifics>
## Specific Ideas

- FEATURES.md specifies ChatGPT's exact grouping pattern: "Today", "Yesterday", "Previous 7 days", "Older" -- match this exactly per SIDE-07
- FEATURES.md notes model badge as a differentiator: "Shows which model (Haiku/Sonnet/Opus) was used. Helps recall which conversations used expensive models vs quick Haiku queries"
- REQUIREMENTS.md explicitly defers keyboard shortcuts (KB-01: Cmd+Shift+O for new chat, Cmd+Shift+S for sidebar toggle) and conversation search (SEARCH-01) -- both out of scope
- The `ConversationSummary` type from the service includes: `id`, `title`, `model`, `message_count`, `created_at`, `updated_at` -- all fields needed for sidebar display are already available
- ChatPage already invalidates `trpc.chatHistory.list` query key in its `onConversation` callback (line 134) -- the sidebar will automatically re-fetch when a new conversation is created
- Phase 54 deferred "disabling sidebar clicks during active stream to prevent cross-conversation contamination" -- this phase must implement that guard

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/client/src/components/BottomTabBar.tsx`: Pattern for mobile-hidden navigation (`md:hidden`); uses lucide-react icons and NavLink
- `packages/client/src/components/MoreSheet.tsx`: Pattern for overlay/drawer with vaul; auto-closes on navigation via `useEffect` on `location.pathname`
- `packages/client/src/pages/ChatPage.tsx`: The modification target -- currently a full-height fixed-position layout with message area and input bar; already has `conversationId` state, `isStreaming`, `useNavigate`, and TanStack Query integration with `trpc.chatHistory`
- `packages/client/src/trpc.ts`: Exports `useTRPC()` providing `trpc.chatHistory.list.queryOptions()` and mutation hooks
- `lucide-react`: Already installed and used across the app (Home, List, BarChart2, MessageSquare, Pencil, Trash2, Plus, Clock, History are all available icons)
- `vaul` (Drawer): Already installed and used in MoreSheet, TransactionsPage, RulesPage for mobile overlays -- but uses bottom-drawer pattern, NOT left-sidebar pattern

### Established Patterns
- Mobile breakpoint at `md:` (768px) used consistently: `md:hidden` for mobile-only, `hidden md:block` for desktop-only
- Overlay pattern: `fixed inset-0 bg-black/40 z-50` backdrop with content on top (used in MoreSheet, SplitModal, ManualLinkModal)
- TanStack Query cache invalidation via `queryClient.invalidateQueries({ queryKey: trpc.*.queryKey() })` pattern (used in ChatPage line 134)
- Custom Tailwind components with no component library -- all styling is inline Tailwind classes
- `useNavigate()` from react-router for programmatic navigation; `NavLink` for active-state links

### Integration Points
- `packages/client/src/pages/ChatPage.tsx` line 214: The outermost `<div>` with fixed positioning -- must be restructured to include sidebar in the flex layout
- `packages/client/src/pages/ChatPage.tsx` line 137: `isStreaming` from `useStreamingChat` -- passed to sidebar to disable navigation during streaming
- `packages/client/src/pages/ChatPage.tsx` line 60: `conversationId` state -- passed to sidebar for active highlighting
- `packages/client/src/pages/ChatPage.tsx` line 134: `queryClient.invalidateQueries` call for `chatHistory.list` -- already handles sidebar refresh on new conversation
- `packages/server/src/chat-history/chat-history-router.ts`: Already exposes `list`, `get`, `delete`, `updateTitle` -- no server changes needed

</code_context>

<deferred>
## Deferred Ideas

- Keyboard shortcuts for sidebar toggle (Cmd+Shift+S) and new chat (Cmd+Shift+O) -- deferred per REQUIREMENTS.md (KB-01)
- Conversation search across history -- deferred per REQUIREMENTS.md (SEARCH-01)
- Stop button for in-progress streams -- deferred per PROJECT.md (STOP-01)
- Collapsible tool call log -- deferred per PROJECT.md (MTOOL-01)
- Retention cleanup scheduler -- Phase 57
- Message count display in sidebar items -- available in `ConversationSummary.message_count` but not in requirements; can add later if desired

</deferred>

---

*Phase: 56-sidebar-ui-and-mobile*
*Context gathered: 2026-03-28 via auto-context*
