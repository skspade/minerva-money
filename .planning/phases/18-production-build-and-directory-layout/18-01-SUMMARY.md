---
phase: 18-production-build-and-directory-layout
plan: 01
subsystem: infra
tags: [typescript, tsc, vite, build, monorepo]

requires: []
provides:
  - Clean production build pipeline with prebuild clean step
  - Sequential workspace build order (shared -> server -> client)
  - Verified production server startup and SPA serving
affects: [service-configuration, deploy-scripts]

tech-stack:
  added: []
  patterns:
    - "prebuild script removes dist/ and tsconfig.tsbuildinfo before tsc"
    - "Root build runs workspaces sequentially: shared -> server -> client"

key-files:
  created: []
  modified:
    - packages/server/package.json
    - packages/shared/package.json
    - package.json

key-decisions:
  - "Added tsconfig.tsbuildinfo to prebuild clean — composite projects cache build state in tsbuildinfo, deleting dist alone causes tsc to skip emit"
  - "Changed root build from parallel --workspaces to sequential shared->server->client — server depends on shared types, parallel caused race condition"

patterns-established:
  - "Prebuild clean: rm -rf dist tsconfig.tsbuildinfo before tsc in each package"
  - "Build order: shared first (dependency), then server, then client"

requirements-completed: [BUILD-01, BUILD-02, BUILD-03, BUILD-04]

duration: 8min
completed: 2026-03-23
---

# Phase 18 Plan 01: Production Build Pipeline Summary

**Clean build pipeline with prebuild clean, sequential workspace build order, and verified SPA serving from compiled server**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-23
- **Completed:** 2026-03-23
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added prebuild scripts to server and shared packages that clean dist/ and tsconfig.tsbuildinfo
- Fixed root build script to run workspaces sequentially (shared -> server -> client) instead of parallel
- Verified production server starts, serves SPA at root, returns index.html for catch-all routes, health endpoint responds

## Task Commits

1. **Task 1: Add prebuild clean step** - `662bc0f` (feat)
2. **Task 2: Verify production server startup** - verification only, no commit needed

## Files Created/Modified
- `packages/server/package.json` - Added prebuild script
- `packages/shared/package.json` - Added prebuild script
- `package.json` - Fixed build order to sequential workspace execution

## Decisions Made
- Added tsconfig.tsbuildinfo to prebuild clean because composite projects use it to cache build state; deleting dist alone caused tsc to skip emitting files
- Changed from `npm run build --workspaces` (parallel) to sequential build because server depends on shared types and the parallel race condition caused build failures

## Deviations from Plan

### Auto-fixed Issues

**1. Root package.json build script ordering**
- **Found during:** Task 1 (prebuild implementation)
- **Issue:** `npm run build --workspaces` runs all packages in parallel, causing race condition where server builds before shared dist exists
- **Fix:** Changed to sequential: `npm run build --workspace=packages/shared && npm run build --workspace=packages/server && npm run build --workspace=packages/client`
- **Files modified:** package.json
- **Verification:** Clean build succeeds from scratch
- **Committed in:** 662bc0f

**2. tsconfig.tsbuildinfo cleanup in prebuild**
- **Found during:** Task 1 (prebuild implementation)
- **Issue:** `rm -rf dist` alone was insufficient — tsc composite projects use tsbuildinfo to track what was emitted, and with tsbuildinfo intact tsc skipped re-emission
- **Fix:** Added `tsconfig.tsbuildinfo` to the prebuild rm command
- **Files modified:** packages/server/package.json, packages/shared/package.json
- **Verification:** Build correctly emits all files after clean
- **Committed in:** 662bc0f

---

**Total deviations:** 2 auto-fixed (both blocking build issues)
**Impact on plan:** Both fixes necessary for build correctness. No scope creep.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Build pipeline produces clean output ready for launchd services (Phase 19)
- Deploy scripts can rely on `npm run build` working correctly (Phase 20)

---
*Phase: 18-production-build-and-directory-layout*
*Completed: 2026-03-23*
