# Phase 18: Production Build and Directory Layout - Research

**Researched:** 2026-03-23
**Domain:** TypeScript monorepo build pipeline, Express SPA serving, launchd plist configuration
**Confidence:** HIGH

## Summary

Phase 18 addresses production build correctness for a TypeScript monorepo (server, client, shared packages), Express static file serving for the React SPA, environment variable loading via Node 20 `--env-file`, and deployment artifact organization. The codebase is already well-structured: `npm run build` successfully compiles all three packages, Express already serves the client dist with SPA catch-all, and both plists already live in `deploy/`.

The primary issues to fix are: (1) the server plist hardcodes `/usr/local/bin/node` which does not exist on this nvm-managed machine, (2) the backup plist runs TypeScript source via `tsx` instead of compiled JavaScript, (3) the backup plist is missing `--env-file=.env` and `NODE_ENV=production`, and (4) stale test files in `packages/server/dist/` from builds that predate the tsconfig exclude rule.

**Primary recommendation:** Fix plist node paths and backup plist entry point, add a clean step to the build, and verify the full production path end-to-end.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Server builds with `tsc` to `packages/server/dist/`
- Client builds with `vite build` to `packages/client/dist/`
- Root `npm run build` runs `npm run build --workspaces`
- Root `start:prod` script runs `node --env-file=.env packages/server/dist/index.js`
- Express serves `packages/client/dist/` via `express.static()` (already implemented)
- SPA catch-all serves `index.html` for all non-API, non-health routes (already implemented)
- Node 20 native `--env-file=.env` flag, no dotenv dependency
- Both plists fix node binary path from `/usr/local/bin/node` to actual nvm path
- Backup plist switches from tsx source to compiled `packages/server/dist/backup/run-backup.js`
- All deployment config co-located in `deploy/` directory

### Claude's Discretion
- Exact verification approach for confirming build output files exist
- Order of fix application within a single plan
- Whether to add comments to plist XML for maintainability

### Deferred Ideas (OUT OF SCOPE)
- KeepAlive dict form change -- Phase 19
- `launchctl bootstrap` modernization in setup.sh -- Phase 20
- `.env` pre-flight check in setup.sh -- Phase 20
- Build output verification before service restart in deploy.sh -- Phase 20
- Log rotation -- post-v2.1
- SSL/TLS -- out of scope
- End-to-end validation on physical iMac -- Phase 20
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUILD-01 | Server runs from compiled JavaScript (tsc output), not TypeScript source | Build already works: `tsc` outputs to `packages/server/dist/`. Need to clean stale test files from dist and verify `start:prod` works |
| BUILD-02 | Client static files served by Express in production (single process) | Already implemented in `packages/server/src/index.ts` lines 37-41. Static serving + SPA catch-all confirmed working |
| BUILD-03 | SPA catch-all serves index.html for all client-side routes | Already implemented: `app.get('*', ...)` after static middleware and tRPC/health routes |
| BUILD-04 | Environment variables load via Node 20 native `--env-file` flag | `start:prod` script already uses `--env-file=.env`. Server plist already has it. Backup plist needs it added |
| DIR-01 | All deployment config co-located in `deploy/` directory | Already true: `deploy/` contains both plists, setup.sh, deploy.sh. No deployment artifacts elsewhere |
| DIR-02 | Server and backup plists both live in `deploy/` | Already true: both `com.minerva.server.plist` and `com.minerva.backup.plist` are in `deploy/` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.7.0 | Server compilation | Already configured with project references |
| Vite | ^6.0.0 | Client bundling | Already configured with React + Tailwind plugins |
| Express | ^4.21.0 | Static file serving + SPA catch-all | Already implemented |
| Node 20 | v20.16.0 | Runtime with native `--env-file` | Already in use via nvm |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | ^4.19.0 | Dev-only TypeScript execution | Development only, NOT in production plist |

### Alternatives Considered
None -- all decisions are locked by CONTEXT.md.

## Architecture Patterns

### Existing Project Structure (confirmed working)
```
packages/
├── server/
│   ├── src/           # TypeScript source
│   ├── dist/          # tsc output (compiled JS)
│   └── tsconfig.json  # extends base, outDir: dist, excludes tests
├── client/
│   ├── src/           # React source
│   └── dist/          # vite build output (HTML + assets)
├── shared/
│   ├── src/           # Shared types
│   └── dist/          # tsc output
deploy/
├── com.minerva.server.plist
├── com.minerva.backup.plist
├── setup.sh
└── deploy.sh
```

### Pattern 1: ESM with __dirname Computation
**What:** Server uses ESM (`"type": "module"`) and computes `__dirname` via `path.dirname(fileURLToPath(import.meta.url))`
**When to use:** All path resolution in compiled output
**Key detail:** When running from `packages/server/dist/index.js`, `__dirname` resolves to `packages/server/dist/`, so `../../client/dist` correctly reaches `packages/client/dist/`

### Pattern 2: Conditional Static Serving
**What:** Express static file serving and SPA catch-all only activate when `NODE_ENV !== 'test'`
**Why:** Prevents test suite from needing client dist present

### Pattern 3: Build Order via Project References
**What:** Server tsconfig references shared package (`{ "path": "../shared" }`)
**Why:** Ensures shared compiles before server when using `tsc --build`
**Note:** `npm run build --workspaces` runs packages in workspace order which may not respect this. Current setup works because npm workspaces processes dependencies first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Environment variables | Custom .env parser | Node 20 `--env-file` flag | Native, zero dependencies, handles edge cases |
| Process management | Custom daemon scripts | launchd plists | macOS native, handles crashes, boot, logging |

## Common Pitfalls

### Pitfall 1: Stale Build Artifacts
**What goes wrong:** Test files (`.test.js`, `.test.d.ts`) remain in `dist/` from builds that ran before the tsconfig `exclude` was added
**Why it happens:** `tsc` does not clean its output directory before compilation
**How to avoid:** Add `rm -rf dist` before `tsc` in build script, or use a `prebuild` script
**Current state:** 32 stale test files found in `packages/server/dist/`

### Pitfall 2: Hardcoded Node Path in Plists
**What goes wrong:** `/usr/local/bin/node` does not exist on nvm-managed machines. launchd fails to start the service silently.
**Why it happens:** `/usr/local/bin/node` is the default Homebrew install path, but nvm installs to `~/.nvm/versions/node/vX.X.X/bin/node`
**How to avoid:** Use the actual nvm node path. On this machine: `/Users/seanspade/.nvm/versions/node/v20.16.0/bin/node`
**Warning signs:** Service never appears in `launchctl list`, error log shows nothing

### Pitfall 3: tsx in Production Plist
**What goes wrong:** Backup plist uses `--import tsx` to run TypeScript source. launchd strips PATH so tsx is not found.
**Why it happens:** tsx is a devDependency only accessible via npx or project scripts, not absolute path
**How to avoid:** Run compiled JavaScript directly: `node --env-file=.env packages/server/dist/backup/run-backup.js`

### Pitfall 4: Missing Environment in Backup Plist
**What goes wrong:** Backup plist does not load `.env` file and lacks `NODE_ENV=production`
**Why it happens:** Backup was originally run manually or via tsx with env already loaded
**How to avoid:** Add `--env-file=.env` to ProgramArguments and `EnvironmentVariables` dict with `NODE_ENV=production`

### Pitfall 5: WorkingDirectory Required for Relative Paths
**What goes wrong:** `--env-file=.env` resolves relative to WorkingDirectory. If WorkingDirectory is missing, it resolves relative to `/`.
**Current state:** Both plists already have correct WorkingDirectory set to repo root. Server plist uses relative path for entry point (`packages/server/dist/index.js`), backup plist uses absolute path. Both approaches work with WorkingDirectory set.

## Code Examples

### Backup Plist Fixed ProgramArguments
```xml
<key>ProgramArguments</key>
<array>
    <string>/Users/seanspade/.nvm/versions/node/v20.16.0/bin/node</string>
    <string>--env-file=.env</string>
    <string>packages/server/dist/backup/run-backup.js</string>
</array>
```

### Server Plist Fixed Node Path
```xml
<key>ProgramArguments</key>
<array>
    <string>/Users/seanspade/.nvm/versions/node/v20.16.0/bin/node</string>
    <string>--env-file=.env</string>
    <string>packages/server/dist/index.js</string>
</array>
```

### Clean Build Script
```json
{
  "build": "tsc",
  "prebuild": "rm -rf dist"
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `dotenv` package | Node 20 `--env-file` | Node 20.6 (2023-08) | Zero runtime dependencies for env loading |
| `launchctl load` | `launchctl bootstrap gui/$(id -u)` | macOS 10.10+ | Phase 20 concern, not this phase |
| `tsx` in production | Compiled JS via `tsc` | Always best practice | Faster startup, no dev dependencies needed |

## Open Questions

1. **Node path portability between machines**
   - What we know: Dev machine uses `/Users/seanspade/.nvm/versions/node/v20.16.0/bin/node`. Target iMac may differ.
   - What's unclear: Whether iMac uses nvm or Homebrew node
   - Recommendation: Use current dev machine path. Document in deploy scripts that path must be verified on target. Phase 20 deploy scripts can add path validation.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: package.json files, tsconfig files, plist files, server index.ts
- Build output verification: `npm run build` executed successfully, dist directories confirmed
- Node path verification: `which node` confirmed nvm path

### Secondary (MEDIUM confidence)
- Node 20 `--env-file` documentation: native feature since Node 20.6

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use, versions confirmed from package.json
- Architecture: HIGH - codebase directly inspected, build tested, patterns verified
- Pitfalls: HIGH - stale test files confirmed (32 files found), node path issue confirmed (`/usr/local/bin/node` does not exist)

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable infrastructure, unlikely to change)
