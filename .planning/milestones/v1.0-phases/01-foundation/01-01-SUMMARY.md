---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [npm-workspaces, typescript, vite, express, vitest, eslint, monorepo]

requires:
  - phase: none
    provides: greenfield project
provides:
  - npm workspaces monorepo with client, server, shared packages
  - TypeScript strict mode across all packages
  - Vite dev server with proxy to Express
  - Express server with /health endpoint
  - Vitest monorepo test discovery
  - ESLint flat config
  - Shared Cents branded type
affects: [01-02, 01-03, phase-2, phase-3]

tech-stack:
  added: [better-sqlite3, express, vite, vitest, tsx, concurrently, eslint, typescript]
  patterns: [npm-workspaces, vitest-projects, eslint-flat-config, branded-types]

key-files:
  created:
    - package.json
    - tsconfig.base.json
    - vitest.config.ts
    - eslint.config.js
    - packages/server/src/index.ts
    - packages/client/vite.config.ts
    - packages/shared/src/types.ts
  modified: []

key-decisions:
  - "tsx for server dev mode (fast, no config)"
  - "NODE_ENV=test check prevents server port binding during tests"
  - "Vitest projects config (v3+) for monorepo test discovery"

patterns-established:
  - "Cross-package imports via @minerva/shared namespace"
  - "Server vitest.config.ts sets NODE_ENV=test"
  - "ESLint flat config with TypeScript parser"

requirements-completed:
  - INFR-04

duration: 8min
completed: 2026-03-22
---

# Plan 01-01: Monorepo Scaffold Summary

**npm workspaces monorepo with Vite + Express concurrent dev, Vitest project discovery, and shared Cents branded type**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-22
- **Completed:** 2026-03-22
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments
- Three-package monorepo (client, server, shared) with npm workspaces
- TypeScript strict mode with project references
- Vite dev server proxying /trpc to Express on port 3001
- Vitest discovers tests across all packages via projects config
- Shared `Cents` branded type for integer money
- Smoke test validates Express app creation

## Task Commits

1. **Task 1: Create monorepo scaffold** - `1523d31` (feat)
2. **Task 2: Configure Vite, Express, ESLint, Vitest** - `192cc6b` (feat)

## Files Created/Modified
- `package.json` - Root workspace config with dev/build/test/lint scripts
- `tsconfig.base.json` - Shared strict TypeScript config
- `vitest.config.ts` - Root Vitest with projects discovery
- `eslint.config.js` - ESLint v9 flat config with TypeScript
- `packages/server/src/index.ts` - Express server on port 3001 with /health
- `packages/server/vitest.config.ts` - Server test config with NODE_ENV=test
- `packages/server/src/index.test.ts` - Smoke test for Express app
- `packages/client/vite.config.ts` - Vite with /trpc proxy
- `packages/client/index.html` - HTML entry point
- `packages/client/src/main.ts` - Minimal client entry
- `packages/shared/src/types.ts` - Cents branded type + toCents helper

## Decisions Made
- Used `tsx` for server dev mode (fast TypeScript execution, no config)
- Added `NODE_ENV` check to prevent Express from binding port during tests
- Used Vitest v3+ `projects` key (not deprecated `workspace`)

## Deviations from Plan
None - plan executed as specified.

## Issues Encountered
None.

## Next Phase Readiness
- Monorepo ready for Plan 02 (schema/migrations) and Plan 03 (backup module)
- better-sqlite3 installed and available in server package
- Vitest configured for test-driven development in Wave 2

---
*Phase: 01-foundation*
*Completed: 2026-03-22*
