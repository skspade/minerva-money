# Stack Research

**Domain:** Deployment hardening — macOS launchd process management, production static file serving, deploy scripts
**Researched:** 2026-03-23
**Confidence:** HIGH

## Context: Subsequent Milestone

This is a subsequent milestone. The core stack (React + Tailwind, Express + tRPC, SQLite, TanStack Query, Claude Agent SDK) is validated and unchanged. The deployment infrastructure is also substantially pre-built in the `deploy/` directory. This document focuses only on what v2.1 adds or changes.

**Already exists in `deploy/`:**
- `com.minerva.server.plist` — launchd service with KeepAlive + ThrottleInterval: 10 + RunAtLoad
- `com.minerva.backup.plist` — launchd scheduled backup service (reference model for server plist)
- `deploy.sh` — one-command deploy via `git pull && npm install && npm run build && launchctl kickstart -k`
- `setup.sh` — first-run install via `launchctl load` (deprecated command — see critical note below)

**Already exists in `packages/server/src/index.ts`:**
- `express.static` serving `packages/client/dist/`
- SPA fallback: `app.get('*', res.sendFile(index.html))`
- `NODE_ENV !== 'test'` guard for DB initialization

## Recommended Stack

### New Dependencies

None. All capabilities for v2.1 are provided by existing tools and macOS primitives.

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| launchd | macOS built-in | Crash recovery, boot startup, process management | Native macOS daemon manager. Zero dependencies. KeepAlive: true restarts within ~10 seconds of crash. ThrottleInterval: 10 prevents rapid restart loops. Already used for iCloud backup service. |
| Node.js `--env-file` | Node 20.6+ (built-in, already in use) | Load .env without dotenv | Native flag, no extra dependency. Already used in `start:prod` and server plist. One known limitation: does not support multiline values (not relevant for this project). |
| `express.static` | Express 4 (existing) | Serve Vite build output | Already implemented in server/src/index.ts. Single-process eliminates nginx coordination overhead. |
| `tsc` | TypeScript 5.7 (existing) | Compile server to `dist/` | Already configured with `"module": "Node16"` matching Node's ESM resolution algorithm. |
| Vite build | Vite 6 (existing) | Bundle React client to `packages/client/dist/` | Default output path is already what server expects at `../../client/dist`. |

### Supporting Libraries

None required. The entire deployment stack is covered by Node.js built-ins, macOS launchd, and bash scripting.

## Installation

No new packages to install. The production workflow:

```bash
# First-time setup on the iMac
bash deploy/setup.sh

# Every subsequent deploy
bash deploy/deploy.sh
```

Build commands (called by deploy scripts):
```bash
# Server: produces packages/server/dist/index.js
npm run build --workspace=packages/server

# Client: produces packages/client/dist/ (served by Express)
npm run build --workspace=packages/client

# Both at once
npm run build
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| launchd | PM2 | Linux/multi-server deployments. Adds npm dependency that duplicates macOS-native capabilities. |
| launchd | Docker | Cloud/containerized deployments needing isolation. Overkill for a single-user home server. |
| launchd | nohup / screen | Quick experiments only. No crash recovery, no boot startup. |
| Express static + SPA fallback | nginx reverse proxy | High-traffic multi-app servers needing compression and SSL termination at scale. Unnecessary second process for single-user home server. |
| `tsc` | tsup / esbuild | Bundled output useful for libraries or when tree-shaking matters. Server-side Node.js does not benefit meaningfully. tsc is already configured and sufficient. |

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| PM2 | Duplicates launchd on macOS; adds npm dependency and a separate daemon to manage | launchd KeepAlive: true |
| nginx | Second process requiring separate config. Express handles static files adequately for single-user traffic. | `express.static` already in server/src/index.ts |
| `dotenv` package | Creates two competing env-loading mechanisms alongside `--env-file`. | `--env-file=.env` (already in plist and start:prod) |
| Docker | Container overhead, volume mounts, network complexity — none of which solve a real problem here | launchd service files directly |
| `forever` / `nodemon` (production) | Legacy process managers superseded by launchd on macOS | launchd KeepAlive |

## Critical Implementation Notes

### launchctl Command Deprecation (HIGH confidence)

`launchctl load` and `launchctl unload` are deprecated in macOS Ventura and unreliable in Sequoia. The current `setup.sh` uses `launchctl load` — this needs updating.

**Correct modern commands:**
```bash
# First-time load (replaces: launchctl load ~/Library/LaunchAgents/com.minerva.server.plist)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.minerva.server.plist

# Removal (replaces: launchctl unload ...)
launchctl bootout gui/$(id -u)/com.minerva.server

# Restart running service — already correct in deploy.sh
launchctl kickstart -k gui/$(id -u)/com.minerva.server
```

The `deploy.sh` already uses `launchctl kickstart -k` which is the current correct API and does not need changing.

### Static File Path Resolution (HIGH confidence)

After `tsc` compiles `packages/server/src/index.ts` to `packages/server/dist/index.js`, the `__dirname` value is `.../packages/server/dist/`. The existing path resolution:

```typescript
const clientDist = path.resolve(__dirname, '../../client/dist');
```

Resolves to `.../packages/client/dist/` — which is exactly where Vite writes its build output. This is correct and requires no changes.

### NODE_ENV in Plist (HIGH confidence)

The server plist sets `NODE_ENV=production` via the `EnvironmentVariables` dict. This is required because `server/src/index.ts` gates all initialization on `process.env.NODE_ENV !== 'test'`. The plist approach (not a shell script export) ensures the variable is always set when launchd starts the process.

### Node Path in Plists (MEDIUM confidence)

The backup plist references `/usr/local/bin/node` (Homebrew Intel path). On Apple Silicon Macs, Homebrew installs to `/opt/homebrew/bin/node`. Verify with `which node` on the target iMac and update both plists if necessary. The server plist also uses `/usr/local/bin/node`.

### Vite Dev Proxy Not Active in Production (HIGH confidence)

The Vite dev server proxy (`/trpc` → `localhost:3001`) runs only during development. In production, Express serves both the Vite static output and the tRPC API from the same process on port 3001. Client tRPC calls go to the same origin — this works because the client's tRPC link is configured with a relative or same-host URL.

### Node 20 EOL (MEDIUM confidence)

Node 20 enters Maintenance LTS and reaches EOL in April 2026. Node 22 is Active LTS since October 2024. The `--env-file` flag behavior is identical between versions. No code changes are required to upgrade; the upgrade is worth planning post-v2.1.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Node 20 `--env-file` | Express 4.21 | No conflicts. Express reads process.env after Node loads it. |
| TypeScript 5.7 (`module: Node16`) | Node 20 ESM | Node16 moduleResolution matches Node's actual ESM algorithm. `.js` extensions required in relative imports — already enforced in the codebase. |
| Vite 6 build output | Express `express.static` | Vite emits hashed asset filenames. Express static middleware serves them correctly. The SPA fallback catches all non-asset routes. |
| launchd `KeepAlive: true` | `ThrottleInterval: 10` | ThrottleInterval prevents restart loops on rapid crashes. 10 seconds is the minimum recommended interval. Already set in server plist. |

## Sources

- [launchd.info Tutorial](https://www.launchd.info/) — KeepAlive, ThrottleInterval, domain-based bootstrap/bootout commands (HIGH confidence)
- [launchd.plist(5) man page](https://keith.github.io/xcode-man-pages/launchd.plist.5.html) — KeepAlive.Crashed, SuccessfulExit, ThrottleInterval key documentation (HIGH confidence)
- [Kickstarting and tearing down with launchctl — Eclectic Light](https://eclecticlight.co/2019/08/27/kickstarting-and-tearing-down-with-launchctl/) — kickstart vs load deprecation rationale (MEDIUM confidence)
- [MacRumors: launchctl legacy subcommands deprecated](https://forums.macrumors.com/threads/launchctl-legacy-subcommands-deprecated.2431281/) — Ventura deprecation confirmation (MEDIUM confidence)
- [Node.js 20.6.0 built-in .env support — Dotenv blog](https://www.dotenv.org/blog/2023/10/28/node-20-6-0-includes-built-in-support-for-env-files.html) — `--env-file` availability and multiline limitation (HIGH confidence)
- [Vite Build Options — vite.dev](https://vite.dev/config/build-options) — default `outDir` is `dist/` (HIGH confidence)
- [Node.js 22 vs 20 — PkgPulse](https://www.pkgpulse.com/blog/nodejs-22-vs-nodejs-20-upgrade-guide) — EOL timeline, Active LTS status (MEDIUM confidence)
- Direct inspection: `deploy/`, `packages/server/src/index.ts`, `package.json`, `tsconfig.base.json` (HIGH confidence)

---
*Stack research for: Minerva Money v2.1 Deployment Hardening*
*Researched: 2026-03-23*
