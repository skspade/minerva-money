# Stack Research

**Domain:** Persistent chat history for existing budgeting app with Claude Agent SDK
**Researched:** 2026-03-28
**Confidence:** HIGH

## Key Finding: Zero New Dependencies Required

Every capability needed for chat history persistence is already available in the existing stack. No new npm packages are needed.

## Existing Stack (Verified in Codebase)

| Technology | Version | Relevance to Chat History |
|------------|---------|--------------------------|
| react-router | ^7.13.1 | Already installed. Supports `/chat/:conversationId` via `useParams` and `useNavigate` -- neither used yet but available |
| better-sqlite3 | ^11.7.0 | TEXT columns store JSON strings natively. No special JSON column type needed -- SQLite treats all JSON as TEXT |
| Node.js | 22.19.0 | `crypto.randomUUID()` stable since Node 19. Already used in `accounts-service.ts` and `category-service.ts` |
| croner | ^10.0.1 | Already used for sync (6AM/6PM) and budget funding (15th/last). Add one more schedule for retention cleanup |
| @anthropic-ai/claude-agent-sdk | ^0.2.81 | Supports `messages` array parameter for context injection on session creation |
| Zod | ^4.3.6 | Already validates SSE request body. Extend schema with optional `conversationId` |
| @minerva/shared | workspace | SSE event types defined here. Add `SSEConversationEvent` to discriminated union |

## What to Use (All Built-In)

### UUID Generation: `crypto.randomUUID()`

**Confidence:** HIGH -- already used in two server modules.

```typescript
import { randomUUID } from 'node:crypto';
const conversationId = randomUUID();
```

Pattern already established in `accounts-service.ts` (line 62) and `import-service.ts` (line 392). Use the same `import { randomUUID } from 'node:crypto'` pattern for consistency.

### JSON Storage in SQLite: TEXT Columns

**Confidence:** HIGH -- standard SQLite pattern.

The `tool_calls` column stores a JSON array as a plain TEXT column. SQLite has no native JSON column type -- TEXT is the correct choice. The app already uses `JSON.stringify()` / `JSON.parse()` throughout (tool helpers, SSE handler, SimpleFIN client).

No need for SQLite JSON functions (`json_extract`, `json_each`) -- the JSON is opaque storage, only parsed server-side in TypeScript. This avoids coupling to SQLite's JSON1 extension.

```sql
tool_calls TEXT  -- JSON array, nullable, parsed in TypeScript only
```

### URL Routing: react-router v7 `useParams` + `useNavigate`

**Confidence:** HIGH -- react-router v7 already installed and used for all page routing.

Current routing in `app.tsx` uses `BrowserRouter` + `Routes` + `Route` from `react-router` (v7). Adding a parameterized route is a one-line change:

```tsx
<Route path="chat" element={<ChatPage />} />
<Route path="chat/:conversationId" element={<ChatPage />} />
```

ChatPage uses `useParams()` to read `conversationId` and `useNavigate()` to update URL on new conversation creation. Both hooks are standard react-router v7 exports. No other page in the app uses `useParams` yet, but this is the standard pattern.

**Important:** Both routes render the same `ChatPage` component. The bare `/chat` route shows a new conversation; `/chat/:conversationId` loads an existing one.

### Date/Time Handling: ISO 8601 Strings

**Confidence:** HIGH -- established codebase pattern.

All existing timestamps in the database use ISO 8601 TEXT format (e.g., `datetime('now')` in SQL, `new Date().toISOString()` in TypeScript). Continue this pattern for `created_at` and `updated_at` columns.

For the sidebar's relative time display ("2h ago", "Yesterday"), write a simple utility function. Do NOT add a library like `date-fns` or `dayjs` for this -- the logic is ~20 lines:

```typescript
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
```

### SSE Event Extension: New `conversation` Event Type

**Confidence:** HIGH -- direct extension of existing shared types.

Add to `packages/shared/src/sse-events.ts`:

```typescript
export interface SSEConversationEvent {
  readonly type: 'conversation';
  readonly conversationId: string;
}

export type SSEEvent =
  | SSESessionEvent
  | SSEConversationEvent  // new
  | SSETextDeltaEvent
  | SSEToolStartEvent
  | SSEToolEndEvent
  | SSEDoneEvent
  | SSEErrorEvent;
```

This follows the established discriminated union pattern. The client's existing `switch (event.type)` handler just needs a new `case 'conversation':` branch.

### Migration File: `009-chat-history.sql`

**Note:** The design document references `008_chat_history.sql` but migration 008 already exists (`008-account-relink.sql`). The actual file must be `009-chat-history.sql`.

### Scheduled Cleanup: Existing croner Infrastructure

**Confidence:** HIGH -- croner already manages two job types.

Add a third croner schedule in `packages/server/src/index.ts` alongside existing sync and budget funding jobs. Schedule: daily at 3 AM. The `CHAT_RETENTION_DAYS` environment variable (default 90) controls the threshold. No new dependency -- croner ^10.0.1 supports unlimited concurrent schedules.

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `crypto.randomUUID()` | `uuid` npm package | Built-in is sufficient, already used in codebase, zero dependencies |
| `crypto.randomUUID()` | `nanoid` | UUIDs are the established pattern in this codebase (accounts, imports). Nanoid's shorter IDs add no value for conversation IDs |
| Plain TEXT for JSON | SQLite JSON1 functions | Over-engineering. JSON is opaque storage -- only TypeScript reads it. No need for SQL-level JSON queries |
| react-router `useParams` | Query params (`?id=...`) | URL params are cleaner for resource identification, standard REST-like pattern, better for browser history |
| Custom `relativeTime()` | `date-fns` / `dayjs` | One function needed, ~20 lines. Adding a date library for this is overkill |
| ISO 8601 TEXT timestamps | Unix epoch integers | ISO 8601 is the established pattern in all existing tables. Consistency matters more than minor performance |
| Two `<Route>` elements | Single `<Route path="chat/:conversationId?">` | Optional params work in react-router v7, but two explicit routes are clearer and match the codebase's flat style |

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `uuid` npm package | Node 22 has `crypto.randomUUID()` built-in, already used in codebase | `import { randomUUID } from 'node:crypto'` |
| `date-fns` or `dayjs` | Only need relative time formatting for sidebar -- not worth a dependency | Custom 20-line utility |
| `nanoid` | UUIDs are the established ID format in this codebase | `crypto.randomUUID()` |
| `@tanstack/react-router` | Already using react-router v7, which handles the needed routing fine | Existing react-router |
| SQLite JSON1 extension queries | Tool calls JSON is opaque storage, never queried at SQL level | `JSON.parse()` in TypeScript |
| Any WebSocket library | SSE is the established streaming pattern, unidirectional is sufficient | Existing Express SSE + fetch ReadableStream |
| Any component library for sidebar | Project convention: all custom Tailwind components, no component library | Tailwind + custom JSX |

## Installation

```bash
# Nothing to install. Zero new dependencies for this milestone.
```

## Version Compatibility

| Existing Package | Chat History Feature | Compatible |
|-----------------|---------------------|------------|
| react-router ^7.13.1 | `useParams`, `useNavigate` for `/chat/:conversationId` | Yes -- standard v7 hooks |
| better-sqlite3 ^11.7.0 | TEXT columns with JSON, CASCADE foreign keys, composite indexes | Yes -- standard SQLite features |
| @anthropic-ai/claude-agent-sdk ^0.2.81 | `messages` array for context rebuild on session creation | Yes -- core SDK feature |
| Zod ^4.3.6 | Optional `conversationId` field in request schema | Yes -- `.optional()` is standard |
| croner ^10.0.1 | Additional scheduled job for retention cleanup | Yes -- supports multiple schedules |
| @minerva/shared (workspace) | New `SSEConversationEvent` type in union | Yes -- just a type addition |

## Integration Points Summary

| Change | File(s) | Nature |
|--------|---------|--------|
| New SSE event type | `packages/shared/src/sse-events.ts` | Add `SSEConversationEvent` to union |
| Route parameter | `packages/client/src/app.tsx` | Add `chat/:conversationId` route |
| URL hooks | `packages/client/src/pages/ChatPage.tsx` | Import `useParams`, `useNavigate` from react-router |
| New migration | `packages/server/migrations/009-chat-history.sql` | Two tables, one index, CASCADE FK |
| New service module | `packages/server/src/chat/chat-history-service.ts` | CRUD + purge functions using `randomUUID` |
| New tRPC router | `packages/server/src/chat/chat-history-router.ts` | Nested under main router as `chat.history` |
| SSE handler extension | `packages/server/src/agent/chat-stream-handler.ts` | Accept/emit `conversationId`, persist messages |
| New cron job | `packages/server/src/index.ts` | Daily 3 AM retention cleanup via croner |
| Relative time utility | `packages/client/src/utils/relative-time.ts` | Pure function, ~20 lines |

## Sources

- Codebase: `packages/server/src/accounts/accounts-service.ts` line 1, 62 -- confirmed `randomUUID` import and usage pattern -- HIGH
- Codebase: `packages/server/src/import/import-service.ts` line 2, 392 -- confirmed second `randomUUID` usage -- HIGH
- Codebase: `packages/client/src/app.tsx` -- confirmed react-router v7 with BrowserRouter, Routes, Route pattern -- HIGH
- Codebase: `packages/client/package.json` line 27 -- confirmed react-router ^7.13.1 -- HIGH
- Codebase: `packages/shared/src/sse-events.ts` -- confirmed discriminated union on `type` field, 6 existing event types -- HIGH
- Codebase: `packages/server/migrations/` -- confirmed 8 migration files exist (001 through 008), next is 009 -- HIGH
- Codebase: JSON usage throughout server (tool-helpers.ts, chat-stream-handler.ts, simplefin-client.ts) -- confirmed `JSON.stringify`/`JSON.parse` pattern, no JSON1 SQL usage -- HIGH
- Runtime: `node --version` = v22.19.0 -- `crypto.randomUUID()` stable since Node 19 -- HIGH

---
*Stack research for: Minerva Money v2.9 Chat History Persistence*
*Researched: 2026-03-28*
