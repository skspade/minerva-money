# Phase 19: Service Configuration - Research

**Researched:** 2026-03-23
**Status:** Complete

## Phase Objective

launchd service definitions correctly manage the server and backup processes with crash recovery and boot startup.

## Current State Analysis

### Server Plist (`deploy/com.minerva.server.plist`)

Current configuration:
- **Label:** `com.minerva.server`
- **ProgramArguments:** nvm node v20.16.0 -> `--env-file=.env` -> `packages/server/dist/index.js`
- **WorkingDirectory:** `/Users/seanspade/Documents/Source/minverva-money`
- **NODE_ENV:** production
- **KeepAlive:** `<true/>` (BARE BOOLEAN - needs change to dict form)
- **RunAtLoad:** `<true/>` (correct)
- **ThrottleInterval:** 10 (correct)
- **Log paths:** stdout and stderr to separate files in `~/Library/Logs/`

### Backup Plist (`deploy/com.minerva.backup.plist`)

Current configuration:
- **Label:** `com.minerva.backup`
- **ProgramArguments:** nvm node v20.16.0 -> `--env-file=.env` -> `packages/server/dist/backup/run-backup.js`
- **WorkingDirectory:** `/Users/seanspade/Documents/Source/minverva-money`
- **NODE_ENV:** production
- **StartInterval:** 21600 (6 hours - periodic task)
- **RunAtLoad:** `<true/>` (runs once at login, then every 6 hours)
- **No KeepAlive:** correct -- backup is a periodic task, not a long-lived service
- **Log paths:** both stdout/stderr to same file

### Server Shutdown Behavior

`packages/server/src/index.ts` line 50-54:
```typescript
process.on('SIGTERM', () => {
    stopSyncScheduler();
    stopBudgetScheduler();
    server.close();
});
```

The SIGTERM handler stops schedulers and closes the HTTP server. When `server.close()` completes and no active handles remain, Node exits with code 0 naturally. This means:
- `launchctl bootout` sends SIGTERM -> exit code 0 -> KeepAlive dict form treats as "successful exit" -> no restart
- Crash (unhandled exception) -> non-zero exit -> KeepAlive dict form triggers restart

## Required Changes

### Only Change: KeepAlive Dict Form (PROC-01)

The server plist line 20-21 currently reads:
```xml
<key>KeepAlive</key>
<true/>
```

Must change to:
```xml
<key>KeepAlive</key>
<dict>
    <key>SuccessfulExit</key>
    <false/>
</dict>
```

**Why:** Bare `<true/>` restarts on ANY exit including clean shutdown (exit code 0). This means:
- `launchctl bootout` triggers an immediate restart (defeating the purpose of stopping)
- `launchctl kickstart -k` during deploy works but the bare-true form is semantically wrong
- Dict form with `SuccessfulExit: false` only restarts on non-zero exits (crashes)

### No Changes Needed

- **PROC-02 (RunAtLoad):** Already `<true/>` in server plist
- **PROC-03 (ThrottleInterval):** Already `10` in server plist
- **PROC-04 (Node binary path):** Already correct absolute nvm path
- **PROC-05 (Backup compiled JS):** Already points to `dist/backup/run-backup.js`

## Verification Approach

1. **Syntax validation:** `plutil -lint deploy/com.minerva.server.plist` after edit
2. **KeepAlive structure:** Parse plist and verify KeepAlive is dict with SuccessfulExit=false
3. **Existing keys preserved:** Verify RunAtLoad, ThrottleInterval, node path all unchanged
4. **Backup plist untouched:** Confirm no regressions in backup plist

## Risk Assessment

- **Low risk:** Single XML element change in one file
- **No code changes:** Only plist XML modification
- **Easily reversible:** Single line revert if issues found
- **Backup plist:** No changes needed, but should verify it remains correct

## RESEARCH COMPLETE
