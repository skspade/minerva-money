# Feature Research

**Domain:** Deployment hardening for Node.js/Express app on macOS home server
**Researched:** 2026-03-23
**Confidence:** HIGH

## Context

This is a subsequent milestone for an existing app (Minerva Money v2.0). The deploy
infrastructure is already partially scaffolded in `deploy/`:

- `com.minerva.server.plist` — launchd agent plist (written, not yet installed/validated)
- `com.minerva.backup.plist` — launchd backup plist (existing; uses tsx in production — needs fix)
- `deploy.sh` — one-command update script (written, not yet tested end-to-end)
- `setup.sh` — first-install script (written, not yet tested end-to-end)

The server `src/index.ts` already serves client static files via `express.static()`.
The build command (`npm run build --workspaces`) compiles both server (tsc) and client
(vite build). The milestone work is finishing and validating these pieces, not starting
from scratch.

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are the baseline behaviors that make the app usable as a persistent home server.
Missing any of these = app stops working after a reboot or crash.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Auto-restart on crash | A home server app must survive unexpected failures without manual intervention | LOW | launchd `KeepAlive: true` + `ThrottleInterval: 10` already in plist — prevents restart storms on repeated crashes |
| Start on boot/login | App must be running after iMac restarts without SSH intervention | LOW | launchd `RunAtLoad: true` already in plist; plist in `~/Library/LaunchAgents/` activates at GUI user login |
| Production build (compiled JS, not tsx) | Running TypeScript via `tsx` in production wastes memory and adds fragility | LOW | `tsc` build already configured; server targets `packages/server/dist/index.js` |
| Client files served by Express | Single process is simpler than nginx + Express on a home server | LOW | Already implemented in `src/index.ts` — `express.static(clientDist)` + catch-all route for SPA |
| Health check endpoint | Scripts and monitoring need a reliable signal that the server is up | LOW | `/health` endpoint returning `{"status":"ok"}` already exists in `src/index.ts` |
| Structured log output | launchd needs stdout/stderr paths for crash diagnosis | LOW | Already in plist: `minerva-server.log` and `minerva-server-error.log` in `~/Library/Logs/` |

### Differentiators (Competitive Advantage)

Features beyond the baseline that make this deployment setup maintainably good.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| One-command deploy (`./deploy/deploy.sh`) | `git pull && npm run build && restart` in a single command eliminates manual error during updates | LOW | Script already written; needs end-to-end validation with `launchctl kickstart -k` |
| First-install script (`./deploy/setup.sh`) | Reproducible install from scratch without recalling the steps | LOW | Script already written; copies plists to `~/Library/LaunchAgents/`, loads services, health-checks |
| Co-located deploy config (`deploy/` dir) | Config lives with the code; no hunting across system directories | LOW | Already the pattern — all 4 deploy files in `deploy/` |
| `--env-file` native env loading | Eliminates the `dotenv` package; Node 20.6+ natively parses `.env` | LOW | Already used in plist and `start:prod` script; confirmed Node 20.6+ feature (HIGH confidence) |
| Backup plist uses compiled JS | Backup plist currently uses `tsx` (dev transpiler) — should use compiled `dist/` output | LOW | `com.minerva.backup.plist` references `run-backup.ts` via tsx; should reference `dist/backup/run-backup.js` post-build |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| PM2 for process management | Popular Node.js process manager; familiar tooling | Adds an npm dependency and config layer redundant to launchd. Mixing PM2 and launchd creates two competing restart systems. macOS has launchd natively. | launchd alone — already decided in PROJECT.md |
| nginx as reverse proxy | "Standard" production pattern; useful for SSL termination | Adds a second process and install step for a single-user home server with no public traffic. Express alone handles static + API. | `express.static()` already serving client files |
| Docker containerization | Isolation, reproducibility | Overengineered for a single-user home app. Complicates launchd integration and iCloud Drive backup access. No benefit over a direct Node process on a trusted private machine. | Direct Node process managed by launchd |
| Legacy `launchctl load`/`unload` | Widely documented as the way to manage plists | Deprecated in modern macOS. `setup.sh` currently uses it — acceptable but may produce warnings. Current preferred commands are `bootstrap`/`bootout` for install/uninstall. | `launchctl bootstrap gui/$(id -u)` for install; `launchctl kickstart -k` for restart (already in deploy.sh) |
| Git hooks for auto-deploy | Automatic deploy on every push | Adds hidden complexity and risk of silent failures. For a single dev on a home server, an explicit `./deploy/deploy.sh` is safer and more debuggable. | Explicit deploy script run when desired |
| Retry loop in health check | Verify server started reliably | `sleep 3` + single curl check is adequate. A retry loop adds 20+ lines for no practical benefit when startup time is consistent on local hardware. | Single check after fixed wait (already in setup.sh) |

---

## Feature Dependencies

```
Production build (tsc + vite build)
    required by --> Express static file serving (client/dist must exist)
    required by --> launchd server plist (points to server/dist/index.js)
    required by --> deploy.sh (builds before restart)
    required by --> Backup plist fix (needs dist/backup/run-backup.js)

Health check endpoint (already exists in src/index.ts)
    used by --> setup.sh verification step (curl localhost:3001/health)

launchd plist installed to ~/Library/LaunchAgents/
    required by --> auto-restart on crash
    required by --> boot startup
    managed by --> setup.sh (first install, copies + loads)
    restarted by --> deploy.sh (launchctl kickstart -k)
```

### Dependency Notes

- **Production build must run before launchd service first loads:** The server plist
  references `packages/server/dist/index.js`. If the build has not run, launchd will
  fail to start. `setup.sh` already runs `npm run build` before `launchctl load`.

- **Backup plist fix depends on successful server build:** The compiled backup script
  at `dist/backup/run-backup.js` is only present after `npm run build` runs. The backup
  plist should not reference `tsx` or `.ts` source files in production.

- **deploy.sh depends on setup.sh having run first:** `deploy.sh` uses `launchctl
  kickstart` to restart an existing service. This only works if the plist was previously
  loaded by `setup.sh`. deploy.sh is a day-2 operation; setup.sh is day-1.

---

## MVP Definition

### Launch With (v2.1 — this milestone)

- [x] Production TypeScript build confirmed working (`tsc` server + `vite build` client)
- [x] Express serves compiled client dist at root `/` — single process, no nginx
- [x] launchd server plist with `KeepAlive`, `RunAtLoad`, `ThrottleInterval`, log paths
- [ ] Backup plist fixed to run compiled JS (not tsx in production)
- [x] `setup.sh` — first-install: build, copy plists, load services, health-check
- [x] `deploy.sh` — update: git pull, build, `launchctl kickstart -k`
- [ ] All scripts validated end-to-end on the actual iMac

### Add After Validation (v2.1+)

- [ ] Log rotation — `~/Library/Logs/minerva-server.log` will grow indefinitely.
  macOS `newsyslog` can be configured for rotation. Low urgency for a single-user
  app with low traffic but worth adding if logs grow unwieldy.

### Future Consideration (v3+)

- [ ] SSL/TLS termination — only relevant if the app is exposed outside the home
  network. Not applicable for local-only LAN access.
- [ ] Automated health alerts — requires an external notification service. Out of
  scope per PROJECT.md; in-app sync status indicator is sufficient.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Auto-restart on crash (launchd KeepAlive) | HIGH | LOW — plist already written | P1 |
| Boot startup (RunAtLoad) | HIGH | LOW — plist already written | P1 |
| Production build pipeline | HIGH | LOW — already configured | P1 |
| Express serves client static files | HIGH | LOW — already implemented | P1 |
| setup.sh first-install script | HIGH | LOW — written, needs validation | P1 |
| deploy.sh one-command update | HIGH | LOW — written, needs validation | P1 |
| Fix backup plist to use compiled JS | MEDIUM | LOW | P1 |
| Health check verification in setup.sh | MEDIUM | LOW — already in script | P1 |
| Log rotation | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Implementation Notes

### launchd Agent vs Daemon

LaunchAgents (in `~/Library/LaunchAgents/`) run as the logged-in GUI user. This is
correct for Minerva — the process needs access to iCloud Drive for backups and runs
under the user's environment. LaunchDaemons (in `/Library/LaunchDaemons/`) run as root
at system boot; unnecessary and inappropriate here. (HIGH confidence — Apple developer docs)

### launchctl Command Versions

Modern macOS (12+) prefers newer subcommands over the legacy `load`/`unload`:

- First install: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.minerva.server.plist`
- Uninstall: `launchctl bootout gui/$(id -u)/com.minerva.server`
- Restart: `launchctl kickstart -k gui/$(id -u)/com.minerva.server`

The current `setup.sh` uses the legacy `launchctl load` — functional but may emit
deprecation warnings on recent macOS. The `deploy.sh` already uses the modern
`launchctl kickstart -k` form. (MEDIUM confidence — community sources; Apple official
docs on subcommand specifics are sparse)

### Node Binary Path in Plist

The server plist hardcodes `/usr/local/bin/node`. On Apple Silicon Macs with Homebrew,
node lives at `/opt/homebrew/bin/node`. This path needs to match the actual binary
location on the target iMac. The `setup.sh` could use `which node` to detect the path
dynamically, or the plist can be machine-specific. (MEDIUM confidence — common community
pitfall documented across multiple sources)

### ThrottleInterval

`ThrottleInterval: 10` in the server plist sets a 10-second minimum between restart
attempts. This prevents restart storms if the app crashes on startup (for example,
due to a missing `.env` file). Good default — leave it in place. (HIGH confidence —
launchd.info documentation)

### SIGTERM Handling

`src/index.ts` already handles `SIGTERM` by stopping both schedulers and closing the
Express server gracefully. launchd sends `SIGTERM` before `SIGKILL` when stopping or
restarting a service. This is correct and complete — no changes needed. (HIGH confidence
— Express docs + launchd behavior documentation)

### Backup Plist tsx Dependency

The existing `com.minerva.backup.plist` invokes:
```
/usr/local/bin/node --import tsx /path/to/run-backup.ts
```
`tsx` is a devDependency in `packages/server`. Running TypeScript source files in
production via tsx adds `tsx` as a runtime dependency and bypasses the type-checking
that `tsc` provides. After the v2.1 build produces `packages/server/dist/`, the backup
plist should reference the compiled output directly. (HIGH confidence — observed in
codebase)

---

## Sources

- [launchd.info — comprehensive launchd reference](https://www.launchd.info/)
- [Apple Developer: Creating Launch Daemons and Agents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- [launchctl new subcommand basics — Alan Siu's Blog](https://www.alansiu.net/2023/11/15/launchctl-new-subcommand-basics-for-macos/)
- [Node.js native --env-file support (Node 20.6+)](https://pawelgrzybek.com/node-js-with-native-support-for-env-files-you-may-not-need-dotenv-anymore/)
- [Vite — Building for Production](https://vite.dev/guide/build)
- [Express — Serving Static Files](https://expressjs.com/en/starter/static-files.html)
- [Launch a Node script at boot on macOS — DEV Community](https://dev.to/mjehanno/launch-a-node-script-at-boot-on-macos-1dnd)
- Existing codebase: `deploy/` directory, `packages/server/src/index.ts`, `packages/server/package.json`, `package.json`

---
*Feature research for: Node.js deployment hardening on macOS (Minerva Money v2.1)*
*Researched: 2026-03-23*
