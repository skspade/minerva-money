# Phase 57: Retention Cleanup - Research

**Researched:** 2026-03-28
**Status:** Complete

## Summary

Phase 57 adds automated purging of old chat conversations to prevent unbounded database and disk growth. This is a small infrastructure phase following established scheduler patterns.

## Existing Patterns

### Scheduler Pattern (sync-scheduler.ts, budget-scheduler.ts)
- Import `Cron` from `croner`
- Module-level `let job: Cron | null = null`
- Export `start*Scheduler(db: Database.Database)` and `stop*Scheduler()` functions
- Croner callback wrapped in try-catch with `console.error` on failure
- Log messages use `[module-name]` prefix format
- Registered in `packages/server/src/index.ts` inside `process.env.NODE_ENV !== 'test'` block
- Stop functions called in SIGTERM handler

### Existing purgeOldConversations (chat-history-service.ts:150-155)
- Takes `(db, retentionDays)`, returns `number` (count of deleted rows)
- Uses string interpolation for retention days in SQL -- safe since parsed as integer
- Deletes from `chat_conversations`; CASCADE handles `chat_messages` automatically
- Does NOT return `sdk_session_id` values -- needs enhancement

### SDK Session Files
- Stored at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`
- The encoded cwd replaces non-alphanumeric characters with `-`
- Session IDs are stored in `chat_conversations.sdk_session_id` (nullable)
- Need to query session IDs BEFORE delete (CASCADE removes the data)

### Test Infrastructure
- Existing test file: `chat-history-service.test.ts` with 417 lines covering all service functions
- Tests use `createDatabase(join(tmpDir, 'test.db'))` pattern with tmpdir cleanup
- `purgeOldConversations` already has 4 tests covering basic scenarios

## Key Implementation Details

### purgeOldConversations Enhancement
The function must be modified to:
1. Query `sdk_session_id` from expired conversations BEFORE deletion
2. Delete the expired conversations (CASCADE handles messages)
3. Return `{ deletedCount: number; sessionIds: string[] }` instead of just `number`

This is a breaking change to the return type, but `purgeOldConversations` is only called from tests currently (no existing scheduler calls it). The existing tests need updating.

### SDK Session File Path Discovery
The encoded CWD path can be constructed by replacing non-alphanumeric chars with `-` in `process.cwd()`. The full path pattern: `${homedir()}/.claude/projects/${encodedCwd}/${sessionId}.jsonl`

### Environment Variable
`CHAT_RETENTION_DAYS` read from `process.env` at execution time (not registration time) so it can be changed without restart. Default: 90.

## Files to Modify

1. `packages/server/src/chat-history/chat-history-service.ts` -- enhance `purgeOldConversations` return type
2. `packages/server/src/chat-history/chat-history-service.test.ts` -- update existing purge tests for new return type + add scheduler tests
3. `packages/server/src/chat-history/chat-cleanup-scheduler.ts` -- NEW: croner job
4. `packages/server/src/index.ts` -- register scheduler, add to SIGTERM handler

## Risk Assessment

- **Low risk**: Well-established scheduler pattern with two existing examples
- **Negligible race condition**: 3 AM cleanup vs active conversation at 90-day boundary -- accepted per CONTEXT.md
- **File cleanup is best-effort**: ENOENT errors swallowed, non-ENOENT logged as warnings

## RESEARCH COMPLETE
