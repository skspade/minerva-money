---
phase: 20-deploy-scripts
plan: 01
subsystem: infra
tags: [launchd, bash, sigterm, health-check]

requires:
  - phase: 19-service-configuration
    provides: Correct plists with KeepAlive dict form and compiled entry points
provides:
  - Hardened setup.sh with pre-flight checks and modern launchctl
  - Clean SIGTERM shutdown handler with exit code 0
affects: []

tech-stack:
  added: []
  patterns: [launchctl-bootstrap-bootout, retry-health-check, sigterm-graceful-shutdown]

key-files:
  created: []
  modified: [deploy/setup.sh, packages/server/src/index.ts]

key-decisions:
  - "Used bootout-then-bootstrap for re-run safety on setup.sh"
  - "Added 5-second hard timeout on SIGTERM to prevent indefinite hang"
  - "Extract node path from plist via sed rather than hardcoding"

patterns-established:
  - "Retry health check: 10 attempts with 1s sleep between"
  - "Pre-flight validation before any destructive operations"

requirements-completed: [DEPLOY-01, DEPLOY-02, DEPLOY-05]

duration: 5min
completed: 2026-03-23
---

# Phase 20: Deploy Scripts - Plan 01 Summary

**Hardened setup.sh with .env check, node path validation, launchctl bootstrap, retry health check, and fixed SIGTERM handler for clean restarts**

## Performance

- **Duration:** 5 min
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Fixed SIGTERM handler to call process.exit(0) with 5-second hard timeout
- Added .env pre-flight check to setup.sh
- Added node binary path validation extracted from plist
- Replaced deprecated launchctl load with bootout/bootstrap pattern
- Added launchctl kickstart for immediate server start
- Replaced fixed sleep 3 with retry-based health check (10 attempts)

## Task Commits

1. **Task 1: Fix SIGTERM handler for clean shutdown** - `392e8e6` (feat)
2. **Task 2: Harden setup.sh** - `392e8e6` (feat)

## Files Created/Modified
- `packages/server/src/index.ts` - SIGTERM handler with clean exit and timeout
- `deploy/setup.sh` - Pre-flight checks, modern launchctl, retry health check

## Decisions Made
- Used bootout-then-bootstrap pattern for re-run safety (bootout errors ignored on fresh install)
- Extract node path from plist via sed to stay in sync with plist content
- 5-second hard timeout on SIGTERM prevents indefinite hang if connections don't drain

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- setup.sh ready for first-time install on target machine
- SIGTERM fix enables clean restart for deploy.sh

---
*Phase: 20-deploy-scripts*
*Completed: 2026-03-23*
