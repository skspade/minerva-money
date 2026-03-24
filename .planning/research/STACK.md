# Technology Stack

**Project:** Minerva Money v2.5 - Chat Enhancements (Model Selector + Category Creation Tools)
**Researched:** 2026-03-24
**Confidence:** HIGH

## Core Finding: No New Dependencies Required

This milestone can be built entirely with the existing stack. No new npm packages, no new infrastructure, no new build tooling. Every feature maps cleanly to existing libraries and patterns already in the codebase.

---

## Existing Stack (Unchanged)

### Server-Side

| Technology | Version | Role in v2.5 | Change Needed |
|------------|---------|--------------|---------------|
| @anthropic-ai/claude-agent-sdk | ^0.2.81 | Agent runtime - `query()` already accepts `model` option, `tool()` for new tools | Pass model param instead of hardcoding |
| @trpc/server | ^11.14.1 | New `models` query endpoint, updated `chat` mutation input schema | Add procedure + schema field |
| zod | ^4.3.6 | Validate model enum, category name strings | Schema additions only |
| better-sqlite3 | ^11.7.0 | Duplicate name validation queries for categories/groups | New SELECT queries |
| express | ^4.21.0 | HTTP server | No change |

### Client-Side

| Technology | Version | Role in v2.5 | Change Needed |
|------------|---------|--------------|---------------|
| react | ^19.2.4 | Model selector dropdown via `useState` + native `<select>` | New UI element |
| @tanstack/react-query | ^5.95.0 | `useQuery` for model list, existing `useMutation` for chat | Add one query |
| @trpc/client + @trpc/tanstack-react-query | ^11.14.1 | Consume new `models` endpoint | Type-safe auto |
| tailwindcss | ^4.2.2 | Style the `<select>` element | CSS classes only |
| lucide-react | ^1.0.1 | Potentially a model icon | Optional, already installed |

---

## What Changes (Code, Not Dependencies)

### 1. Model Selector - Server

**Current state:** Model is hardcoded in `agent-service.ts` line 23:
```typescript
model: 'claude-sonnet-4-20250514',
```

**Required changes:**

- **New tRPC query** (`agent.models`): Returns the centralized model list. Keeps model IDs server-side where the API key lives. Allows changing offered models without client redeployment.

- **Update `agent-service.ts`**: Accept `model` parameter in `chat()`. Pass to `query()` options. The SDK's `query()` already accepts `model` as an option -- it is just hardcoded today.

- **Update `agent-router.ts`**: Add `model` (optional string with Zod enum validation) to `chat` mutation input. Add `models` query procedure.

**Model identifiers** (verified against Anthropic docs, 2026-03-24):

| Display Name | API Model ID | Pricing (in/out per MTok) | Context | Use Case |
|--------------|-------------|--------------------------|---------|----------|
| Haiku | `claude-haiku-4-5-20251001` | $1 / $5 | 200k | Quick queries: balances, simple lookups |
| Sonnet (default) | `claude-sonnet-4-6` | $3 / $15 | 1M | General use: analysis, rule creation, categorization |
| Opus | `claude-opus-4-6` | $5 / $25 | 1M | Complex reasoning: spending pattern analysis |

**Important:** The currently hardcoded `claude-sonnet-4-20250514` is legacy (Claude Sonnet 4.0). Updating the default to `claude-sonnet-4-6` is a free quality upgrade.

**Use explicit snapshot IDs, not aliases.** `claude-haiku-4-5-20251001` rather than `claude-haiku-4-5`. Aliases may shift to newer snapshots unexpectedly; explicit IDs ensure consistent behavior. Exception: Sonnet 4.6 and Opus 4.6 do not yet have snapshot-suffixed IDs -- their current IDs are the canonical form.

### 2. Model Selector - Client

**Current state:** `ChatPage.tsx` calls `chatMutation.mutate({ message, sessionId })`.

**Required changes:**

- `useState` for selected model (default from server response or `'claude-sonnet-4-6'`)
- `useQuery` on `agent.models` to fetch available models + display names
- Native `<select>` above the chat input bar
- Pass model in mutation: `chatMutation.mutate({ message, sessionId, model })`

**Why native `<select>`:** The project uses custom Tailwind components with no component library. A native `<select>` is accessible, triggers the native OS picker on mobile (iOS/Android), and needs zero additional code. Three options do not warrant a custom dropdown.

### 3. Category Creation Tools - Server

**Current state:** `category-service.ts` already exports `createGroup()` and `createCategory()`. The agent's `action-tools.ts` does not wrap them.

**Required changes:**

- **Two new tools** in `action-tools.ts`:
  - `create_category`: Takes `groupId` and `name`. Validates group exists, checks duplicate name (case-insensitive) within group, calls `createCategory()`.
  - `create_category_group`: Takes `name`. Checks duplicate group name (case-insensitive), calls `createGroup()`.

- **Duplicate validation**: Simple SQLite queries. Example:
  ```sql
  SELECT id FROM categories WHERE group_id = ? AND LOWER(name) = LOWER(?)
  ```
  No new libraries -- `better-sqlite3` handles this directly.

- **System prompt updates** in `system-prompt.ts`: Behavioral guidance for new tools:
  - Always check existing categories first (use `list_categories` tool before creating)
  - Add-only: never delete or rename categories via agent
  - Suggest existing category when name is similar to an existing one

- **Confirmation flow**: Category/group creation should use the existing JSON confirmation block pattern already defined for budget changes. The `ChatPage.tsx` confirmation UI handles this generically.

### 4. No Database Changes

Both `categories` and `category_groups` tables already exist with all needed columns (`id`, `name`, `sort_order`, `group_id`). No migrations required.

---

## Libraries Explicitly NOT Needed

| Temptation | Why Unnecessary |
|------------|----------------|
| Custom dropdown library (Radix, Headless UI) | Native `<select>` handles 3 options perfectly; accessible OOTB, mobile-native |
| @anthropic-ai/sdk (raw API client) | Agent SDK already wraps the API; adding raw SDK is redundant |
| State management (zustand, jotai) | `useState` is sufficient for a single dropdown value |
| WebSocket library for model switching | Model selection happens before the request; collect-and-return is unchanged |
| String similarity library (fuse.js) | Duplicate check is exact name match (case-insensitive); fuzzy matching is overengineering |

---

## Integration Points

| Feature | Server File(s) | Client File(s) | Existing Service |
|---------|----------------|-----------------|-----------------|
| Model list endpoint | `agent-router.ts` | `ChatPage.tsx` | None (static config array) |
| Model passthrough | `agent-router.ts`, `agent-service.ts` | `ChatPage.tsx` | SDK `query()` options |
| Create category tool | `action-tools.ts`, `mcp-server.ts` | None (agent-driven) | `category-service.createCategory()` |
| Create group tool | `action-tools.ts`, `mcp-server.ts` | None (agent-driven) | `category-service.createGroup()` |
| System prompt | `system-prompt.ts` | None | None |
| Confirmation flow | `system-prompt.ts` | `ChatPage.tsx` (existing) | Existing JSON block pattern |

---

## Alternatives Considered

| Decision | Chosen | Alternative | Why Not Alternative |
|----------|--------|-------------|---------------------|
| Model list source | Server endpoint | Hardcoded client array | Server controls availability; no client redeploy to change models |
| Model selector UI | Native `<select>` | Custom dropdown (Headless UI) | Zero deps, mobile-native, 3 options is trivial |
| Category dupe check | Case-insensitive SQL query | Application-level string comparison | DB is authoritative source; avoids race conditions |
| Tool file organization | Add to `action-tools.ts` | New `category-tools.ts` | Follows existing pattern; extract later if file grows |
| Model ID format | Explicit IDs where available | Alias IDs only | Aliases may shift; explicit IDs ensure consistent behavior |
| Default model | `claude-sonnet-4-6` (latest Sonnet) | Keep `claude-sonnet-4-20250514` (legacy) | Free quality upgrade; legacy model will eventually deprecate |

---

## Installation

```bash
# Nothing to install. Zero new dependencies.
# Verify current state:
cd /Users/seanspade/Documents/Source/minerva-money && npm ls @anthropic-ai/claude-agent-sdk @trpc/server zod
```

---

## Sources

- **Anthropic Models Overview** (verified 2026-03-24): https://platform.claude.com/docs/en/about-claude/models/overview -- HIGH confidence
- **Existing codebase** `agent-service.ts`: Model hardcoding at line 23, `query()` options pattern -- HIGH confidence
- **Existing codebase** `category-service.ts`: `createGroup()` and `createCategory()` already exported -- HIGH confidence
- **Existing codebase** `action-tools.ts`: Tool definition pattern with `tool()`, validation helpers, error handling -- HIGH confidence
- **Existing codebase** `ChatPage.tsx`: Current chat UI, mutation pattern, confirmation flow -- HIGH confidence

---
*Stack research for: Minerva Money v2.5 Chat Enhancements*
*Researched: 2026-03-24*
