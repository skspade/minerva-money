---
phase: 26-import-service-and-api
plan: 02
status: complete
completed: "2026-03-24"
---

# Plan 26-02: Preview/Execute Service, tRPC Router, Integration Wiring

## What Was Built

Complete import API with two tRPC mutations and full service layer:

- **previewImport(db, csvText)**: Parses CSV, validates rows, auto-suggests account matches (case-insensitive substring), auto-suggests category matches (exact case-insensitive), computes dedup stats via batch hash check against existing transactions. Returns row counts, 10 sample rows, errors, matches, and dedup stats.
- **executeImport(db, csvText, accountMappings, categoryMappings)**: Re-parses CSV (stateless), validates all accounts mapped (throws on unmapped), inserts atomically via db.transaction, skips duplicates via INSERT OR IGNORE, runs categorizeNewTransactions, applies CSV category fallback (only where rules didn't match), runs detectTransferCandidates. Reports imported/skipped/categorized counts.
- **import-router.ts**: Thin tRPC router with `preview` and `execute` mutations using Zod validation.
- **appRouter integration**: Import router added as 10th nested router.
- **Express body limit**: Raised to 10mb for CSV payloads.

## Key Files

| File | Action | Purpose |
|------|--------|---------|
| packages/server/src/import/import-service.ts | Modified | Added previewImport and executeImport functions |
| packages/server/src/import/import-router.ts | Created | tRPC router with preview/execute mutations |
| packages/server/src/import/import-service.test.ts | Modified | Added 18 integration tests with real SQLite |
| packages/server/src/sync/trpc-router.ts | Modified | Added import: importRouter to appRouter |
| packages/server/src/index.ts | Modified | Changed express.json limit to 10mb |

## Test Results

54 total tests passing (36 unit + 18 integration). Full suite: 313 tests, 0 regressions.

## Decisions Made

- Dedup hash batch-check uses 500-row chunks to stay within SQLite parameter limits
- Unmapped accounts counted as "new" in preview dedup stats (conservative estimate)
- Category fallback uses `AND category_id IS NULL` to never override rules

## Self-Check: PASSED

- [x] Preview returns row counts, sample, accounts, categories, errors, dedup stats
- [x] Account auto-match: case-insensitive substring
- [x] Category auto-match: exact case-insensitive
- [x] Execute inserts atomically
- [x] Duplicates skipped via INSERT OR IGNORE
- [x] Rules engine runs post-insert
- [x] CSV category fallback only for uncategorized
- [x] Transfer detection runs post-insert
- [x] Unmapped accounts rejected
- [x] Body limit raised to 10mb
- [x] Build succeeds
