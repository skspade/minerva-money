# Phase 15: Chat UI - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users interact with the agent through a polished chat interface in the web app. This phase delivers the ChatPage component at /chat with a full-height layout, markdown rendering for agent responses, loading states, error display in the chat thread, inline confirmation buttons for actions requiring approval, and a navigation link in the top nav bar. No new server-side agent logic or tools are added -- those belong to Phase 14 (done) and Phase 16.

</domain>

<decisions>
## Implementation Decisions

### Page Layout and Routing
- Add `/chat` route to `app.tsx` with a new `ChatPage` component in `packages/client/src/pages/ChatPage.tsx` (from REQUIREMENTS.md UI-01)
- Add "Chat" NavLink to Layout.tsx navigation bar following the existing NavLink pattern with `isActive` styling (from REQUIREMENTS.md UI-05)
- Full-height chat layout: the chat page fills the available viewport height below the nav bar (from REQUIREMENTS.md UI-01)
- Two-region layout: scrollable message list on top, fixed input bar pinned to the bottom (from REQUIREMENTS.md UI-01)
- Remove the `max-w-6xl` constraint on the chat page main content area so chat uses the full width (Claude's Decision: chat interfaces benefit from wider layout; other pages keep their existing max-width)

### Message Display
- Messages rendered as a vertical list with visual distinction between user messages (right-aligned, colored background) and agent messages (left-aligned, neutral background) (Claude's Decision: standard chat convention makes sender immediately obvious)
- Auto-scroll to the latest message when a new message arrives (Claude's Decision: expected chat behavior)
- Empty state shows a welcome message with example questions the user can ask (Claude's Decision: helps users discover what the agent can do)

### Markdown Rendering
- Use `react-markdown` with `remark-gfm` plugin for agent response rendering (Claude's Decision: lightweight, widely used, supports GFM tables out of the box)
- Render tables, bold, italic, lists, and code blocks with Tailwind prose styling (from REQUIREMENTS.md UI-02)
- Apply `@tailwindcss/typography` prose classes to the markdown container for consistent formatting (Claude's Decision: Tailwind Typography plugin provides sensible defaults for rendered markdown)

### Loading and Input State
- Show a pulsing dot or typing indicator in the message list while the agent is processing (from REQUIREMENTS.md UI-03)
- Disable the send button and input field while a request is in flight to prevent double-sends (from REQUIREMENTS.md UI-03)
- Use tRPC `useMutation` for the `agent.chat` call with local React state for the message list (Claude's Decision: mutations are the correct TanStack Query primitive for chat; local state avoids unnecessary cache complexity)

### Error Handling
- Agent errors (returned in the response or from tRPC failure) display as a styled error message bubble in the chat thread (from REQUIREMENTS.md UI-06)
- Error messages use a distinct visual style (red/orange border or background) so they are clearly distinguishable from normal responses (Claude's Decision: visual distinction prevents users from confusing errors with agent responses)
- Network errors (tRPC transport failures) also render as in-thread error messages, not toast notifications or alerts (from REQUIREMENTS.md UI-06: "not silent failures or raw stack traces")

### Confirmation Flow
- When the agent response contains a confirmation request, render inline "Confirm" and "Cancel" buttons below the message (from REQUIREMENTS.md UI-04)
- Use a structured marker in the agent response to identify confirmation requests (Claude's Decision: agent can include a JSON block with action details that the UI parses to render buttons)
- Clicking "Confirm" sends a follow-up message to the agent (e.g., "Yes, confirm") in the same session; "Cancel" sends a decline (Claude's Decision: keeps confirmation within the existing chat flow without a separate API)

### Session Management
- Store `sessionId` in React component state; new page visit starts a new session (from Phase 14 CONTEXT.md: client receives sessionId in response)
- No persistent chat history across page reloads (from REQUIREMENTS.md Out of Scope: "Persistent chat history database" deferred)

### Claude's Discretion
- Exact Tailwind classes for message bubbles, spacing, and colors
- Exact wording of the empty-state welcome message and example questions
- Input field placeholder text
- Whether to use a textarea or single-line input (both acceptable)
- Animation details for the loading indicator
- Keyboard shortcut details (Enter to send, Shift+Enter for newline)

</decisions>

<specifics>
## Specific Ideas

- The existing nav bar in Layout.tsx uses `NavLink` from react-router with `isActive` conditional class styling -- the Chat link should follow this exact same pattern
- The agent router at `packages/server/src/agent/agent-router.ts` exposes `agent.chat` as a mutation accepting `{ message: string, sessionId?: string }` and returning `{ response: string, sessionId: string }` -- the client calls this directly via `useTRPC().agent.chat`
- Agent responses are plain text (possibly with markdown formatting) -- the agent-service.ts `collectResponse` function extracts the result text from the SDK stream
- For confirmation flow in Phase 16, the agent will need to return structured data indicating a pending confirmation. The UI should be designed now to accommodate this by parsing a known pattern from the response (e.g., a fenced JSON block with `type: "confirmation"`)
- New npm dependencies needed: `react-markdown`, `remark-gfm`, `@tailwindcss/typography`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Layout.tsx`: Contains the nav bar with all existing NavLinks -- add Chat link here following the same pattern
- `trpc.ts`: Exports `useTRPC` hook -- used to access `agent.chat` mutation
- `lib/format.ts`: Exports `formatCurrency` -- not directly needed but shows established utility pattern

### Established Patterns
- Pages live in `packages/client/src/pages/` as `{Name}Page.tsx` -- ChatPage follows this convention
- Routes defined in `app.tsx` inside `<Route element={<Layout />}>` -- chat route added here
- tRPC queries use `useQuery(trpc.{router}.{procedure}.queryOptions())` pattern
- tRPC mutations use `useMutation(trpc.{router}.{procedure}.mutationOptions())` pattern (used in SyncButton, RuleForm, etc.)
- All styling uses Tailwind utility classes -- no CSS modules or styled-components
- Components are functional React components with hooks -- no class components

### Integration Points
- `packages/client/src/app.tsx`: Add `<Route path="chat" element={<ChatPage />} />` inside the Layout route
- `packages/client/src/components/Layout.tsx`: Add Chat NavLink to the nav bar
- `packages/server/src/agent/agent-router.ts`: Already exposes `agent.chat` mutation -- no server changes needed
- `packages/client/package.json`: Add `react-markdown`, `remark-gfm`, `@tailwindcss/typography` dependencies

</code_context>

<deferred>
## Deferred Ideas

- **Streaming responses (v2.x STREAM-01, STREAM-02):** Token-by-token rendering via WebSocket; collect-and-return is the v2.0 approach
- **Persistent chat history (v2.x HIST-01, HIST-02):** No database storage for conversations; session state lives in memory only
- **Action tools (Phase 16):** Write operations and the server-side confirmation flow logic are Phase 16 scope; this phase only builds the UI shell for confirmation buttons
- **Voice input/output:** Out of scope per REQUIREMENTS.md
- **Agent-initiated proactive alerts:** Out of scope per REQUIREMENTS.md

</deferred>

---

*Phase: 15-chat-ui*
*Context gathered: 2026-03-23 via auto-context*
