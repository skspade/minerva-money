# Pitfalls Research

**Domain:** Adding launchd process management, production builds, and deploy scripts to existing Node.js Express app on macOS
**Researched:** 2026-03-23
**Confidence:** HIGH (launchd behavior verified via official Apple docs and community post-mortems; project-specific issues verified against actual codebase)

## Critical Pitfalls

### Pitfall 1: launchd PATH Does Not Include Node

**What goes wrong:**
The plist's `ProgramArguments` specifies `/usr/local/bin/node`, which works on a developer machine where Homebrew Node lives there. But if Node was installed via `nvm`, the actual binary lives at something like `~/.nvm/versions/node/v20.x.x/bin/node`. The process silently fails to start, or the wrong Node version runs. This is compounded by launchd running with a stripped environment — it does not source `.zshrc`, `.bash_profile`, or any shell init that sets `NVM_DIR`.

**Why it happens:**
The existing `com.minerva.server.plist` hardcodes `/usr/local/bin/node`. Developers test `npm run dev` (which uses the shell-configured Node) and never verify the plist path independently. The launchd error is logged to `~/Library/Logs/minerva-server-error.log` but not surfaced anywhere visible.

**How to avoid:**
- Run `which node` in the active shell to get the real path, then verify that exact path exists in the plist.
- The `setup.sh` script should validate the node binary path before copying plists: `[ -x "/usr/local/bin/node" ] || echo "ERROR: node not at expected path"`.
- Alternatively, use the absolute path returned by `which node` in setup.sh to write the plist dynamically instead of copying a static one.

**Warning signs:**
- `launchctl list | grep minerva` shows the service with a non-zero exit code (e.g., `78` = path not found, `127` = command not found).
- `~/Library/Logs/minerva-server-error.log` contains `env: node: No such file or directory` or similar.
- `curl http://localhost:3001/health` immediately returns connection refused after `launchctl load`.

**Phase to address:**
Production build and launchd setup phase. The setup.sh script must validate the node binary path. Document exact verification step.

---

### Pitfall 2: KeepAlive: true Causes Restart Loop on Intentional Stop

**What goes wrong:**
The current `com.minerva.server.plist` uses `KeepAlive: true`. This means launchd will restart the process any time it exits — including when `deploy.sh` intentionally stops it with `launchctl kickstart -k`. The deploy script stops the server, starts the build, and then the server tries to start from the old binary while the build is still running. The server boots with the stale build, serves the old client, and then gets replaced mid-request by the new build completing.

Worse: if the server crashes on startup (e.g., missing env var, port conflict), `KeepAlive: true` with no `ThrottleInterval` causes a tight restart loop that maxes CPU. The current plist has `ThrottleInterval: 10`, which caps this to 6 restarts/minute — better than none, but still restarts into a broken state indefinitely.

**Why it happens:**
`KeepAlive: true` is the simplest way to get crash recovery. Developers add it without understanding that it also restarts on clean exits. The deploy script uses `launchctl kickstart -k` (which sends SIGKILL), bypassing the SIGTERM handler, causing a non-zero exit that launchd treats as a crash.

**How to avoid:**
- Use `KeepAlive` with `SuccessfulExit: false` (the default when using the dict form) to restart only on crashes, not on clean stops:
  ```xml
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  ```
- The deploy script should stop the server cleanly (SIGTERM, wait for exit, then build, then start), not use `kickstart -k` which sends SIGKILL.
- Keep `ThrottleInterval: 10` as a safety net against crash loops. This is already present in the current plist.

**Warning signs:**
- Server starts before build completes during deploy (requests to `/` return old client hash/version).
- `launchctl list com.minerva.server` shows increasing `runs` count with no deploy happening.
- CPU spikes to 100% after a failed startup.

**Phase to address:**
Deploy script phase. Fix `KeepAlive` dict form in plist and replace `kickstart -k` with a graceful stop-wait-start sequence.

---

### Pitfall 3: SIGTERM Handler Does Not Wait for Schedulers to Flush

**What goes wrong:**
The existing `index.ts` SIGTERM handler calls `stopSyncScheduler()`, `stopBudgetScheduler()`, and `server.close()` — but these are fire-and-forget. `server.close()` stops accepting new connections but does not wait for in-flight requests to complete. If a SimpleFIN sync is mid-write when the server receives SIGTERM (e.g., mid-deploy), the SQLite transaction may be left in an uncommitted state, causing a corrupt or incomplete sync on the next boot.

**Why it happens:**
`server.close()` takes a callback when all connections are drained, but the current code ignores it. The scheduler stop functions likely call croner's job stop, which cancels future runs but does not await any currently-executing job body. This is the standard "looks done but isn't" pattern for graceful shutdown.

**How to avoid:**
- `server.close()` should use its callback (or be promisified) before calling `process.exit(0)`.
- Scheduler stop functions should await any currently running job if possible, or at minimum add a brief `setTimeout` (1-2 seconds) before exit to let SQLite WAL flush.
- better-sqlite3 uses synchronous transactions, so if a sync function was called and completed its transaction, the data is safe. The risk is when SIGTERM arrives during the async parts between synchronous DB calls (e.g., between a network fetch and the DB write).
- Add `process.exit(0)` explicitly after shutdown completes, with a hard timeout of 5 seconds to avoid hanging.

**Warning signs:**
- Sync runs immediately after server restart show gaps (missing transactions that should have been fetched).
- SQLite `.backup` files from iCloud contain incomplete data right before restart events.
- Server takes more than 5 seconds to stop during deploy (suggests a hung connection).

**Phase to address:**
Deploy script phase, specifically in the graceful shutdown step of the deploy sequence.

---

### Pitfall 4: Production Build Path Mismatch Between tsc Output and Express Static Serve

**What goes wrong:**
The server's `index.ts` resolves the client dist as:
```typescript
const clientDist = path.resolve(__dirname, '../../client/dist');
```
In development, `__dirname` is `packages/server/src` and `../../client/dist` resolves to `packages/client/dist`. After `tsc` builds to `packages/server/dist/`, `__dirname` becomes `packages/server/dist` and `../../client/dist` still resolves correctly because the relative depth is the same. BUT if the TypeScript `outDir` ever changes, or if the server is started from a different working directory, this breaks silently — Express starts but serves nothing or throws ENOENT.

**Why it happens:**
ESM `__dirname` via `fileURLToPath(import.meta.url)` is correct, but relative path resolution is fragile across dev/prod. This specific project happens to work because `src/` and `dist/` are at the same depth, but the path is never verified at startup.

**How to avoid:**
- Add a startup check: if `clientDist` directory does not exist, log a fatal error and exit with code 1 instead of silently serving nothing.
- The `start:prod` script in `package.json` already uses `node --env-file=.env packages/server/dist/index.js` from the project root — this makes `__dirname` resolve from `packages/server/dist/` which is correct. Document that this script must always be run from project root.
- The deploy.sh `cd "$(dirname "$0")/.."` correctly navigates to project root before running — verify this is the first command.

**Warning signs:**
- Server starts and health endpoint returns `ok`, but `GET /` returns 404 or an empty response.
- `~/Library/Logs/minerva-server-error.log` contains `ENOENT: no such file or directory, stat '...client/dist/index.html'`.
- Browser shows a blank page or "Cannot GET /" after deploy.

**Phase to address:**
Production build phase. Add a startup assertion that `clientDist` exists before Express mounts static middleware.

---

### Pitfall 5: SPA Client-Side Routing Breaks After Deploy

**What goes wrong:**
The Express wildcard `app.get('*', ...)` that returns `index.html` for all unmatched routes is placed after `app.use(express.static(clientDist))`. This is correct order. However, the `*` wildcard in newer Express versions also matches `/trpc/*` routes if `app.use('/trpc', ...)` is not registered first. Since tRPC is registered before static serving in `index.ts`, this is currently safe — but a future refactor that reorders middleware could silently break tRPC by returning HTML for API calls instead of JSON.

Additionally: the current Vite config has no explicit `base`, so assets are served from `/`. If the app ever needs to be served under a subpath, all asset references break.

**Why it happens:**
Express middleware order is implicit and easy to break when adding new routes. The wildcard fallback is a "magic" pattern that confuses developers who add new routes after it.

**How to avoid:**
- Add a comment above the wildcard route explicitly documenting the order requirement: `// MUST be last — catches all non-API routes for SPA client routing`.
- The health endpoint at `/health` and tRPC at `/trpc` must be registered before static and wildcard routes. Add an integration test that hits `/trpc/...` and verifies JSON response, not HTML.
- Do not change the Vite `base` config from `/` unless explicitly needed. Subpath deployment would require coordinated changes to both Vite config and Express static serve paths.

**Warning signs:**
- Direct navigation to `/budgets` or `/chat` in the browser returns HTML in API calls (check Network tab in DevTools — tRPC calls returning 200 with `<!DOCTYPE html>`).
- tRPC calls fail after any middleware refactor.

**Phase to address:**
Production build phase. Verify route order and add integration test for API vs. static route separation.

---

### Pitfall 6: setup.sh Uses launchctl load (Deprecated Since macOS Ventura)

**What goes wrong:**
The current `setup.sh` uses `launchctl load ~/Library/LaunchAgents/com.minerva.server.plist`. On macOS Ventura (13) and later, `launchctl load` is deprecated in favor of `launchctl bootstrap` and `launchctl enable`. Using the deprecated form works today but may stop working in a future macOS update without warning. More critically, `launchctl load` will silently succeed even if the plist has syntax errors in some macOS versions.

**Why it happens:**
`launchctl load` is pervasive in tutorials and StackOverflow answers because it was the only API for years. Most examples predate Ventura.

**How to avoid:**
- Use `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.minerva.server.plist` for initial load.
- Use `launchctl kickstart gui/$(id -u)/com.minerva.server` to start after bootstrapping.
- Use `launchctl bootout gui/$(id -u)/com.minerva.server` to unload.
- Verify the plist with `plutil -lint deploy/com.minerva.server.plist` before copying to LaunchAgents.
- The `deploy.sh` already uses `launchctl kickstart -k "gui/$(id -u)/com.minerva.server"` which is the correct modern form.

**Warning signs:**
- macOS logs deprecation warnings when running `launchctl load` (check Console.app).
- Setup fails on a fresh macOS install without error message.
- Service appears loaded but never starts.

**Phase to address:**
launchd setup phase. Update setup.sh to use bootstrap/kickstart API.

---

### Pitfall 7: deploy.sh Does Not Verify Build Success Before Restart

**What goes wrong:**
The current `deploy.sh` runs `npm run build` and then immediately restarts with `launchctl kickstart`. If the TypeScript build fails (syntax error, type error), `npm run build` exits non-zero, `set -e` will abort the script — but only if the build command itself fails. If `tsc` exits 0 with warnings, or if the Vite build succeeds but the server build fails silently (unlikely with `set -e` but possible with parallel workspace builds), the server restarts against a partially built or stale `dist/`.

Additionally, `npm run build --workspaces` builds client and server in sequence. If client build succeeds but server build fails, the old server binary runs with a new client build — API contract mismatches are possible if tRPC router types changed.

**Why it happens:**
`set -e` catches explicit exit codes but not all partial build failures. Workspace build commands may not propagate individual package failures as expected in all npm versions.

**How to avoid:**
- Build each workspace explicitly with separate commands in deploy.sh so failures are isolated:
  ```bash
  npm run build --workspace=packages/server
  npm run build --workspace=packages/client
  ```
- After build, verify the output exists: `[ -f packages/server/dist/index.js ] || { echo "Server build failed"; exit 1; }`.
- After deploy, the existing health check (`curl -s http://localhost:3001/health`) is correct. Add a brief wait before it (the current `sleep 3` is already there in setup.sh but missing in deploy.sh).

**Warning signs:**
- Server restarts but the health check in deploy.sh passes while the actual app is broken (health endpoint does not exercise tRPC or client serving).
- TypeScript errors in CI but deploy.sh succeeds locally (type checking is `tsc --noEmit` but build is `tsc` — verify tsconfig strict mode).

**Phase to address:**
Deploy script phase. Sequential per-workspace builds with explicit output verification.

---

### Pitfall 8: .env File Not Present at Production Start Path

**What goes wrong:**
The `start:prod` script uses `node --env-file=.env packages/server/dist/index.js` and the server plist uses `--env-file=.env` (relative path). The relative path resolves relative to `WorkingDirectory`, which is set to the project root in the plist. This works only if `.env` exists in the project root AND the process is started with that working directory. If the plist is loaded before `.env` is created, the server starts with no API keys and silently fails on first sync or first agent request — no startup error, just runtime failures.

**Why it happens:**
`--env-file` with a relative path is silent when the file is missing on some Node versions (the flag was experimental in 20.6 and behavior on missing file varied). Node 20.7+ exits with an error if the file is missing, but the error goes to stderr (the log file) not to a visible location.

**How to avoid:**
- setup.sh should check for `.env` before installing launchd services: `[ -f .env ] || { echo "ERROR: .env not found at project root"; exit 1; }`.
- Document that `.env` must be manually created with the required keys before running setup.sh.
- Use an absolute path in the plist instead of relative: `/Users/seanspade/Documents/Source/minverva-money/.env` — or use `EnvironmentVariables` in the plist for `NODE_ENV` only and load `.env` in the app via an absolute path.

**Warning signs:**
- Server starts (health endpoint responds) but sync fails with `401 Unauthorized` or SimpleFIN errors.
- Agent requests fail immediately with Anthropic auth errors rather than tool errors.
- `~/Library/Logs/minerva-server-error.log` shows `Error: ENOENT: no such file or directory` for `.env` at startup.

**Phase to address:**
launchd setup phase. Add .env pre-flight check to setup.sh.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded `/usr/local/bin/node` in plist | Simple static plist file | Breaks on nvm installs or Node version upgrades | Never — validate or generate dynamically |
| `launchctl load` (deprecated) in setup.sh | Works on current macOS | May break on future macOS updates | MVP only — update before the next major macOS upgrade |
| `KeepAlive: true` instead of dict form | One-liner crash recovery | Also restarts on intentional stops, complicates deploy | Never — always use dict form with `SuccessfulExit: false` |
| Relative `.env` path in plist | Simple | Breaks if WorkingDirectory changes or .env is missing | Never — use absolute path or explicit pre-flight check |
| No build verification before restart | Faster deploy script | Deploy succeeds while serving stale or broken build | Never — always verify output files exist post-build |
| `sleep 3` before health check | Simple timing | Flaky — may not be enough if system is loaded | Acceptable for MVP; replace with retry loop for robustness |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| launchd + Node.js | Using npm to start the app (`node npm run start`) — npm intercepts signals and does not forward SIGTERM correctly to Node | Use `node` directly: `/usr/local/bin/node --env-file=.env packages/server/dist/index.js` (already correct in current plist) |
| launchd + .env | Relying on relative paths in `--env-file` | Set WorkingDirectory explicitly AND verify .env exists at that path in setup.sh |
| launchd + iCloud | LaunchDaemon (root user) cannot access ~/Library or iCloud Drive paths; LaunchAgent (user) can | Use LaunchAgent in ~/Library/LaunchAgents — already correct in current design |
| Express + Vite SPA | Wildcard `app.get('*', ...)` catches tRPC calls if registered after middleware | Register tRPC middleware before static file middleware; add comment documenting order |
| npm workspaces + build | `npm run build --workspaces` may not exit non-zero if one workspace fails in older npm versions | Build workspaces explicitly and sequentially in deploy.sh |
| launchctl + deploy | `launchctl kickstart -k` sends SIGKILL — bypasses SIGTERM graceful shutdown | Send SIGTERM first, wait for clean exit, then start new process |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| SQLite WAL file growing during restart | Increased startup time; potential disk usage growth | better-sqlite3 WAL checkpoints automatically, but force a checkpoint via `db.pragma('wal_checkpoint(RESTART)')` before graceful shutdown | After 1000+ unchecked WAL frames (unlikely for single-user but good practice) |
| launchd ThrottleInterval too low | CPU spikes after crash as server retries rapidly | Keep ThrottleInterval at 10+ seconds (current value is correct) | Immediately after any crash that persists |
| Health check `sleep 3` too short | Deploy reports success while server is still initializing | Add a retry loop: `for i in 1 2 3 4 5; do curl ... && break; sleep 2; done` | On a loaded system where Node startup takes > 3 seconds |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| .env committed to git | SimpleFIN access URL and Anthropic API key exposed | .env is gitignored — verify this in setup.sh with `git check-ignore .env` |
| plist copied to LaunchAgents containing absolute .env path | Path exposes home directory structure if plist is shared | plist does not need to contain .env contents — only the flag reference. Current design is acceptable. |
| Logs containing API responses | SimpleFIN transaction data or agent outputs in plaintext logs | Current StandardOutPath logs go to ~/Library/Logs/ — user-accessible only. Acceptable for single-user home server. |
| deploy.sh running git pull as root | If setup.sh is ever run with sudo, git operations affect root's git config | Never run setup.sh or deploy.sh with sudo — LaunchAgent (user-level) does not require it |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No deploy progress output | Developer runs deploy.sh and sees nothing for 30+ seconds during build | Already handled: deploy.sh has `echo` statements at each step (correct) |
| Health check only verifies process is up, not that tRPC works | Deploy succeeds but the app is broken at the API layer | After health check, add a smoke-test tRPC call: `curl -s http://localhost:3001/trpc/health.check` |
| No way to view server logs without SSH | Troubleshooting requires opening Terminal | Document log paths prominently in deploy/README or setup.sh output |
| Server restart during active use | User's in-flight tRPC requests fail mid-operation | SIGTERM handler allows existing requests to drain — verify server.close() callback is properly awaited |

## "Looks Done But Isn't" Checklist

- [ ] **launchd service loaded:** `launchctl list | grep minerva` shows both services with exit code 0 (not just "loaded")
- [ ] **Node binary path:** Path in plist matches `which node` — verify after every Node version change
- [ ] **SIGTERM handling:** `server.close()` is awaited before process.exit — verify by checking for in-flight requests surviving graceful restart
- [ ] **Build verification:** `packages/server/dist/index.js` and `packages/client/dist/index.html` exist after build before restart
- [ ] **KeepAlive form:** Plist uses dict form `{SuccessfulExit: false}`, not bare `true`
- [ ] **.env pre-flight:** setup.sh validates .env exists and contains required keys before installing services
- [ ] **Route order:** Express registers tRPC before static, static before wildcard — verify with integration test
- [ ] **log paths:** `~/Library/Logs/minerva-server.log` and `minerva-server-error.log` are writable and being written to
- [ ] **launchctl API:** setup.sh uses `bootstrap/kickstart` not deprecated `load` command
- [ ] **Workspace builds:** Server and client builds are verified independently, not just `npm run build --workspaces`

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong Node path in plist causes service failure | LOW | Check `which node`, update plist, reload service with `launchctl bootout` + `launchctl bootstrap` |
| Deploy broke server (bad build) | LOW | `git stash` or `git checkout` previous build artifacts, OR `git pull` previous commit, rebuild, redeploy |
| KeepAlive restart loop burning CPU | LOW | `launchctl bootout gui/$(id -u)/com.minerva.server`, fix crash cause in code, then `launchctl bootstrap` |
| .env missing causes silent auth failures | LOW | Create .env with correct keys, restart service with `launchctl kickstart gui/$(id -u)/com.minerva.server` |
| SQLite left in inconsistent state after SIGKILL during write | LOW | SQLite WAL mode is resilient to process crashes — on next open, WAL recovery runs automatically. Verify with `.integrity_check`. iCloud backup provides point-in-time recovery if needed. |
| Old client served after failed deploy | LOW | Verify `packages/client/dist/` timestamps match current deploy; rebuild client explicitly |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Wrong Node binary path in plist | launchd setup phase | `launchctl list com.minerva.server` exit code = 0; `curl /health` responds |
| KeepAlive restart loop on intentional stop | launchd setup phase | Intentional `launchctl bootout` does not trigger restart |
| Incomplete graceful shutdown | Deploy script phase | In-flight request during deploy completes normally; no SQLite errors after restart |
| Client dist path mismatch | Production build phase | `GET /` returns React app; `GET /trpc/...` returns JSON, not HTML |
| SPA wildcard catching API routes | Production build phase | tRPC calls succeed after static middleware is added |
| Deprecated launchctl load | launchd setup phase | No deprecation warnings in Console.app; works on macOS Sequoia |
| No build verification before restart | Deploy script phase | Intentionally corrupt server build; verify deploy.sh catches it and does not restart |
| Missing .env at start path | launchd setup phase | Remove .env; run setup.sh; verify it exits with clear error |

## Sources

- [launchd.info — comprehensive plist reference](https://www.launchd.info/) — KeepAlive dict form, ThrottleInterval, WorkingDirectory behavior. HIGH confidence.
- [Apple Developer: Creating Launch Daemons and Agents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html) — official. HIGH confidence.
- [Medium: Where is my PATH, launchD?](https://lucaspin.medium.com/where-is-my-path-launchd-fc3fc5449864) — PATH stripping behavior. MEDIUM confidence (verified against Apple docs).
- [tjluoma/launchd-keepalive GitHub](https://github.com/tjluoma/launchd-keepalive) — KeepAlive behavior variants including SuccessfulExit. MEDIUM confidence.
- [Express.js: Health Checks and Graceful Shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html) — official. HIGH confidence.
- [Node.js native --env-file support](https://nodejs.org/en/blog/release/v20.6.0) — behavior of --env-file with missing file. HIGH confidence (verified against Node 20 release notes).
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) — WAL mode and checkpoint behavior. HIGH confidence.
- Codebase inspection: `deploy/com.minerva.server.plist`, `deploy/setup.sh`, `deploy/deploy.sh`, `packages/server/src/index.ts`, `package.json` — direct verification of existing implementation. HIGH confidence.

---
*Pitfalls research for: Minerva Money v2.1 deployment hardening (launchd + production build + deploy scripts)*
*Researched: 2026-03-23*
