# Phase 19: Service Configuration - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

launchd service definitions correctly manage the server and backup processes with crash recovery and boot startup. This phase ensures the server plist uses the correct node binary path and points at compiled output, launchd restarts only on crashes (not clean exits), the server starts on login, crash loops are throttled, and the backup plist runs compiled JS.

</domain>

<decisions>
## Implementation Decisions

### KeepAlive Crash Recovery (PROC-01)
- Server plist `KeepAlive` must use dict form `{SuccessfulExit: false}` instead of bare `true`
- Bare `true` restarts the process on any exit including clean shutdown, which interferes with deploy restarts and intentional stops
- Dict form means launchd only restarts on non-zero exit codes (crashes)
- The current plist already has `<key>KeepAlive</key><true/>` which needs to change to the dict form (Claude's Decision: research PITFALLS.md documents this as a critical issue -- bare true restarts on intentional stops)

### Boot Startup (PROC-02)
- Server plist `RunAtLoad: true` is already configured correctly -- starts on user login
- No changes needed; verify this key is present and unchanged

### Restart Throttling (PROC-03)
- Server plist `ThrottleInterval: 10` is already configured correctly -- limits restarts to one per 10 seconds
- No changes needed; verify this key is present and unchanged

### Node Binary Path (PROC-04)
- Server plist already uses `/Users/seanspade/.nvm/versions/node/v20.16.0/bin/node` (fixed in Phase 18)
- Verify the path matches `which node` on the target machine
- No changes needed unless Phase 18 verification reveals a discrepancy

### Backup Plist Compiled JS (PROC-05)
- Backup plist already points to `packages/server/dist/backup/run-backup.js` (fixed in Phase 18)
- Backup plist already uses `--env-file=.env` and the correct nvm node path
- No changes needed; verify entry point resolves to compiled output after build

### Verification Approach
- After plist changes, validate with `plutil -lint` to catch XML syntax errors (Claude's Decision: plutil is the standard macOS plist validation tool)
- Verify KeepAlive behavior by confirming clean exit (code 0) does not trigger restart (Claude's Decision: this is the core behavioral change and must be explicitly tested)
- Confirm both services appear in `launchctl list | grep minerva` with exit code 0 after loading (Claude's Decision: standard launchd verification pattern from PITFALLS.md checklist)

### Claude's Discretion
- Whether to add XML comments to plists explaining the KeepAlive dict form choice
- Exact test sequence for verifying crash-restart vs clean-exit behavior
- Whether verification is manual instructions or a small shell script

</decisions>

<specifics>
## Specific Ideas

- The KeepAlive dict form change is the only structural modification needed in this phase -- all other PROC requirements were already addressed by Phase 18 plist fixes
- The exact XML for the KeepAlive change (from research ARCHITECTURE.md):
  ```xml
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  ```
- The backup plist does NOT need KeepAlive at all -- it uses `StartInterval: 21600` for periodic execution and exits cleanly after each run. It should not be kept alive between runs. (Claude's Decision: backup is a periodic task, not a long-lived service)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `deploy/com.minerva.server.plist`: Complete server plist with correct Label, ProgramArguments (nvm node path, --env-file, compiled entry point), WorkingDirectory, RunAtLoad, ThrottleInterval, EnvironmentVariables, and log paths. Only KeepAlive needs dict form change.
- `deploy/com.minerva.backup.plist`: Complete backup plist with correct Label, ProgramArguments (nvm node path, --env-file, compiled backup entry point), WorkingDirectory, StartInterval (21600 = 6 hours), RunAtLoad, and log paths. No changes needed.

### Established Patterns
- Both plists use absolute paths for everything: node binary, WorkingDirectory, log paths. No relative paths except `--env-file=.env` which resolves relative to WorkingDirectory.
- Both plists set `NODE_ENV=production` via EnvironmentVariables dict.
- Server logs split stdout/stderr to separate files; backup logs both to same file.

### Integration Points
- Phase 20 (Deploy Scripts) depends on these plists being correct -- `setup.sh` copies them to `~/Library/LaunchAgents/` and `deploy.sh` restarts the server via `launchctl kickstart -k`
- The KeepAlive dict form change affects deploy behavior: with `SuccessfulExit: false`, a clean `launchctl bootout` will not trigger auto-restart, making deploys cleaner
- `packages/server/src/index.ts` SIGTERM handler calls `process.exit(0)` on clean shutdown -- the dict form KeepAlive correctly treats exit code 0 as "successful" and will not restart

</integration_points>

</code_context>

<deferred>
## Deferred Ideas

- `setup.sh` modernization (launchctl bootstrap instead of load) -- Phase 20 scope
- `.env` pre-flight check in setup.sh -- Phase 20 scope
- Build output verification before service restart in deploy.sh -- Phase 20 scope
- Log rotation via newsyslog -- post-v2.1 (REQUIREMENTS.md LOG-01)
- SSL/TLS termination -- out of scope (REQUIREMENTS.md REMOTE-01)
- SIGTERM handler `server.close()` callback await verification -- Phase 20 scope per PITFALLS.md

</deferred>

---

*Phase: 19-service-configuration*
*Context gathered: 2026-03-23 via auto-context*
