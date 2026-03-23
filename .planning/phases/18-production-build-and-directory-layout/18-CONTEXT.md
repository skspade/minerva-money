# Phase 18: Production Build and Directory Layout - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Server and client produce correct compiled output, Express serves the SPA in production, and all deployment artifacts live in one place. This phase ensures `npm run build` works end-to-end, the compiled server correctly serves the React SPA at all client-side routes, environment variables load via Node 20 native `--env-file`, and the `deploy/` directory is the single home for all deployment config.

</domain>

<decisions>
## Implementation Decisions

### Build Pipeline
- Server builds with `tsc` to `packages/server/dist/` (already configured in `packages/server/tsconfig.json` with `outDir: "dist"`)
- Client builds with `vite build` to `packages/client/dist/` (already configured in client `package.json`)
- Root `npm run build` runs `npm run build --workspaces` to compile both packages
- Root `start:prod` script runs `node --env-file=.env packages/server/dist/index.js` with no dotenv dependency
- Verify build excludes test files (tsconfig already has `exclude: ["src/**/*.test.ts"]`)
- Verify `packages/shared` builds before server via tsconfig project references (Claude's Decision: shared package is a dependency -- build order matters for tsc)

### Express Static File Serving
- Express serves `packages/client/dist/` via `express.static()` using path `path.resolve(__dirname, '../../client/dist')` (already implemented in `src/index.ts`)
- SPA catch-all route serves `index.html` for all non-API, non-health routes (already implemented)
- Static serving only enabled when `NODE_ENV !== 'test'` (already implemented)
- tRPC middleware at `/trpc` is mounted before the catch-all so API requests are handled correctly (already implemented)
- Health endpoint at `/health` returns `{"status":"ok"}` before the catch-all (already implemented)

### Environment Variable Loading
- Node 20 native `--env-file=.env` flag used in both `start:prod` script and plist `ProgramArguments`
- No dotenv package in runtime dependencies (tsx is devDependency only)
- `WorkingDirectory` in plist set to repo root so `--env-file=.env` resolves correctly (already configured)

### Node Binary Path
- Both plists currently hardcode `/usr/local/bin/node` which does not exist on this nvm-managed machine
- Fix to use the absolute nvm path for the target machine (Claude's Decision: nvm does not create symlinks in /usr/local/bin -- must use actual nvm path)
- The exact path should be determined by running `which node` on the target machine before updating plists (Claude's Decision: path may differ between dev and iMac machines)

### Backup Plist Production Fix
- Current backup plist uses `--import tsx` to run TypeScript source `run-backup.ts`
- Fix to run compiled `packages/server/dist/backup/run-backup.js` directly with `node --env-file=.env`
- Remove tsx dependency from backup plist runtime path (Claude's Decision: tsx is a devDependency and launchd strips PATH making it unresolvable)

### Directory Layout
- All deployment config co-located in `deploy/` directory: plists, setup.sh, deploy.sh
- Backup plist already lives in `deploy/` (confirmed by file listing)
- No deployment artifacts elsewhere in the repo

### Claude's Discretion
- Exact verification approach for confirming build output files exist
- Order of fix application within a single plan (plists vs scripts)
- Whether to add comments to plist XML for maintainability

</decisions>

<specifics>
## Specific Ideas

- The server plist KeepAlive should use dict form `{SuccessfulExit: false}` instead of bare `true` so launchd only restarts on crashes, not clean exits (from research ARCHITECTURE.md pitfall 2). Note: this is a Phase 19 concern but the plist file is being touched in this phase for the node path fix.
- The backup plist needs `--env-file=.env` added to ProgramArguments since the backup process needs database path from environment (from ARCHITECTURE.md pattern 3)
- `setup.sh` uses deprecated `launchctl load` -- needs `launchctl bootstrap gui/$(id -u)` (from REQUIREMENTS.md DEPLOY-02). Note: this is a Phase 20 concern but is documented here as context for the deploy directory layout work.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/server/src/index.ts`: Already has complete static file serving, SPA catch-all, health endpoint, SIGTERM handler, and scheduler lifecycle management -- no code changes needed for static serving
- `deploy/com.minerva.server.plist`: Existing server plist with correct structure (Label, WorkingDirectory, KeepAlive, RunAtLoad, ThrottleInterval, log paths) -- needs node binary path fix only
- `deploy/com.minerva.backup.plist`: Existing backup plist with correct scheduling (StartInterval: 21600, RunAtLoad, log paths) -- needs node path fix and switch from tsx source to compiled JS
- `deploy/setup.sh`: Existing first-install script with correct flow (install, build, copy plists, load, health check) -- needs launchctl modernization and .env pre-flight
- `deploy/deploy.sh`: Existing deploy script already using modern `launchctl kickstart -k` -- verify only
- Root `package.json`: Already has `build`, `start:prod`, `dev`, `test`, `lint` scripts configured

### Established Patterns
- Monorepo with `packages/*` workspaces (server, client, shared) -- build runs across all workspaces
- Server uses ESM (`"type": "module"`) with `.js` extensions in imports -- compiled output preserves this
- `__dirname` computed via `path.dirname(fileURLToPath(import.meta.url))` -- standard ESM pattern, works in both tsx dev and compiled production
- Client dist path computed relative to server's `__dirname` -- `../../client/dist` from `packages/server/dist/` resolves to `packages/client/dist/`

### Integration Points
- `packages/server/dist/index.js` is the entry point for both the plist and `start:prod` script
- `packages/server/dist/backup/run-backup.js` is the entry point for the backup plist
- `packages/server/migrations/*.sql` are referenced at runtime from compiled code via relative path `../../migrations` from `dist/db/` -- SQL files are not compiled by tsc
- `.env` at repo root is loaded by `--env-file` flag -- contains SimpleFIN and Anthropic API credentials
- `~/Library/LaunchAgents/` is the install target for plist copies (user-level LaunchAgent)

</code_context>

<deferred>
## Deferred Ideas

- KeepAlive dict form change (`{SuccessfulExit: false}`) -- Phase 19 (Service Configuration) scope
- `launchctl bootstrap` modernization in setup.sh -- Phase 20 (Deploy Scripts) scope
- `.env` pre-flight check in setup.sh -- Phase 20 (Deploy Scripts) scope
- Build output verification before service restart in deploy.sh -- Phase 20 (Deploy Scripts) scope
- Log rotation via newsyslog -- explicitly deferred to post-v2.1 (REQUIREMENTS.md LOG-01)
- SSL/TLS termination -- explicitly out of scope (REQUIREMENTS.md REMOTE-01)
- End-to-end validation on the physical iMac -- Phase 20 or manual post-milestone step

</deferred>

---

*Phase: 18-production-build-and-directory-layout*
*Context gathered: 2026-03-23 via auto-context*
