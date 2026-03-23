# Phase 10: Foundation Bug Fix & Verification - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Fix the broken launchd backup script and formally verify all Phase 1 requirements that were implemented but never verified. This phase delivers: a `run-backup.ts` entry-point script that the existing `com.minerva.backup.plist` can execute via launchd, and a Phase 1 VERIFICATION.md confirming all 4 INFR requirements (INFR-01 through INFR-04) are satisfied.

</domain>

<decisions>
## Implementation Decisions

### Backup Script Fix
- `run-backup.ts` must exist at `packages/server/src/backup/run-backup.ts` to match the path in `com.minerva.backup.plist`
- The script must be a standalone entry point that opens the database and calls `createBackup(db)` from the existing `backup.ts` module
- The script must use the production database path `~/minerva-money/data/minerva.db` (from ARCHITECTURE.md and Phase 1 context)
- The plist already uses `--import tsx` to run TypeScript directly via Node, so no compilation step is needed
- The script should log success/failure output to stdout/stderr since the plist captures both to `~/Library/Logs/minerva-backup.log`
- The script should exit with code 0 on success and non-zero on failure (Claude's Decision: standard Unix convention for launchd to detect failures)
- The script should close the database connection and exit cleanly after backup completes (Claude's Decision: launchd expects the process to terminate; a dangling connection would leave the process alive)

### VERIFICATION.md Structure
- VERIFICATION.md is written for Phase 1 at `.planning/phases/01-foundation/VERIFICATION.md`
- Covers all 4 requirements: INFR-01, INFR-02, INFR-03, INFR-04
- Each requirement gets a pass/fail status with concrete evidence (Claude's Decision: matches the verification pattern implied by the audit report's 3-source cross-reference approach)
- INFR-01: Verify `run-backup.ts` exists, plist references it correctly, and executing it produces a valid backup file
- INFR-02: Verify `sync-service.ts` calls `createBackup(db)` after sync completion (already confirmed by audit integration check)
- INFR-03: Verify `pruneOldBackups` implements 30-day retention and `minerva_latest.db` is always maintained (already confirmed by audit integration check and existing tests)
- INFR-04: Verify all money columns in `001-initial-schema.sql` use INTEGER type (already confirmed by audit integration check)

### Verification Approach
- INFR-01 requires a functional test: run the backup script and confirm a valid SQLite backup is produced (from success criteria 2)
- INFR-02, INFR-03, INFR-04 are code-level verifications: inspect source and existing tests as evidence (Claude's Decision: these are already wired correctly per audit; formal verification documents existing evidence rather than adding new tests)
- Reference existing test results from `backup.test.ts` as supporting evidence for INFR-01 and INFR-03 (Claude's Decision: the 7 existing backup tests already cover atomic backup, integrity check, latest copy, and pruning)

### Plist Validation
- Verify `com.minerva.backup.plist` XML is valid and references the correct script path
- No modifications to the plist file itself are needed -- the fix is creating the missing script it references (from success criteria 1)
- The plist uses `/usr/local/bin/node` which must be valid on the target machine (Claude's Decision: worth noting in verification but not worth changing -- the plist was authored for the specific iMac server)

### Claude's Discretion
- Exact log message format in `run-backup.ts`
- Whether to add a test for `run-backup.ts` or rely on manual execution verification
- VERIFICATION.md prose style and level of detail per requirement
- Whether to include test output snippets as evidence in VERIFICATION.md

</decisions>

<specifics>
## Specific Ideas

- The `com.minerva.backup.plist` at repo root references `packages/server/src/backup/run-backup.ts` with args: `/usr/local/bin/node --import tsx run-backup.ts` and working directory set to the repo root
- The existing `createBackup(db, backupDir?)` function in `backup.ts` handles everything: directory creation, timestamped file, latest copy, integrity check, and pruning -- the script just needs to open the DB and call it
- The backup target directory is `~/Library/Mobile Documents/com~apple~CloudDrive/MinervaBackups/` (hardcoded as DEFAULT_BACKUP_DIR in backup.ts)
- The audit report confirms: sync-service.ts calls createBackup(db) after sync (INFR-02 wired), pruneOldBackups with 30-day retention exists (INFR-03 wired), all money columns use INTEGER (INFR-04 wired)
- The only genuinely broken requirement is INFR-01 -- the other three are implemented but lack formal verification documentation
- Schema money columns confirmed as INTEGER: `accounts.balance`, `transactions.amount`, `budget_allocations.amount`, `categorization_rules.amount_min`, `categorization_rules.amount_max`, `balance_snapshots.balance`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createBackup(db, backupDir?)` in `packages/server/src/backup/backup.ts`: the complete backup implementation -- run-backup.ts just wraps this
- `backup.test.ts`: 7 existing tests covering timestamped backup creation, latest copy, integrity check, directory creation, result shape, data validity, and 30-day pruning
- `001-initial-schema.sql`: the schema file to inspect for INFR-04 INTEGER verification

### Established Patterns
- Feature-based directory: `packages/server/src/backup/` already contains `backup.ts` and `backup.test.ts` -- add `run-backup.ts` alongside them
- Database connection in `packages/server/src/db/connection.ts` provides `createDatabase()` but the backup script needs a simpler direct open since it should not run migrations (Claude's Decision: the script opens an existing production DB readonly-like; using BetterSqlite3 directly avoids migration side effects)
- The plist uses `--import tsx` for TypeScript execution without a build step

### Integration Points
- `com.minerva.backup.plist` (repo root): references `run-backup.ts` -- the file this phase creates
- `packages/server/src/backup/backup.ts`: the `createBackup` function called by the new script
- `packages/server/src/sync/sync-service.ts`: already calls `createBackup(db)` post-sync (INFR-02 integration point, verified not modified)
- `.planning/phases/01-foundation/`: destination for VERIFICATION.md

</code_context>

<deferred>
## Deferred Ideas

- Phases 5, 6, and 9 VERIFICATION.md files (Phase 11 scope)
- Off-by-one date bug fix in spending queries (Phase 11 scope)
- Budget defaults UI (Phase 12 scope)
- Test consolidation for rules-service.test.ts boilerplate (noted in audit, not in Phase 10 scope)
- launchctl load/unload automation (deployment concern, not a code deliverable)

</deferred>

---

*Phase: 10-foundation-bug-fix-and-verification*
*Context gathered: 2026-03-22 via auto-context*
