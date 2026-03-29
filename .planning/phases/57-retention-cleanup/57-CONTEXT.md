# Phase 57: Retention Cleanup - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Old conversations are automatically purged to prevent unbounded database and disk growth. This phase adds a croner scheduled job that runs daily at 3 AM, deletes conversations older than a configurable retention threshold (CHAT_RETENTION_DAYS env var, default 90), and removes the associated SDK session JSONL files from disk alongside the SQLite rows. This is a small infrastructure phase -- a scheduled background job following established patterns.

</domain>

<decisions>
## Implementation Decisions

### Scheduler Module
- New file `packages/server/src/chat-history/chat-cleanup-scheduler.ts` following the established scheduler pattern (Claude's Decision: co-locate with chat-history-service since it calls purge functions from that module, consistent with sync-scheduler living in sync/ and budget-scheduler living in budget/)
- Export `startChatCleanupScheduler(db)` and `stopChatCleanupScheduler()` functions matching the sync-scheduler and budget-scheduler API shape
- Module-level `let job: Cron | null = null` for the single croner instance

### Cron Schedule (CLEAN-01)
- Croner expression `0 0 3 * * *` for daily at 3:00 AM (from ROADMAP.md success criteria)
- Console log on startup: `[chat-cleanup] Started: purging old conversations daily at 3:00 AM`

### Retention Configuration
- Read `CHAT_RETENTION_DAYS` from `process.env` at job execution time, not at registration time (Claude's Decision: allows changing the env var without restarting the server, consistent with how other env-driven config works)
- Parse with `parseInt()`, default to 90 if missing or invalid (from ROADMAP.md success criteria "default 90")
- Log the retention days value on each cleanup run for observability

### Purge Function Enhancement
- The existing `purgeOldConversations(db, retentionDays)` only deletes SQLite rows -- it must be enhanced to also return the `sdk_session_id` values of deleted conversations so the caller can clean up disk files (Claude's Decision: query session IDs before DELETE rather than after, since CASCADE delete removes the data)
- New function `getExpiredConversationSessionIds(db, retentionDays): string[]` that queries `sdk_session_id` from conversations matching the retention threshold BEFORE they are deleted (Claude's Decision: separate query function keeps purgeOldConversations focused on DB cleanup; the scheduler orchestrates both steps)
- Alternatively, replace `purgeOldConversations` with a two-step approach: query expired IDs first, delete second, return both count and session IDs (Claude's Decision: single function `purgeOldConversations` returns `{ deletedCount: number; sessionIds: string[] }` -- simpler API for the scheduler to consume)

### SDK Session File Cleanup (CLEAN-02)
- SDK session files are stored at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` per PITFALLS.md Pitfall 2
- The encoded cwd replaces non-alphanumeric characters with `-` (from PITFALLS.md)
- Use `fs.unlink()` (or `fs.promises.unlink()`) to delete each session file, wrapped in try-catch to swallow ENOENT errors (file may already be missing) (from PITFALLS.md Pitfall 2 recommendation)
- Log a warning for non-ENOENT errors but do not fail the cleanup job (Claude's Decision: cleanup should be best-effort for files -- the critical part is the DB deletion)
- The session file path construction needs the server's `process.cwd()` encoded the same way the SDK encodes it (Claude's Decision: discover the exact encoding by checking the SDK source or listing `~/.claude/projects/` at runtime to find the matching directory)

### App Startup Registration
- Import and call `startChatCleanupScheduler(db)` in `packages/server/src/index.ts` alongside `startSyncScheduler` and `startBudgetScheduler`
- Add `stopChatCleanupScheduler()` to the SIGTERM handler alongside the other stop functions

### Claude's Discretion
- Whether to use sync `fs.unlinkSync` or async `fs.promises.unlink` for file deletion
- Exact log message format for cleanup results
- Whether to extract the SDK session path encoding into a shared utility or inline it
- Test file structure and individual test case naming

</decisions>

<specifics>
## Specific Ideas

- PITFALLS.md Pitfall 2 explicitly warns: "SDK session files not cleaned up -- Never acceptable -- must clean up from the start"
- PITFALLS.md Pitfall 11 notes the theoretical race condition of deleting a conversation mid-stream at 3 AM boundary; accepted as negligible risk for single-user system with 90-day window
- The `purgeOldConversations` function currently uses string interpolation for the retention days in SQL (`-${retentionDays} days`); this is safe since retentionDays is parsed as an integer, not user input
- RESEARCH SUMMARY.md explicitly names the file as `chat-cleanup-scheduler.ts` and describes: "croner job deleting old conversation SQLite rows AND their SDK session JSONL files from disk"
- The SDK session path `~/.claude/projects/<encoded-cwd>/` encoding needs runtime discovery -- list the directory and match against `process.cwd()` encoded form, or check the `@anthropic-ai/claude-agent-sdk` source for the encoding function

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/chat-history/chat-history-service.ts`: `purgeOldConversations(db, retentionDays)` already handles SQLite deletion with CASCADE -- needs enhancement to also return session IDs
- `packages/server/src/sync/sync-scheduler.ts`: Pattern template for croner job registration (import Cron, module-level job variable, start/stop exports, try-catch in callback, console logging)
- `packages/server/src/budget/budget-scheduler.ts`: Second pattern example confirming the same structure

### Established Patterns
- Schedulers export `start*Scheduler(db)` and `stop*Scheduler()` pairs
- Schedulers are registered in `packages/server/src/index.ts` inside the `process.env.NODE_ENV !== 'test'` block
- Stop functions are called in the SIGTERM handler
- Croner callbacks wrap execution in try-catch with console.error on failure
- Log messages use `[module-name]` prefix format

### Integration Points
- `packages/server/src/index.ts` lines 48-49: Where `startSyncScheduler(db)` and `startBudgetScheduler(db)` are called -- new scheduler added here
- `packages/server/src/index.ts` lines 56-57: SIGTERM handler where `stopSyncScheduler()` and `stopBudgetScheduler()` are called -- new stop function added here
- `packages/server/src/chat-history/chat-history-service.ts` line 150: `purgeOldConversations` function -- needs modification to return session IDs before deletion
- SDK session files at `~/.claude/projects/<encoded-cwd>/` -- target for file cleanup

</code_context>

<deferred>
## Deferred Ideas

- Orphan detection for SDK session files with no matching conversation (recovery script, not automated) -- future maintenance task
- Conversation search across history (SEARCH-01) -- deferred per REQUIREMENTS.md
- Configurable cleanup time (currently hardcoded to 3 AM) -- not needed for single-user system

</deferred>

---

*Phase: 57-retention-cleanup*
*Context gathered: 2026-03-28 via auto-context*
