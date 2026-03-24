# Phase 20: Deploy Scripts - Research

**Researched:** 2026-03-23
**Status:** Complete

## Current State Analysis

### setup.sh (deploy/setup.sh) — 31 lines
- Uses deprecated `launchctl load` (lines 17, 20)
- No `.env` pre-flight check
- No node binary path validation
- Fixed `sleep 3` instead of retry-based health check
- No `bootout` before `bootstrap` for re-run safety

### deploy.sh (deploy/deploy.sh) — 19 lines
- Already uses modern `launchctl kickstart -k` for restart
- No build output verification after `npm run build`
- No health check after restart — just prints "Deploy complete."
- No node binary path validation

### Server SIGTERM handler (packages/server/src/index.ts, line 50-54)
- Calls `server.close()` without callback
- No `process.exit(0)` — process may not exit cleanly
- No hard timeout — could hang indefinitely if connections don't drain
- This causes deploy.sh `kickstart -k` to potentially see a non-zero exit, triggering KeepAlive restart during deploy window

## Technical Findings

### launchctl bootstrap/bootout
- `launchctl bootstrap gui/<uid> <plist-path>` registers and loads the service
- `launchctl bootout gui/<uid>/<label>` removes the service registration
- For re-run safety, `bootout` should be called before `bootstrap` (ignore errors if service doesn't exist)
- `launchctl kickstart gui/<uid>/<label>` explicitly starts a registered service

### Node binary path
- Both plists reference: `/Users/seanspade/.nvm/versions/node/v20.16.0/bin/node`
- Can extract with: `grep -A1 'ProgramArguments' deploy/com.minerva.server.plist | grep '/bin/node' | sed 's/.*<string>\(.*\)<\/string>/\1/'`
- Simpler approach: define as a variable at top of each script and check with `[ -x "$NODE_PATH" ]`

### Build output paths to verify
- Server: `packages/server/dist/index.js`
- Client: `packages/client/dist/index.html`

### Health check retry pattern
```bash
for i in {1..10}; do
  if curl -s http://localhost:3001/health | grep -q '"ok"'; then
    echo "Server is healthy!"
    exit 0  # or break
  fi
  sleep 1
done
echo "Server failed to start"
exit 1
```

## Changes Required

### File: deploy/setup.sh
1. Add `.env` check at top (DEPLOY-05)
2. Add node binary path validation (DEPLOY-04)
3. Replace `launchctl load` with `bootout` (ignore errors) + `bootstrap` (DEPLOY-02)
4. Add `kickstart` after bootstrap to ensure immediate start
5. Replace `sleep 3` + single check with retry loop health check (DEPLOY-01)

### File: deploy/deploy.sh
1. Add node binary path validation (DEPLOY-04)
2. Add build output verification after `npm run build` (DEPLOY-03)
3. Add health check retry loop after restart (DEPLOY-03)

### File: packages/server/src/index.ts
1. Fix SIGTERM handler: `server.close(() => process.exit(0))`
2. Add 5-second hard timeout: `setTimeout(() => process.exit(0), 5000)`

## Risk Assessment

- **Low risk**: All changes are additive guards or replacing deprecated APIs with modern equivalents
- **No database changes**: Pure script and process management
- **Rollback**: Git revert is sufficient since plists are already correct from Phase 19
- **Testing limitation**: Full end-to-end test requires the physical iMac; unit testing of bash scripts is not practical

## RESEARCH COMPLETE
