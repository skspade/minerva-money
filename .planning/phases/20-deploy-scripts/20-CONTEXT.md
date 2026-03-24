# Phase 20: Deploy Scripts - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

One-command first-install and one-command updates with pre-flight validation. This phase fixes `setup.sh` to use modern `launchctl bootstrap` and adds `.env` pre-flight checks, hardens `deploy.sh` with build verification and health checks, and ensures both scripts validate the node binary path before installing or updating plists. Phases 18 and 19 already fixed the plists themselves -- this phase fixes the scripts that install and manage them.

</domain>

<decisions>
## Implementation Decisions

### setup.sh First-Install Flow (DEPLOY-01, DEPLOY-02)
- setup.sh performs: validate pre-flights, install deps, build, copy plists to `~/Library/LaunchAgents/`, bootstrap services, health check
- Replace deprecated `launchctl load` with `launchctl bootstrap gui/$(id -u) <plist-path>` for both server and backup plists
- Use `launchctl kickstart gui/$(id -u)/com.minerva.server` after bootstrap to explicitly start the server service (Claude's Decision: bootstrap registers the service but kickstart ensures it starts immediately for the health check)
- Health check uses `curl -s http://localhost:3001/health` with retry loop instead of fixed `sleep 3` (Claude's Decision: retry loop is more reliable than a fixed sleep on loaded systems per PITFALLS.md)

### deploy.sh One-Command Update (DEPLOY-03)
- deploy.sh performs: git pull, install deps, build, verify build output, restart service, health check
- Build each workspace explicitly (`npm run build --workspace=packages/server` then `--workspace=packages/client`) so failures are isolated (from PITFALLS.md pitfall 7)
- After build, verify `packages/server/dist/index.js` and `packages/client/dist/index.html` exist before restarting (from PITFALLS.md pitfall 7)
- Add health check after restart -- current deploy.sh has none (Claude's Decision: deploy.sh should confirm the server is healthy before reporting success, matching setup.sh behavior)
- Keep using `launchctl kickstart -k` for restart -- the KeepAlive dict form from Phase 19 means this is safe (Claude's Decision: kickstart -k is the standard modern restart pattern and is already in the script)

### Node Binary Path Validation (DEPLOY-04)
- Both scripts validate the node binary path from the plist exists before proceeding
- Extract the path from the plist and check with `[ -x "$NODE_PATH" ]` (Claude's Decision: checking the plist's actual path is more reliable than checking `which node` since they could differ)
- Exit with a clear error message if the node binary is not found

### .env Pre-Flight Check (DEPLOY-05)
- setup.sh checks `[ -f .env ]` before attempting any build or service installation
- Exit with error message explaining that `.env` must be created manually with SimpleFIN and Anthropic API credentials
- deploy.sh does NOT need this check -- .env should already exist on an update (Claude's Decision: deploy.sh runs on an already-configured machine where .env was validated during initial setup)

### Graceful Shutdown in deploy.sh
- Current SIGTERM handler in `index.ts` calls `server.close()` without a callback and without `process.exit(0)` -- the process may not exit cleanly
- Fix the SIGTERM handler to use `server.close(() => process.exit(0))` so the process exits with code 0 after draining connections (Claude's Decision: without explicit exit(0), launchd may see the exit as a crash and trigger KeepAlive restart during deploy)
- Add a hard timeout of 5 seconds before force-exiting to prevent hangs (Claude's Decision: prevents indefinite hang if a connection never drains)

### Script Error Handling
- Both scripts use `set -e` to abort on any command failure (already present)
- Both scripts `cd` to project root via `cd "$(dirname "$0")/.."` (already present)
- Echo progress messages at each step for visibility (already present, extend as needed)

### Claude's Discretion
- Exact retry count and interval for health check loop
- Exact wording of error messages for pre-flight failures
- Whether to extract node path from plist via grep/sed or hardcode it as a variable
- Whether to validate plist XML with `plutil -lint` before copying

</decisions>

<specifics>
## Specific Ideas

- The node binary path in both plists is `/Users/seanspade/.nvm/versions/node/v20.16.0/bin/node` (confirmed by reading current plists from Phase 18/19 fixes)
- setup.sh currently has no `.env` check and uses `launchctl load` -- both need fixing per DEPLOY-02 and DEPLOY-05
- deploy.sh currently has no build verification and no health check after restart -- just `echo "Deploy complete."` after kickstart
- The `launchctl bootstrap` command requires the full path to the plist in `~/Library/LaunchAgents/`, not the repo copy
- For teardown/re-bootstrap scenarios, `launchctl bootout gui/$(id -u)/com.minerva.server` removes the service (Claude's Decision: setup.sh should bootout existing services before bootstrapping to handle re-runs cleanly)
- The SIGTERM handler fix (`server.close` callback + timeout) is a server code change, not a script change, but is required for deploy.sh to restart cleanly

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `deploy/setup.sh`: Existing 31-line script with correct overall flow (install, build, copy plists, load, health check) -- needs pre-flight checks, launchctl modernization, and retry-based health check
- `deploy/deploy.sh`: Existing 17-line script with correct flow (pull, install, build, restart) -- needs build verification and health check added
- `deploy/com.minerva.server.plist`: Already fixed in Phases 18/19 with correct nvm node path, KeepAlive dict form, and compiled entry point
- `deploy/com.minerva.backup.plist`: Already fixed in Phase 18 with correct nvm node path and compiled backup entry point
- `packages/server/src/index.ts` SIGTERM handler at line 50: Calls `server.close()` without callback or `process.exit(0)` -- needs fix for clean deploy restarts

### Established Patterns
- Both scripts use `set -e` and `cd "$(dirname "$0")/.."` to establish project root context
- deploy.sh already uses modern `launchctl kickstart -k` -- only setup.sh uses deprecated `launchctl load`
- Health check pattern: `curl -s http://localhost:3001/health | grep -q '"ok"'` already in setup.sh

### Integration Points
- Scripts copy plists from `deploy/` to `~/Library/LaunchAgents/` -- the plists must be correct before scripts run (Phase 18/19 dependency satisfied)
- `npm run build` in root `package.json` runs `npm run build --workspaces` which builds server and client
- `packages/server/dist/index.js` is the compiled server entry point referenced by the plist and `start:prod`
- `packages/client/dist/index.html` is the SPA entry point served by Express static middleware
- Health endpoint at `GET /health` returns `{"status":"ok"}` -- used by both scripts

</code_context>

<deferred>
## Deferred Ideas

- Log rotation via newsyslog for `~/Library/Logs/minerva-server.log` -- post-v2.1 (REQUIREMENTS.md LOG-01)
- SSL/TLS termination for external access -- out of scope (REQUIREMENTS.md REMOTE-01)
- End-to-end validation on the physical iMac -- manual post-milestone verification step
- tRPC smoke test in health check (hitting `/trpc` endpoint to verify API layer) -- nice-to-have but not required by success criteria
- Dynamic plist generation (writing node path into plist at setup time) -- unnecessary since plists already have correct path from Phase 18

</deferred>

---

*Phase: 20-deploy-scripts*
*Context gathered: 2026-03-23 via auto-context*
