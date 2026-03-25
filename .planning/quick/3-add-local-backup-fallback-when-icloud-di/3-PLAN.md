---
phase: quick
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/server/src/backup/backup.ts
  - packages/server/src/backup/backup.test.ts
autonomous: true
requirements: [QUICK-3]
must_haves:
  truths:
    - "When iCloud Drive directory exists, backups write to iCloud path as before"
    - "When iCloud Drive directory does not exist, backups write to ~/minerva-money/backups/"
    - "Backup result indicates whether iCloud or local fallback was used"
    - "A log message is emitted indicating which backup path was chosen"
  artifacts:
    - path: "packages/server/src/backup/backup.ts"
      provides: "Fallback logic for backup directory resolution"
      contains: "LOCAL_BACKUP_DIR"
    - path: "packages/server/src/backup/backup.test.ts"
      provides: "Tests covering iCloud available and fallback scenarios"
  key_links:
    - from: "packages/server/src/backup/backup.ts"
      to: "resolveBackupDir"
      via: "directory existence check"
      pattern: "existsSync.*CloudDrive"
---

<objective>
Add local backup fallback when iCloud Drive directory is unavailable.

Purpose: On machines without iCloud Drive configured, backups currently attempt to write to a non-existent iCloud path. This change detects iCloud availability and falls back to a local directory, ensuring backups always succeed.

Output: Updated backup.ts with fallback logic and updated tests covering both paths.
</objective>

<execution_context>
@/Users/seanspade/.claude/get-shit-done/workflows/execute-plan.md
@/Users/seanspade/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/server/src/backup/backup.ts
@packages/server/src/backup/backup.test.ts
@packages/server/src/backup/run-backup.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add iCloud fallback logic and tests</name>
  <files>packages/server/src/backup/backup.ts, packages/server/src/backup/backup.test.ts</files>
  <behavior>
    - Test: When backupDir is explicitly provided, uses that directory (existing behavior unchanged)
    - Test: resolveBackupDir returns iCloud path when iCloud parent directory exists
    - Test: resolveBackupDir returns local fallback path when iCloud parent directory does not exist
    - Test: BackupResult includes isCloudBackup boolean field
  </behavior>
  <action>
    1. In backup.ts, add a LOCAL_BACKUP_DIR constant: `path.join(os.homedir(), 'minerva-money', 'backups')`.

    2. Add an exported `resolveBackupDir()` function that:
       - Checks if the iCloud Drive parent directory exists: `path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDrive')`
       - If it exists, return `{ dir: DEFAULT_BACKUP_DIR, isCloud: true }`
       - If it does not exist, return `{ dir: LOCAL_BACKUP_DIR, isCloud: false }`
       - Use `fs.existsSync()` for the check

    3. Add `isCloudBackup: boolean` to the `BackupResult` interface.

    4. Update `createBackup()`:
       - When no `backupDir` argument is provided, call `resolveBackupDir()` to determine the directory
       - When `backupDir` IS provided (explicit override), use it directly and set `isCloudBackup: false` (custom path)
       - Add a `console.log` indicating which path is being used: `Backup target: ${dir} (${isCloud ? 'iCloud' : 'local'})`
       - Include `isCloudBackup` in the returned BackupResult

    5. In backup.test.ts, add tests:
       - "uses explicit backupDir when provided" (existing tests already cover this implicitly, but add explicit assertion on isCloudBackup being false)
       - "resolveBackupDir returns iCloud path when iCloud directory exists" — create a temp dir structure mimicking iCloud, mock os.homedir or pass the parent path
       - "resolveBackupDir returns local path when iCloud directory is missing" — use a temp dir without iCloud structure
       - Update existing test "returns correct BackupResult shape" to also check for `isCloudBackup` property

    Note: Since resolveBackupDir depends on the filesystem state of the actual machine, export it so tests can call it with controlled temp directories. Alternatively, make the function accept an optional homedir parameter for testability: `resolveBackupDir(homeDir?: string)`.
  </action>
  <verify>
    <automated>cd /Users/seanspade/Documents/Source/minerva-money && npx vitest run packages/server/src/backup/backup.test.ts</automated>
  </verify>
  <done>
    - resolveBackupDir correctly detects iCloud availability and returns appropriate path
    - BackupResult includes isCloudBackup field
    - createBackup logs which path is used
    - All existing tests still pass
    - New tests cover both iCloud-available and fallback scenarios
  </done>
</task>

</tasks>

<verification>
npx vitest run packages/server/src/backup/
npm run build
</verification>

<success_criteria>
- Backups succeed on machines without iCloud Drive by falling back to ~/minerva-money/backups/
- Backups continue to use iCloud path when iCloud Drive is available
- BackupResult.isCloudBackup indicates which path was used
- All backup tests pass including new fallback coverage
- Build succeeds with no type errors
</success_criteria>

<output>
After completion, create `.planning/quick/3-add-local-backup-fallback-when-icloud-di/3-SUMMARY.md`
</output>
