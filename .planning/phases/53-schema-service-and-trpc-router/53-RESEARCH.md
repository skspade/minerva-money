# Phase 53: Schema, Service, and tRPC Router - Research

**Researched:** 2026-03-28
**Status:** Complete

## Codebase Patterns

### Migration Pattern
- Sequential numbering: `001-initial-schema.sql` through `008-account-relink.sql`
- Next migration: `009-chat-history.sql`
- Pure SQL DDL files, auto-applied by `migrate.ts` via `user_version` pragma
- `createDatabase()` in `packages/server/src/db/connection.ts` runs all migrations automatically
- Foreign keys enabled via `PRAGMA foreign_keys = ON` — CASCADE deletes work correctly

### Service Pattern
- Module per feature: `categories/category-service.ts`, `rules/rule-service.ts`, etc.
- All functions accept `db: Database.Database` as first argument
- Pure functions, no class wrappers
- Test files co-located: `category-service.test.ts` in same directory
- Tests use `createDatabase(join(tmpDir, 'test.db'))` for real SQLite instances (not mocks)
- Tests use `beforeEach`/`afterEach` with temp directories for isolation
- UUID generation via `crypto.randomUUID()` (Node.js built-in)
- `db.prepare().all()` for queries, `db.prepare().run()` for mutations

### tRPC Router Pattern
- Routers defined with `router({})` from `../sync/trpc.js`
- Input validation via Zod schemas
- Context provides `db`, `rateLimiter`, `client` via `Context` interface
- `appRouter` in `trpc-router.ts` composes all routers at line 527
- Currently 11 top-level routers: sync, backup, accounts, transactions, categories, rules, transfers, budget, reports, agent, import
- Error handling via `TRPCError` with codes like `BAD_REQUEST`, `NOT_FOUND`
- Procedures use `publicProcedure` (no auth layer)

### Integration Points
- `appRouter` at `packages/server/src/sync/trpc-router.ts:527` — add `chatHistory` key
- `agent-router.ts` — stays untouched; existing `agent.chat` and `agent.models` paths preserved
- CONTEXT.md decision: flat `chatHistory` router (not nested `chat.history`) to avoid restructuring

## Key Decisions from CONTEXT.md

1. **Router namespace**: `chatHistory.list`, `chatHistory.get`, etc. (flat top-level, not nested)
2. **UUID for conversation IDs**: via `crypto.randomUUID()`
3. **Title generation**: Pure function, first user message truncated at ~60 chars on word boundary
4. **No pagination**: Max ~100 conversations with 90-day retention
5. **tool_calls**: Stored as TEXT JSON blob, parsed on read
6. **sdk_session_id**: Left NULL at creation (Phase 54 sets it)

## Files to Create
1. `packages/server/migrations/009-chat-history.sql` — DDL for tables + index
2. `packages/server/src/chat-history/chat-history-service.ts` — All 8 service functions
3. `packages/server/src/chat-history/chat-history-service.test.ts` — Service tests
4. `packages/server/src/chat-history/chat-history-router.ts` — tRPC router with 4 procedures

## Files to Modify
1. `packages/server/src/sync/trpc-router.ts` — Import and register `chatHistoryRouter` in `appRouter`

## Risk Assessment
- **Low risk**: This is a greenfield data layer with no existing code to modify (except appRouter registration)
- **No breaking changes**: Existing routers untouched
- **Testing strategy**: Real SQLite database in temp directory (matches established pattern)

## RESEARCH COMPLETE
