# Pitfalls Research

**Domain:** Adding account skip/filter to existing CSV import system
**Researched:** 2026-03-24
**Confidence:** HIGH (based on direct code analysis of existing import-service.ts and ImportPage.tsx)

## Critical Pitfalls

### Pitfall 1: Dedup Stats Counting Skipped Accounts as "New"

**What goes wrong:**
The current `previewImport` code (import-service.ts lines 320-328) counts rows with unmapped accounts as "new" (`newCount++`). When a user skips an account, those rows inflate the "new transactions" count shown in preview and confirmation, making the user think they are importing more transactions than they actually will.

**Why it happens:**
The existing logic treats "no mapping" and "skip" identically. The `accountIdMap` will not have an entry for skipped accounts, so they fall through to the `!entry.hasMappedAccount` branch which increments `newCount`. This was correct when unmapped meant "not yet selected" but becomes wrong when unmapped means "deliberately excluded."

**How to avoid:**
Distinguish three account states in the client-side stats recalculation: (1) mapped to a real account, (2) explicitly skipped, (3) not yet selected. Only count mapped rows toward newCount/duplicateCount. Skipped rows should be excluded entirely from dedup stats. The client must recompute these counts by filtering `previewResult` data based on current mapping state, since the server preview does not know about skip decisions.

**Warning signs:**
Preview summary shows more "new transactions" than expected after skipping an account. The confirmation page numbers do not add up (new + duplicates != non-skipped valid rows).

**Phase to address:**
Client-side stats filtering phase.

---

### Pitfall 2: Server executeImport Throws on Unmapped Accounts

**What goes wrong:**
The current `executeImport` function (import-service.ts lines 362-366) explicitly throws: `throw new Error('Unmapped accounts: ...')`. If the client sends `accountMappings` that excludes skipped accounts, the server rejects the entire import.

**Why it happens:**
The original design required all accounts to be mapped as a safety check. Adding a "skip" option to the dropdown without updating server validation causes a hard crash on execute.

**How to avoid:**
Change the server validation to check that every CSV account is either mapped to a real account ID OR absent from the mappings (meaning skipped). The key insight: the client should NOT send skipped accounts in accountMappings at all. The server should filter `validTransformed` to only include rows whose `accountName` exists in `accountMappings`, then skip the rest. Replace the unmapped-accounts error with a filter step that counts filtered rows for the result.

**Warning signs:**
Import button triggers a server error with "Unmapped accounts" message.

**Phase to address:**
Server-side execute changes phase -- must be done before or simultaneously with client UI changes.

---

### Pitfall 3: allAccountsMapped Gate Logic Blocks Import When Accounts Are Skipped

**What goes wrong:**
The current gate check (ImportPage.tsx lines 105-107) requires every account to have a non-empty mapping: `previewResult.accounts.every((a) => accountMappings[a.csvName] && accountMappings[a.csvName] !== '')`. If the skip approach removes entries from accountMappings, this check blocks the Continue button. If a sentinel value like `"__skip__"` is used, it passes but must not leak to the server as an account ID.

**Why it happens:**
The original validation correctly enforced "all must be mapped." Adding skip without updating this gate means it either blocks valid skip scenarios or is removed entirely, losing protection against genuinely forgotten mappings.

**How to avoid:**
Use a sentinel value for skip (e.g., `"__skip__"`) in the client-side accountMappings state. Update the gate to: every account must have a mapping that is either a real account ID or the skip sentinel. An empty string mapping is still "unmapped" and blocks import. Before sending to the server, strip skip-sentinel entries from accountMappings so the server only receives real mappings. This preserves the safety check while allowing skips.

**Warning signs:**
Continue button stays disabled after setting an account to "skip." Or: Continue button is enabled when an account has no mapping because the gate was loosened too much.

**Phase to address:**
Client skip dropdown phase -- the dropdown and gate logic must be updated together.

---

### Pitfall 4: Sample Rows and Row Counts Include Skipped Accounts

**What goes wrong:**
The `sampleRows` (import-service.ts line 333: `validTransformed.slice(0, 10)`) takes the first 10 rows regardless of account. If a skipped account dominates the first rows of the CSV, the sample table shows irrelevant transactions. Similarly, `totalRows`, `validRows`, and error counts include skipped accounts, making the summary misleading.

**Why it happens:**
The server preview computes stats before account skip decisions exist. The preview response includes all data. The client must filter what it displays based on current mapping state.

**How to avoid:**
Client-side filtering of displayed data. When an account is set to "skip": (1) filter that account's rows out of displayed sample table, (2) subtract that account's row count from displayed totals, (3) exclude validation errors from skipped account rows from the error count. The server response stays unchanged -- the client applies the filter layer.

**Warning signs:**
Sample table shows only transactions from skipped accounts. Row counts do not match what the user expects to import.

**Phase to address:**
Client-side stats filtering phase.

---

### Pitfall 5: Confirm Summary Does Not Reflect Filtered Counts

**What goes wrong:**
The ResultsStep (ImportPage.tsx lines 477-527) shows `previewResult.dedupStats.newCount`, `previewResult.dedupStats.duplicateCount`, and `previewResult.errors.length` directly from the server response. These include skipped accounts. The user sees inflated numbers on the confirm page, then the actual import result shows fewer transactions.

**Why it happens:**
The confirm summary reads from the unfiltered preview response. The server computed dedup stats before any skip decisions. If only the preview step is updated to filter displays but the confirm step still reads raw preview data, the numbers diverge.

**How to avoid:**
The confirm summary must use the same filtered stats as the preview step. Either: (1) compute filtered stats once and store them in component state when transitioning to confirm, or (2) derive filtered stats in both places from the same filtering function. The key point: `previewResult` is raw server data; display logic must always filter it through current skip state.

**Warning signs:**
"50 new transactions" on confirm page but only 30 actually imported. Numbers do not match between preview step and confirm step.

**Phase to address:**
Results step updates phase.

---

### Pitfall 6: Category Mappings for Skipped Accounts Clutter the UI

**What goes wrong:**
Categories are derived from all valid rows (import-service.ts line 254). If a skipped account has unique category names (e.g., investment-specific categories like "Dividends & Capital Gains"), those categories still appear in the category mapping UI even though they will never be imported.

**Why it happens:**
The server preview does not know which accounts will be skipped. It returns all unique categories. The client displays all of them.

**How to avoid:**
Client-side: filter displayed categories based on which accounts are not skipped. If a category name only appears in rows from skipped accounts, hide it from the mapping UI. This requires the client to know which categories belong to which accounts, which means either: (1) filtering the sample/all rows by account and deriving category lists from non-skipped rows, or (2) having the server return per-account category breakdowns. Option 1 is simpler but the client only has sample rows, not all rows. A reasonable approach: do not filter categories in the first version -- extra category mappings are harmless (unused). Polish this in a future iteration.

**Warning signs:**
Category mapping section shows categories that will never be used.

**Phase to address:**
Client-side stats filtering phase -- lower priority, acceptable to defer.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using empty string `""` as skip sentinel | No new constant needed | Ambiguous with "not selected" state, causes gate logic bugs | Never -- use explicit sentinel like `"__skip__"` |
| Filtering only on client, not adjusting server preview | No server code changes for preview | Server preview stats are misleading, client must always re-compute | Acceptable for v2.4 -- server does not know skip state at preview time |
| Not filtering categories for skipped accounts | Faster to ship, no harm done | Confusing UI showing irrelevant category mappings | Acceptable for v2.4, polish later |
| Removing the unmapped accounts server validation entirely | Quick fix for the throw error | Loses safety net for genuinely forgotten mappings | Never -- the server should still validate that all accounts in the mappings dict exist as real account IDs |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Server execute validation | Removing the unmapped accounts check entirely instead of changing it to allow missing (skipped) accounts | Change from "all accounts must be in mappings" to "all accounts in mappings must have valid account IDs." Accounts not in mappings are skipped |
| Dedup hash computation | Skipped account rows still generate dedup hashes for stats | Only compute hashes for rows whose account is in accountMappings. Skip rows with no mapping |
| Post-import hooks (rules, transfers) | Worrying that skipped rows affect rules engine or transfer detection | Not a real risk -- skipped rows never reach INSERT, so `newTransactionIds` naturally excludes them. No code change needed in post-import hooks |
| tRPC schema validation | Thinking the Zod schema needs changes to accept a skip value | accountMappings is `z.record(z.string(), z.string())` -- if client strips skip entries before sending, no schema change needed |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Skip option buried at bottom of account dropdown | User cannot find it among many account options | Put "Skip -- do not import" as the first option after the placeholder, visually distinct with a separator or different styling |
| No per-account row count shown | User does not understand the impact of skipping an account | Show row count next to each account name (e.g., "Savings (342 rows)") so the user sees the magnitude |
| No warning when skipping high-row-count account | User accidentally skips their primary checking account | Consider a soft warning if a skipped account has more rows than any non-skipped account |
| Confirm summary does not list skipped accounts | User forgets which accounts they skipped, confused by lower numbers than expected | Add a "Skipped accounts" line to the confirm summary listing excluded accounts and their row counts |
| No way to quickly "skip all" or "unskip all" | Tedious when CSV has many accounts and user only wants one or two | Add "Skip all unmatched" button if there are more than 3 unmapped accounts |

## "Looks Done But Isn't" Checklist

- [ ] **Skip sentinel flow:** Trace that `"__skip__"` in client state is stripped before sending to server -- it must never appear as an account_id in an INSERT
- [ ] **Dedup math:** Verify new + duplicate == non-skipped valid rows (the math must add up in preview, confirm, and results)
- [ ] **Gate logic:** Verify skip enables Continue button, empty string blocks it, and a real account ID enables it
- [ ] **Sample rows:** Verify sample table filters out skipped account rows dynamically as user changes mappings
- [ ] **Server validation:** Verify server accepts accountMappings that omit skipped accounts without throwing
- [ ] **Error filtering:** Verify that validation errors from skipped account rows are excluded from displayed error count
- [ ] **Results page:** Verify "X transactions imported" plus "Y duplicates skipped" plus "Z rows filtered (skipped accounts)" == total valid rows
- [ ] **Edge case -- all accounts skipped:** Verify graceful handling when user skips every account (should block import with a clear message, not import 0 rows silently)
- [ ] **Edge case -- single account:** Verify the skip option is available even when there is only one CSV account (user may want to abort gracefully)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Skip sentinel leaked to server as account_id | LOW | Foreign key constraint on `account_id` catches this -- INSERT fails, transaction rolls back. No data corruption possible |
| Dedup stats wrong (cosmetic only) | LOW | Fix counting logic, redeploy. No data impact |
| Gate logic too permissive (unmapped account imported to wrong place) | HIGH | Wrong account_id on transactions. Must identify affected rows (by import batch or date range) and delete. Re-import after fix |
| Confirm summary showed wrong numbers | LOW | Cosmetic only. Actual import was correct, just the preview was misleading |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Dedup stats counting skipped as new | Client-side stats filtering | Filtered new + duplicate counts exclude skipped rows; sum matches non-skipped valid rows |
| Server throws on unmapped accounts | Server-side execute changes | Import succeeds with skipped accounts; skipped rows absent from DB |
| Gate logic blocks skip | Client skip dropdown | Continue button enabled with skip selections; disabled with empty/unselected |
| Sample rows include skipped accounts | Client-side stats filtering | Toggling skip removes/adds rows from sample table dynamically |
| Confirm summary shows unfiltered stats | Results step updates | Confirm summary numbers match actual import outcome |
| Category mappings for skipped accounts | Client-side stats filtering (low priority) | Categories unique to skipped accounts hidden; or deferred as acceptable tech debt |

## Sources

- Direct code analysis: `packages/server/src/import/import-service.ts` -- dedup stats loop (lines 284-338), unmapped validation (lines 361-366), INSERT logic (lines 369-434)
- Direct code analysis: `packages/client/src/pages/ImportPage.tsx` -- gate check (lines 105-107), confirm summary (lines 477-527), sample rows display (lines 340-365)
- Direct code analysis: `packages/server/src/import/import-router.ts` -- Zod schema for execute input (z.record for accountMappings)
- Project requirements: `.planning/PROJECT.md` (v2.4 milestone definition, lines 42-51)

---
*Pitfalls research for: CSV import account filtering/skip capability (v2.4)*
*Researched: 2026-03-24*
