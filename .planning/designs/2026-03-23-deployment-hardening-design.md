# Deployment Hardening — Design

**Date:** 2026-03-23
**Approach:** launchd Service + Deploy Script

## Production Build & Static File Serving

The server serves the Vite-built client in production. This requires:

**Server changes (`packages/server/src/index.ts`):**
- Express static file middleware pointing to `packages/client/dist/`
- SPA catch-all route that serves `index.html` for client-side routing
- Only enabled outside of test environment

**Build process:**
- Root `package.json` has a `build` script that builds both server and client: `npm run build --workspaces`
- Server builds with `tsc` → `packages/server/dist/`
- Client builds with `vite build` → `packages/client/dist/`

**Production start:**
- Root script: `start:prod` runs `node --env-file=.env packages/server/dist/index.js`
- Node 20's native `--env-file` flag replaces `tsx --env-file` — no `dotenv` dependency needed

## launchd Service Configuration

A `com.minerva.server.plist` file for macOS launchd that manages the Express server process.

**Key configuration:**
- **Label:** `com.minerva.server`
- **Program:** `/usr/local/bin/node` with `--env-file=.env packages/server/dist/index.js`
- **WorkingDirectory:** Project root
- **KeepAlive:** `true` — auto-restarts the process if it exits for any reason
- **RunAtLoad:** `true` — starts when user logs in
- **ThrottleInterval:** `10` — waits 10 seconds before restarting a crashed process
- **StandardOutPath / StandardErrorPath:** `~/Library/Logs/minerva-server.log` and `~/Library/Logs/minerva-server-error.log`
- **EnvironmentVariables:** `NODE_ENV=production`

**Installation:**
- Plist lives in the repo at `deploy/com.minerva.server.plist`
- Copied to `~/Library/LaunchAgents/` (user-level LaunchAgent)
- Loaded with `launchctl load ~/Library/LaunchAgents/com.minerva.server.plist`

## Deploy Script

A `deploy/deploy.sh` bash script that handles pulling new code, building, and restarting the service.

**Steps:**
1. `git pull origin main`
2. `npm install`
3. `npm run build`
4. `launchctl kickstart -k gui/$(id -u)/com.minerva.server`

**First-time setup script (`deploy/setup.sh`):**
1. `npm install` and `npm run build`
2. Copies both server and backup plists to `~/Library/LaunchAgents/`
3. Loads both plists with `launchctl load`
4. Verifies server starts by hitting `http://localhost:3001/health`

## Environment & Directory Layout

**Deploy directory:**
```
deploy/
├── com.minerva.server.plist   # launchd service definition
├── com.minerva.backup.plist   # existing backup scheduler (moved here)
├── deploy.sh                  # Update & restart script
└── setup.sh                   # First-time installation script
```

**Log files:**
- `~/Library/Logs/minerva-server.log` — stdout
- `~/Library/Logs/minerva-server-error.log` — stderr
