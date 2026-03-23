---
phase: 18-production-build-and-directory-layout
plan: 02
subsystem: infra
tags: [launchd, plist, nvm, deployment]

requires: []
provides:
  - Corrected server plist with nvm node path
  - Corrected backup plist running compiled JS with env loading
  - Verified deploy directory as single deployment config location
affects: [service-configuration, deploy-scripts]

tech-stack:
  added: []
  patterns:
    - "Plists use absolute nvm node path, not /usr/local/bin/node"
    - "Backup plist runs compiled JS with --env-file, not tsx source"

key-files:
  created: []
  modified:
    - deploy/com.minerva.server.plist
    - deploy/com.minerva.backup.plist

key-decisions:
  - "Used relative path for backup entry point (packages/server/dist/backup/run-backup.js) since WorkingDirectory is set to repo root"
  - "Added NODE_ENV=production to backup plist EnvironmentVariables to match server plist pattern"

patterns-established:
  - "All plists use nvm node path: /Users/seanspade/.nvm/versions/node/v20.16.0/bin/node"
  - "Both plists include --env-file=.env and NODE_ENV=production"
  - "All deployment config lives in deploy/ directory"

requirements-completed: [DIR-01, DIR-02]

duration: 5min
completed: 2026-03-23
---

# Phase 18 Plan 02: Plist Fixes and Directory Layout Summary

**Fixed node binary paths in both plists, switched backup from tsx to compiled JS, verified deploy/ as sole deployment config location**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23
- **Completed:** 2026-03-23
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Fixed server plist node path from /usr/local/bin/node to nvm path
- Fixed backup plist: nvm node path, compiled JS entry point, --env-file=.env, NODE_ENV=production
- Verified all deployment config co-located in deploy/ with no artifacts elsewhere

## Task Commits

1. **Task 1: Fix node binary path and backup plist entry point** - `bd70a2d` (feat)
2. **Task 2: Verify deployment directory layout** - verification only, no commit needed

## Files Created/Modified
- `deploy/com.minerva.server.plist` - Updated node binary path to nvm
- `deploy/com.minerva.backup.plist` - Updated node path, switched from tsx to compiled JS, added --env-file and NODE_ENV

## Decisions Made
- Used relative path for backup entry point since WorkingDirectory is set to repo root
- Added NODE_ENV=production to backup plist to match server plist pattern

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plists are ready for Phase 19 (Service Configuration) to add KeepAlive dict form and other service management improvements
- Deploy scripts (Phase 20) can copy these plists to ~/Library/LaunchAgents/

---
*Phase: 18-production-build-and-directory-layout*
*Completed: 2026-03-23*
