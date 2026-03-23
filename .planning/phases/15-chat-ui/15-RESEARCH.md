# Phase 15: Chat UI - Research

**Researched:** 2026-03-23
**Domain:** React chat interface with markdown rendering
**Confidence:** HIGH

## Summary

Phase 15 adds a chat page at `/chat` where users interact with the existing agent backend (Phase 14). The core technical challenges are: (1) integrating `react-markdown` with `remark-gfm` for rendering financial data tables and formatted responses, (2) setting up `@tailwindcss/typography` with Tailwind CSS v4's `@plugin` directive for prose styling, and (3) building a responsive full-height chat layout with loading states, error display, and confirmation button parsing.

The project uses Tailwind CSS v4 (via `@tailwindcss/vite` plugin, CSS-based config with `@import "tailwindcss"`), React 19, react-router v7, and tRPC with TanStack Query v5. The agent backend already returns `{ response: string, sessionId: string }` from the `agent.chat` mutation, so no server changes are needed.

**Primary recommendation:** Build a single ChatPage component with `react-markdown`/`remark-gfm` for response rendering, `@tailwindcss/typography` prose classes for styling, and local React state for the message list and session management.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Add `/chat` route to `app.tsx` with a new `ChatPage` component in `packages/client/src/pages/ChatPage.tsx`
- Add "Chat" NavLink to Layout.tsx navigation bar following the existing NavLink pattern with `isActive` styling
- Full-height chat layout filling available viewport height below the nav bar
- Two-region layout: scrollable message list on top, fixed input bar pinned to bottom
- Remove the `max-w-6xl` constraint on the chat page main content area
- Messages with visual distinction: user messages right-aligned with colored background, agent messages left-aligned with neutral background
- Auto-scroll to latest message
- Empty state with welcome message and example questions
- Use `react-markdown` with `remark-gfm` plugin for agent response rendering
- Render tables, bold, italic, lists, and code blocks with Tailwind prose styling
- Apply `@tailwindcss/typography` prose classes to the markdown container
- Show pulsing dot or typing indicator while agent is processing
- Disable send button and input while request is in flight
- Use tRPC `useMutation` for `agent.chat` with local React state for message list
- Error messages display as styled error message bubble in chat thread (red/orange border)
- Network errors also render as in-thread error messages
- Confirmation requests render inline "Confirm" and "Cancel" buttons
- Use structured marker in agent response to identify confirmation requests (JSON block with action details)
- Clicking Confirm/Cancel sends follow-up message in same session
- Store sessionId in React state; new page visit starts new session
- No persistent chat history across page reloads

### Claude's Discretion
- Exact Tailwind classes for message bubbles, spacing, and colors
- Exact wording of the empty-state welcome message and example questions
- Input field placeholder text
- Whether to use a textarea or single-line input
- Animation details for the loading indicator
- Keyboard shortcut details (Enter to send, Shift+Enter for newline)

### Deferred Ideas (OUT OF SCOPE)
- Streaming responses (v2.x STREAM-01, STREAM-02)
- Persistent chat history (v2.x HIST-01, HIST-02)
- Action tools (Phase 16 scope)
- Voice input/output
- Agent-initiated proactive alerts
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-01 | Chat page at /chat with full-height layout, message list, and input bar | Route + Layout pattern verified from existing app.tsx/Layout.tsx; flex layout with overflow-y-auto for messages |
| UI-02 | Agent responses render markdown (tables, bold, lists) | react-markdown + remark-gfm verified via Context7; @tailwindcss/typography prose classes for styling |
| UI-03 | Loading indicator while agent is processing | useMutation isPending state; pulsing dot CSS animation |
| UI-04 | Inline confirmation buttons for actions requiring approval | Parse structured JSON block from agent response; render Confirm/Cancel buttons |
| UI-05 | Chat navigation link in the app sidebar | NavLink pattern from Layout.tsx; identical isActive styling |
| UI-06 | Error messages displayed in chat when agent encounters errors | useMutation onError + error response handling; styled error bubble |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-markdown | latest | Render agent markdown responses as React elements | De facto standard for React markdown rendering; supports plugins, custom components |
| remark-gfm | latest | GFM extension for tables, strikethrough, task lists | Required for rendering financial data tables from agent responses |
| @tailwindcss/typography | latest | Prose styling for rendered markdown | Official Tailwind plugin; provides sensible defaults for rendered HTML content |

### Already in Project
| Library | Version | Purpose |
|---------|---------|---------|
| react | ^19.2.4 | UI framework |
| react-router | ^7.13.1 | Client-side routing (NavLink, Route) |
| @tanstack/react-query | ^5.95.0 | Async state management (useMutation) |
| @trpc/tanstack-react-query | ^11.14.1 | tRPC React bindings |
| tailwindcss | ^4.2.2 | Utility-first CSS (v4 with @tailwindcss/vite) |

### Installation
```bash
cd packages/client && npm install react-markdown remark-gfm @tailwindcss/typography
```

## Architecture Patterns

### Tailwind CSS v4 Typography Setup
The project uses Tailwind v4 with CSS-based configuration (no `tailwind.config.js`). Typography plugin is registered via `@plugin` directive in the CSS file:

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

Then use `prose` classes on the markdown container:
```html
<div class="prose prose-sm">
  <!-- rendered markdown -->
</div>
```

### react-markdown with remark-gfm
```tsx
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

<Markdown remarkPlugins={[remarkGfm]}>{agentResponse}</Markdown>
```

### tRPC Mutation Pattern (from SyncButton.tsx)
```tsx
const trpc = useTRPC();
const chatMutation = useMutation(
  trpc.agent.chat.mutationOptions({
    onSuccess: (data) => { /* add response to messages */ },
    onError: (error) => { /* add error to messages */ },
  }),
);
// chatMutation.mutate({ message, sessionId })
// chatMutation.isPending for loading state
```

### Chat Layout Pattern
Full-height flex column below the nav bar:
```
<div className="flex flex-col h-[calc(100vh-56px)]">
  <div className="flex-1 overflow-y-auto">  <!-- message list -->
  <div className="border-t p-4">            <!-- input bar -->
</div>
```

### Confirmation Parsing
Agent responses containing a fenced JSON block with `type: "confirmation"` are parsed to render inline buttons:
```json
{"type":"confirmation","action":"adjust_budget","description":"Set Groceries budget to $500","params":{...}}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Markdown rendering | Custom parser | react-markdown + remark-gfm | Handles edge cases in tables, nested lists, XSS sanitization |
| Prose typography | Manual CSS for rendered HTML | @tailwindcss/typography | Handles all HTML elements consistently, responsive sizing |

## Common Pitfalls

### Pitfall 1: Scroll-to-bottom not working on new messages
**What goes wrong:** New messages appear below the fold; user has to scroll manually.
**Why it happens:** `scrollIntoView` called before DOM update completes.
**How to avoid:** Use `useEffect` with messages array as dependency; use `ref` on a sentinel div at the bottom of the message list.

### Pitfall 2: Double-send on fast click
**What goes wrong:** User clicks send twice, creating duplicate messages.
**Why it happens:** Button not disabled fast enough before mutation starts.
**How to avoid:** Disable button when `isPending` is true; clear input on send, not on success.

### Pitfall 3: Tailwind v4 typography plugin not loading
**What goes wrong:** `prose` classes have no effect.
**Why it happens:** Missing `@plugin` directive in CSS file (v4 uses CSS config, not JS config).
**How to avoid:** Add `@plugin "@tailwindcss/typography";` to `app.css` after `@import "tailwindcss"`.

### Pitfall 4: react-markdown rendering raw HTML
**What goes wrong:** HTML in agent responses renders as plain text.
**Why it happens:** react-markdown sanitizes HTML by default (which is correct for security).
**How to avoid:** This is desired behavior. Do NOT enable `rehype-raw` — agent responses should only use markdown syntax.

## Code Examples

### Message List with Auto-Scroll
```tsx
const messagesEndRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages]);

return (
  <div className="flex-1 overflow-y-auto p-4 space-y-4">
    {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
    <div ref={messagesEndRef} />
  </div>
);
```

### Typing Indicator
```tsx
{isPending && (
  <div className="flex gap-1 px-4 py-2">
    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
  </div>
)}
```

## Sources

### Primary (HIGH confidence)
- Context7 /tailwindlabs/tailwindcss-typography — v4 @plugin directive, prose classes
- Context7 /remarkjs/react-markdown — remark-gfm usage, custom components, TypeScript

### Secondary (MEDIUM confidence)
- Existing codebase patterns — Layout.tsx NavLink, SyncButton.tsx mutation, app.tsx routing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified via Context7 docs
- Architecture: HIGH — follows existing project patterns exactly
- Pitfalls: HIGH — well-known React chat UI patterns

**Research date:** 2026-03-23
**Valid until:** 2026-04-23
