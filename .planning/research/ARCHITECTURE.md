# Architecture Research

**Domain:** Deployment hardening — launchd service, static file serving, deploy scripts for Express + Vite + SQLite monorepo on macOS
**Researched:** 2026-03-23
**Confidence:** HIGH (all findings verified against actual codebase and file system)

> NOTE: This file supersedes the v2.0 Agent SDK architecture document. It focuses exclusively on v2.1 deployment hardening. The v2.0 architecture is already implemented and unchanged.

---

## Standard Architecture

### System Overview (Production, Post-v2.1)

```
┌─────────────────────────────────────────────────────────────┐
│                    launchd (macOS init system)               │
│  ┌───────────────────────────┐  ┌────────────────────────┐  │
│  │  com.minerva.server       │  │  com.minerva.backup    │  │
│  │  KeepAlive: true          │  │  StartInterval: 21600  │  │
│  │  RunAtLoad: true          │  │  RunAtLoad: true       │  │
│  │  ThrottleInterval: 10s    │  └──────────┬─────────────┘  │
│  └──────────────┬────────────┘             │                 │
└─────────────────┼────────────────────────  │  ───────────────┘
                  │ spawns                   │ spawns
                  ▼                          ▼
┌─────────────────────────────┐   ┌─────────────────────────┐
│  Node.js Express Process    │   │  Node.js Backup Process  │
│  (packages/server/dist/     │   │  (packages/server/dist/  │
│   index.js)                 │   │   backup/run-backup.js)  │
│                             │   │                          │
│  PORT 3001                  │   │  Opens DB directly       │
│                             │   │  Writes to iCloud Drive  │
│  /trpc/*   → tRPC router    │   │  Exits cleanly           │
│  /health   → status check   │   └─────────────────────────┘
│  /*        → static files   │
│             (client/dist/)  │             │
│                             │             ▼
│  Schedulers (in-process):   │   ~/minerva-money/data/
│    sync (croner)            │   minerva.db  ←────────────┐
│    budget (croner)          │                            │
│                             │                            │
│  Agent SDK (in-process)     │                            │
│    → Anthropic API          │                            │
└─────────────────┬───────────┘                            │
                  │ reads/writes                            │
                  └────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | New vs Modified |
|-----------|----------------|-----------------|
| `deploy/com.minerva.server.plist` | launchd service definition — crash recovery, boot startup, env loading | MODIFY (fix node path) |
| `deploy/com.minerva.backup.plist` | launchd backup scheduler — every 6 hours | MODIFY (fix paths for production) |
| `deploy/setup.sh` | First-time install — copy plists, load services, verify health | MODIFY (use modern launchctl commands) |
| `deploy/deploy.sh` | One-command update — pull, install, build, restart | VERIFY (already correct) |
| `packages/server/src/index.ts` | Express static file serving, SIGTERM handler | VERIFY (already implemented) |

---

## Recommended Project Structure

```
minverva-money/
├── deploy/                          # All deployment config (co-located)
│   ├── com.minerva.server.plist     # launchd server service
│   ├── com.minerva.backup.plist     # launchd backup service
│   ├── setup.sh                     # First-time install script
│   └── deploy.sh                    # Ongoing deploy script
├── packages/
│   ├── server/
│   │   ├── dist/                    # Compiled JS (tsc output) — served by launchd
│   │   │   ├── index.js             # Entry point for launchd
│   │   │   ├── backup/
│   │   │   │   └── run-backup.js    # Entry point for backup plist
│   │   │   └── db/
│   │   │       └── ...
│   │   ├── migrations/              # SQL files (NOT compiled — referenced at runtime)
│   │   │   └── *.sql
│   │   └── src/
│   │       └── index.ts             # Static file serving already wired
│   └── client/
│       └── dist/                    # Vite build output — served by Express
│           ├── index.html
│           └── assets/
└── ~/minerva-money/data/
    └── minerva.db                   # SQLite DB (outside repo)
```

### Structure Rationale

- **`deploy/` at root:** All deployment artifacts in one place, version-controlled, no scattered config
- **`packages/server/migrations/` outside `src/`:** SQL files are not TypeScript — `tsc` does not copy them. The path `../../migrations` from `dist/db/` correctly resolves to `packages/server/migrations/` at runtime (verified by path arithmetic)
- **`packages/client/dist/` as static root:** Express uses `path.resolve(__dirname, '../../client/dist')` where `__dirname` is `packages/server/dist/` at runtime — resolves correctly to `packages/client/dist/`

---

## Architectural Patterns

### Pattern 1: Express Serving Static Files (Already Implemented)

**What:** In production (`NODE_ENV !== 'test'`), Express serves the Vite-built React app as static files, with a catch-all that serves `index.html` for client-side routing. tRPC requests go to `/trpc/*` before the catch-all, so API and UI share port 3001.

**When to use:** Single-process deployment — avoids running nginx + Express separately. Perfect for single-user home server.

**Trade-offs:** Simple to operate. The static file path is computed at startup once; if client dist is missing, the server starts anyway but 404s on all UI routes.

```typescript
// packages/server/src/index.ts (already in place)
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});
```

**Build dependency:** Client must be built before server starts in production. `npm run build` runs `--workspaces` which builds both packages (client first due to tsc project references on shared).

### Pattern 2: launchd KeepAlive for Crash Recovery

**What:** launchd's `KeepAlive: true` automatically restarts the process after any exit. `ThrottleInterval: 10` enforces a 10-second minimum between restarts, preventing rapid crash loops from hammering the CPU.

**When to use:** Any long-running service on macOS that must survive crashes and boot automatically.

**Trade-offs:** `ThrottleInterval` means there is a 10-second gap in availability after a crash. Acceptable for personal use. `RunAtLoad: true` starts the service immediately when `launchctl bootstrap` is called (first time or after reboot).

```xml
<!-- deploy/com.minerva.server.plist (pattern — not exact fix) -->
<key>KeepAlive</key><true/>
<key>RunAtLoad</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
```

### Pattern 3: Node --env-file for Secret Loading (No dotenv Dependency)

**What:** Node 20 natively supports `--env-file=.env` as a process flag. The plist passes it as a `ProgramArguments` entry before the script path.

**When to use:** Any Node 20+ process that needs `.env` file loading without adding `dotenv` as a runtime dependency.

**Trade-offs:** Requires Node 20+. Only reads the specified file — no cascade (`.env.local` etc.). Works correctly with launchd since `WorkingDirectory` is set to the repo root where `.env` lives.

```xml
<key>ProgramArguments</key>
<array>
  <string>/path/to/node</string>
  <string>--env-file=.env</string>
  <string>packages/server/dist/index.js</string>
</array>
<key>WorkingDirectory</key>
<string>/Users/seanspade/Documents/Source/minverva-money</string>
```

### Pattern 4: Separate Long-Lived vs Periodic launchd Services

**What:** The server uses `KeepAlive: true` (perpetual). The backup uses `StartInterval: 21600` (periodic, exits after each run). These are fundamentally different service types in launchd.

**When to use:** This split is already the correct design — do not merge them into one process. The backup process opens the SQLite database directly (independent connection), performs the backup, then exits. This is safe because the server keeps WAL mode enabled, allowing concurrent readers.

**Trade-offs:** Two plist files to manage. The backup process cannot communicate with the server's in-process backup scheduler — they are completely independent. This is intentional and correct: the plist backup is the scheduled backup; the server's in-process backup fires post-sync as a bonus.

---

## Data Flow

### Production Startup Flow

```
macOS boot
  → launchd reads ~/Library/LaunchAgents/com.minerva.server.plist
  → spawns: node --env-file=.env packages/server/dist/index.js
            (WorkingDirectory = repo root)
  → index.js creates DB (~/minerva-money/data/minerva.db)
  → runs migrations (packages/server/migrations/*.sql)
  → mounts tRPC middleware at /trpc
  → serves client/dist/ as static files
  → starts sync scheduler (croner)
  → starts budget scheduler (croner)
  → listens on port 3001
```

### Deploy Flow

```
developer: ./deploy/deploy.sh
  → git pull origin main
  → npm install (workspace — all packages)
  → npm run build (tsc for server, vite for client)
  → launchctl kickstart -k "gui/$(id -u)/com.minerva.server"
     (kickstart -k = kill running instance + restart with new binary)
  → server reloads, picks up new packages/server/dist/index.js
  → new packages/client/dist/ already in place (served on next request)
```

### Request Flow (Production)

```
Browser request
  ↓
port 3001 (Express)
  ├── /trpc/*  → tRPC middleware → router → service layer → SQLite
  ├── /health  → { status: 'ok' }
  └── /*       → express.static(client/dist/)
                  → SPA index.html (catch-all for client routing)
```

### SIGTERM Flow (Graceful Shutdown)

```
launchctl kickstart -k (or OS shutdown)
  → SIGTERM sent to Express process
  → stopSyncScheduler() (croner)
  → stopBudgetScheduler() (croner)
  → server.close() (stops accepting new connections)
  → process exits
  → launchd restarts (if KeepAlive) or leaves stopped (if shutdown)
```

---

## Scaling Considerations

This is a single-user home server app. Scaling is not a concern. These notes exist only to explain why the architecture is appropriate at this scale and what would break if it were not.

| Concern | Single User (Current) | Notes |
|---------|----------------------|-------|
| Static file serving | Express is adequate | nginx would be overkill; no CDN needed |
| Process management | launchd is sufficient | PM2/Docker add complexity with no benefit |
| Database concurrency | WAL mode handles it | Backup + server can read simultaneously |
| Port conflicts | Port 3001 is fixed | No load balancer needed |

---

## Anti-Patterns

### Anti-Pattern 1: Using /usr/local/bin/node in Plist

**What:** The plist hardcodes `/usr/local/bin/node` as the Node binary path.

**Why it's wrong:** This machine uses nvm. The actual binary is at `/Users/seanspade/.nvm/versions/node/v20.16.0/bin/node`. `/usr/local/bin/node` does not exist. The service will fail to start with a "program not found" error.

**Do this instead:** Use the absolute nvm path. Alternatively, use a wrapper shell script that sources `.nvm/nvm.sh` before exec'ing node. The simplest fix: hardcode the nvm path directly in the plist since this is a single-machine deployment.

### Anti-Pattern 2: Backup Plist Running TypeScript via tsx

**What:** The current backup plist uses `node --import tsx packages/server/src/backup/run-backup.ts`.

**Why it's wrong:** (1) launchd does not inherit the user's `PATH`, so `tsx` from `node_modules/.bin/` is not resolvable. (2) Running TypeScript source in production bypasses the compiled output. (3) The transpilation overhead adds latency to every scheduled backup.

**Do this instead:** Point the backup plist at the compiled output: `packages/server/dist/backup/run-backup.js`. The `tsc` build already compiles this file. The plist should use the same compiled-JS pattern as the server plist.

### Anti-Pattern 3: Using `launchctl load` in setup.sh

**What:** `setup.sh` uses `launchctl load ~/Library/LaunchAgents/com.minerva.server.plist`.

**Why it's wrong:** `launchctl load` is deprecated on macOS 10.10+. On modern macOS it still works but prints deprecation warnings to stderr. More importantly, `launchctl load` only loads — it does not start the service immediately if `RunAtLoad: false`. The modern command is `launchctl bootstrap gui/$(id -u) <plist-path>`.

**Do this instead:** Use `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.minerva.server.plist`. For re-loading an already-bootstrapped service use `launchctl kickstart gui/$(id -u)/com.minerva.server`. The `deploy.sh` already correctly uses `kickstart -k`.

### Anti-Pattern 4: Building Client After Server Starts

**What:** Deploying without running the full build, or running `npm run start:prod` before `npm run build`.

**Why it's wrong:** Express statically serves `packages/client/dist/`. If that directory is stale or absent, the UI silently serves old files or 404s. The API continues working but the UI is wrong or missing.

**Do this instead:** Always run `npm run build` (which builds both workspaces) before restarting the server. The `deploy.sh` script enforces this order: pull → install → build → restart.

---

## Integration Points

### New Components vs Existing (v2.1 Scope Only)

| Component | Status | Change Required |
|-----------|--------|-----------------|
| `packages/server/src/index.ts` | Already has static serving + SIGTERM | Verify only — no changes needed |
| `deploy/com.minerva.server.plist` | Exists but broken (wrong node path) | Fix: replace `/usr/local/bin/node` with nvm path |
| `deploy/com.minerva.backup.plist` | Exists but uses tsx source path | Fix: point to `dist/backup/run-backup.js` |
| `deploy/setup.sh` | Exists but uses deprecated `launchctl load` | Fix: use `launchctl bootstrap` |
| `deploy/deploy.sh` | Exists and correct | Verify only |

### Path Relationships (Verified)

| From | Path | Resolves To |
|------|------|-------------|
| `dist/db/connection.js` | `../../migrations` | `packages/server/migrations/` (correct) |
| `dist/index.js` (__dirname) | `../../client/dist` | `packages/client/dist/` (correct) |
| plist WorkingDirectory | `--env-file=.env` | repo root `.env` (correct) |
| plist (server) entry point | `packages/server/dist/index.js` | compiled Express server (correct) |
| plist (backup) entry point | currently `src/backup/run-backup.ts` | WRONG — fix to `dist/backup/run-backup.js` |
| plist (both) node binary | `/usr/local/bin/node` | WRONG — does not exist on this machine |

### launchd Service Communication

The two services do NOT communicate. They interact only through the SQLite database file:

| Service | DB Access | Mode |
|---------|-----------|------|
| `com.minerva.server` | Long-lived connection, WAL mode | Read + write |
| `com.minerva.backup` | Opens fresh connection per run | Read only (backup API) |

SQLite WAL mode allows simultaneous readers + one writer. The backup uses `db.backup()` which is a read-only snapshot — safe to run while the server is writing.

### Log Files (launchd stdout/stderr redirect)

| Service | Stdout | Stderr |
|---------|--------|--------|
| `com.minerva.server` | `~/Library/Logs/minerva-server.log` | `~/Library/Logs/minerva-server-error.log` |
| `com.minerva.backup` | `~/Library/Logs/minerva-backup.log` | `~/Library/Logs/minerva-backup.log` |

---

## Build Order (Considering Dependencies)

```
Phase 1: Verify index.ts (no changes expected)
  └── Confirm static serving + SIGTERM handler work as-is
  └── Confirm build output paths are correct

Phase 2: Fix plist files
  1. com.minerva.server.plist — fix node binary path
  2. com.minerva.backup.plist — fix node binary path + switch to dist/backup/run-backup.js

Phase 3: Fix setup.sh
  3. Replace `launchctl load` with `launchctl bootstrap gui/$(id -u)`
  4. (verify) deploy.sh already uses `launchctl kickstart -k` — no change needed

Phase 4: Integration test
  5. npm run build (both workspaces)
  6. ./deploy/setup.sh (copies plists, bootstraps services, health check)
  7. Verify http://localhost:3001/health returns {"status":"ok"}
  8. Verify http://localhost:3001/ serves the React app
  9. Verify launchctl list | grep minerva shows both services running
```

---

## Sources

- Codebase inspection (HIGH confidence) — all path relationships and existing implementations verified by direct file reads
- macOS launchd documentation (MEDIUM confidence) — `launchctl bootstrap` vs `load` distinction confirmed by known macOS 10.10+ deprecation
- Node.js 20 `--env-file` flag — confirmed by `node --version` showing v20.16.0 (HIGH confidence)
- nvm binary path — confirmed by `which node` on target machine (HIGH confidence)
- SQLite WAL concurrent read safety — documented better-sqlite3 behavior (HIGH confidence)

---

*Architecture research for: v2.1 Deployment Hardening (launchd + static serving + deploy scripts)*
*Researched: 2026-03-23*
