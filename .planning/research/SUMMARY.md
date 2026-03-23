# Project Research Summary

**Project:** Minerva Money v2.1 — Deployment Hardening
**Domain:** macOS home server — launchd process management, production build pipeline, deploy scripts
**Researched:** 2026-03-23
**Confidence:** HIGH

## Executive Summary

Minerva Money v2.1 is a deployment hardening milestone, not a feature milestone. The application (React + Tailwind, Express + tRPC, SQLite, Claude Agent SDK) is fully functional. The goal is making it a reliable, self-healing home server on a personal iMac: it must survive crashes, restart after reboots, and be updatable via a single command. The good news is that all four deploy artifacts already exist in the `deploy/` directory and `packages/server/src/index.ts` already has static file serving and a SIGTERM handler. This milestone is about fixing three known issues in that scaffolding and validating the end-to-end flow.

The recommended approach uses macOS launchd natively — no PM2, no Docker, no nginx. launchd with `KeepAlive`, `RunAtLoad`, and `ThrottleInterval: 10` handles crash recovery and boot startup. Express serves both the Vite-built client and the tRPC API from a single Node process on port 3001. Node 20's native `--env-file` flag eliminates the dotenv dependency. The entire deploy surface is three bash scripts and two plist files — all version-controlled in `deploy/`.

Three bugs in the current scaffolding are blocking a working deployment. First, both plists hardcode `/usr/local/bin/node` which does not exist on this machine (nvm puts Node at `~/.nvm/versions/node/v20.16.0/bin/node`). Second, the backup plist references a TypeScript source file via `tsx` rather than the compiled `dist/backup/run-backup.js`. Third, `setup.sh` uses the deprecated `launchctl load` command — the modern form is `launchctl bootstrap gui/$(id -u)`. Fixing these three issues and validating the pipeline end-to-end on the iMac constitutes the complete v2.1 scope.

## Key Findings

### Recommended Stack

No new dependencies are required for v2.1. The entire deployment stack runs on macOS built-ins (launchd), Node 20 built-ins (`--env-file`), and existing packages (Express, TypeScript, Vite). This is intentional — every added process manager or reverse proxy would be redundant given the single-user home server context.

**Core technologies:**
- **launchd** — crash recovery and boot startup — native macOS daemon manager, zero dependencies, already configured with correct KeepAlive and ThrottleInterval settings
- **Express `express.static`** — serves Vite build output — already implemented in `server/src/index.ts`, single process eliminates nginx coordination
- **Node 20 `--env-file`** — secret loading — native flag already used in plist and `start:prod`, no dotenv package needed
- **tsc** (TypeScript 5.7) — server compilation to `dist/` — already configured with `module: Node16`; plist must point at compiled output
- **Vite 6** — client bundling to `packages/client/dist/` — already configured; Express path resolution verified correct

**Critical version note:** Node 20 enters Maintenance LTS and EOL in April 2026. Node 22 is Active LTS. Plan upgrade post-v2.1; no code changes required.

### Expected Features

All features for v2.1 are either already implemented or are targeted fixes and validations of existing scaffolding.

**Must have (table stakes):**
- Auto-restart on crash (launchd `KeepAlive`) — home server must survive failures without intervention
- Boot startup (`RunAtLoad: true`) — must be running after iMac restarts without SSH
- Production build pipeline (tsc + vite) — running TypeScript via tsx in production is fragile; compiled JS is required
- Express serves client static files — already implemented, single-process simplicity
- Health check endpoint (`/health`) — already exists in `src/index.ts`
- Structured log output — already configured in plist to `~/Library/Logs/`

**Should have (differentiators for this deployment):**
- One-command deploy (`./deploy/deploy.sh`) — eliminates manual error during updates
- First-install script (`./deploy/setup.sh`) — reproducible install from scratch
- Backup plist running compiled JS instead of tsx source
- Build output verification before service restart in `deploy.sh`
- `.env` pre-flight check in `setup.sh`

**Defer (v2.1+):**
- Log rotation via `newsyslog` — low urgency for single-user low-traffic app
- SSL/TLS termination — only relevant if exposed outside home network, not applicable for LAN-only use

### Architecture Approach

The production architecture is a single Node.js Express process managed by launchd, serving both the compiled React SPA and the tRPC API on port 3001. A separate launchd periodic service handles scheduled backups by opening the SQLite database directly (safe via WAL mode) and exiting cleanly. The two services communicate only through the database file; there is no IPC between them.

**Major components:**
1. **`deploy/com.minerva.server.plist`** — launchd service: crash recovery, boot startup, env loading via `--env-file` — NEEDS FIX (node binary path, KeepAlive dict form)
2. **`deploy/com.minerva.backup.plist`** — launchd periodic backup (every 6 hours) — NEEDS FIX (node path + tsx source → compiled JS)
3. **`deploy/setup.sh`** — first-install: copy plists, bootstrap services, health check — NEEDS FIX (deprecated `launchctl load`, missing `.env` pre-flight)
4. **`deploy/deploy.sh`** — one-command update: git pull → install → build → kickstart — VERIFY ONLY (already correct, add build output verification)
5. **`packages/server/src/index.ts`** — Express static serving + SIGTERM handler — VERIFY ONLY (already implemented, confirm `server.close()` callback is awaited)

### Critical Pitfalls

1. **Wrong Node binary path in plist** — Both plists use `/usr/local/bin/node` which does not exist on this nvm-managed machine. Hardcode the absolute nvm path (`~/.nvm/versions/node/v20.16.0/bin/node`) in both plists and add a `which node` validation check to `setup.sh`. Warning signs: `launchctl list | grep minerva` shows non-zero exit code; `minerva-server-error.log` contains `No such file or directory`.

2. **`KeepAlive: true` bare form causes restart on intentional stop** — The bare `true` form restarts the server even during planned deploys, potentially booting from a stale build mid-restart. Use the dict form `{SuccessfulExit: false}` so launchd only restarts on crashes, not clean exits. Keep `ThrottleInterval: 10` as a safety net against crash loops.

3. **Deprecated `launchctl load` in `setup.sh`** — Deprecated since macOS Ventura; may break silently on future macOS updates. Replace with `launchctl bootstrap gui/$(id -u) <plist-path>`. The `deploy.sh` already correctly uses `launchctl kickstart -k`.

4. **Backup plist running tsx source** — `com.minerva.backup.plist` invokes TypeScript source via tsx. launchd strips PATH so tsx from `node_modules/.bin/` is not resolvable. Point the backup plist at `packages/server/dist/backup/run-backup.js` instead.

5. **Missing `.env` pre-flight in `setup.sh`** — If `.env` does not exist at project root when the service loads, it starts but fails silently at runtime (sync and agent calls return auth errors with no startup indication). Add `[ -f .env ] || { echo "ERROR: .env not found"; exit 1; }` at the top of `setup.sh`.

## Implications for Roadmap

Based on research, the v2.1 work sequences into four phases that mirror build and runtime dependencies.

### Phase 1: Fix Plist Files

**Rationale:** All other components depend on correct plists. The Node binary path and backup entry point must be correct before any integration testing is possible. These are pure XML file edits with no code changes.
**Delivers:** Valid launchd service definitions that will actually start on this machine.
**Addresses:** Auto-restart on crash, boot startup, backup plist running compiled JS.
**Avoids:** Wrong Node binary path (Pitfall 1), backup tsx invocation (Pitfall 4), bare KeepAlive restart loop (Pitfall 2).

### Phase 2: Fix setup.sh

**Rationale:** `setup.sh` is the entry point for first-time installation. Updating it to use modern launchctl commands and add pre-flight checks makes it safe to run. This is a bash-only change that does not require the app to be running.
**Delivers:** Reliable first-install flow with `.env` validation and modern `launchctl bootstrap` API.
**Addresses:** First-install reproducibility, `.env` pre-flight.
**Avoids:** Deprecated launchctl load (Pitfall 3/6), missing `.env` (Pitfall 8).

### Phase 3: Harden deploy.sh

**Rationale:** Deploy script hardening (per-workspace build verification, graceful shutdown, health check with retry) requires the plists and setup.sh to be correct first — you cannot validate deploy behavior until installation works.
**Delivers:** Safe, verified deploy pipeline that will not restart against a broken build.
**Addresses:** One-command deploy differentiator, build output verification.
**Avoids:** No build verification before restart (Pitfall 7), SIGTERM not awaited (Pitfall 3), health check timing race (Pitfall noted in technical debt).

### Phase 4: End-to-End Validation on iMac

**Rationale:** Everything before this is editing files. The real validation is running `setup.sh` fresh on the actual iMac, rebooting, intentionally crashing the server, deploying an update, and verifying health endpoint and UI all respond correctly. Architecture research documented the exact verification steps.
**Delivers:** Confidence that the deployment is production-ready against the "Looks Done But Isn't" checklist.
**Addresses:** All table-stakes features validated end-to-end.
**Avoids:** All undiscovered environment-specific issues (Apple Silicon vs Intel node path, iMac-specific permissions).

### Phase Ordering Rationale

- Plists before scripts: `setup.sh` copies plists and `deploy.sh` restarts the service they define — broken plists make script testing impossible.
- Scripts before validation: validation executes the scripts against the physical iMac.
- Validation last: requires the physical iMac and cannot be performed in the development environment.
- No phase requires new dependencies or architectural decisions — all work is targeted fixes to existing artifacts.

### Research Flags

Phases with standard patterns (no additional research needed during planning):
- **Phase 1 (Fix Plists):** Pure XML edits with verified correct values already documented in research files.
- **Phase 2 (Fix setup.sh):** Bash scripting with verified launchctl commands; all commands documented with exact syntax.
- **Phase 3 (Harden deploy.sh):** Well-documented patterns; graceful shutdown via `server.close()` callback is standard Express; per-workspace builds are straightforward npm.
- **Phase 4 (Validation):** Operational verification, not development — no research needed.

No phase requires `/gsd:research-phase` during planning. All necessary information is captured in the four research files with HIGH confidence.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies; all technologies already in use and working. Critical version notes (nvm Node path, launchctl API) verified against codebase and official docs. |
| Features | HIGH | Feature set is entirely scoped to fixing and validating existing scaffolding. No ambiguity about what needs to be done or deferred. |
| Architecture | HIGH | All path relationships verified by direct codebase inspection. Production data flow documented end-to-end. Anti-patterns identified with specific file/line evidence. |
| Pitfalls | HIGH | All critical pitfalls verified against actual files in the repo. Each pitfall has a concrete fix, warning signs, and a recovery strategy. No speculative pitfalls. |

**Overall confidence:** HIGH

### Gaps to Address

- **Node binary path must be verified on the iMac before writing plists:** Research confirms the nvm path is `~/.nvm/versions/node/v20.16.0/bin/node` based on codebase evidence, but the iMac may have a different Node version. Run `which node` on the target machine before updating plist files.

- **Apple Silicon vs Intel:** Both plists currently hardcode `/usr/local/bin/node` (Homebrew Intel path). If the iMac is Apple Silicon with Homebrew, the path is `/opt/homebrew/bin/node`. Since the machine uses nvm, the nvm absolute path is correct regardless — but verify with `which node` rather than assuming.

- **`server.close()` callback wiring:** PITFALLS.md flags that the SIGTERM handler may not await `server.close()` before calling `process.exit()`. This needs a code-level read of `packages/server/src/index.ts` during Phase 3 to confirm the callback is properly awaited.

## Sources

### Primary (HIGH confidence)
- Codebase inspection — `deploy/com.minerva.server.plist`, `deploy/setup.sh`, `deploy/deploy.sh`, `packages/server/src/index.ts`, `package.json`, `tsconfig.base.json`
- [launchd.info](https://www.launchd.info/) — KeepAlive dict form, ThrottleInterval, WorkingDirectory, bootstrap/bootout commands
- [Apple Developer: Creating Launch Daemons and Agents](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
- [Node.js 20.6.0 release — built-in .env support](https://nodejs.org/en/blog/release/v20.6.0)
- [Express.js: Health Checks and Graceful Shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html)
- [Vite Build Options — outDir default](https://vite.dev/config/build-options)

### Secondary (MEDIUM confidence)
- [Eclectic Light: kickstarting and tearing down with launchctl](https://eclecticlight.co/2019/08/27/kickstarting-and-tearing-down-with-launchctl/) — kickstart vs load deprecation rationale
- [Alan Siu's Blog: launchctl new subcommand basics](https://www.alansiu.net/2023/11/15/launchctl-new-subcommand-basics-for-macos/)
- [MacRumors: launchctl legacy subcommands deprecated](https://forums.macrumors.com/threads/launchctl-legacy-subcommands-deprecated.2431281/) — Ventura deprecation confirmation
- [Node.js 22 vs 20 upgrade guide — PkgPulse](https://www.pkgpulse.com/blog/nodejs-22-vs-nodejs-20-upgrade-guide) — Node 20 EOL timeline
- [Medium: Where is my PATH, launchD?](https://lucaspin.medium.com/where-is-my-path-launchd-fc3fc5449864) — PATH stripping behavior

---
*Research completed: 2026-03-23*
*Ready for roadmap: yes*
