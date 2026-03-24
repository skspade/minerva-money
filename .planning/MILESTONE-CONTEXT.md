# Milestone Context

**Source:** Brainstorm session (CSV Import Account Filtering)
**Design:** .planning/designs/2026-03-24-csv-import-account-filtering-design.md

## Milestone Goal

Allow users to selectively skip/exclude CSV accounts during import so they can import only the accounts they want (e.g., checking and savings) while ignoring unsupported account types (e.g., credit cards).

## Features

### Account Mapping Dropdown Changes

In the `PreviewStep` component's account mapping section, add a "Skip — do not import" option as the first `<option>` after the placeholder. Its value will be a sentinel string `"__skip__"`.

When a user selects "Skip," the `accountMappings` state stores `"__skip__"` for that CSV account name. The `allAccountsMapped` check changes from "every account has a non-empty value" to "every account has a non-empty value (including `__skip__`)."

The dropdown styling will visually differentiate skipped accounts — the select border turns amber/yellow instead of red (unmapped) or default (mapped).

The "Continue" button remains disabled only if any account is still on the empty placeholder — both mapped and skipped accounts count as resolved.

### Client-Side Stats Filtering

The `PreviewStep` component will compute filtered stats based on which accounts are not skipped:

**Filtered values (computed with `useMemo`):**
- `filteredValidRows` — count of valid rows whose `accountName` is not in the skipped set
- `filteredSampleRows` — `previewResult.sampleRows` filtered to exclude skipped accounts
- `filteredNewCount` / `filteredDuplicateCount` — rows from skipped accounts are excluded from both new and duplicate counts (approximation; actual dedup during execute is accurate regardless)

**How it works:**
1. Derive `skippedAccounts` set from `accountMappings` entries where value === `"__skip__"`
2. Use the `previewResult.accounts` list to get CSV account names, filter `sampleRows` and recount
3. For total/valid row counts, compute from the full transformed rows by account proportion

The summary stats cards and dedup stats will display the filtered numbers. A small note below the stats will say "Excluding N accounts (X rows)" when accounts are skipped.

### Server-Side Execute Changes

The `executeImport` function currently throws if any account is unmapped. The change:

**Before:** Throws `"Unmapped accounts: X, Y"` if any CSV account name lacks a mapping entry.

**After:** Only validates that accounts present in `accountMappings` have valid (non-empty) values. Rows whose `accountName` is not in `accountMappings` are silently skipped during the insert loop.

Specifically:
1. Remove the `unmappedAccounts` check that throws
2. In the insert loop, check `if (!accountMappings[row.accountName]) continue;` to skip rows for unmapped/excluded accounts
3. The `skippedCount` in the result will include both dedup skips and excluded-account skips

The client will omit skipped accounts from the `accountMappings` dict sent to execute — it won't send `"__skip__"` values to the server.

### Results Step Updates

**Confirm summary:** The "New transactions" and "Duplicates to skip" numbers will use the client-filtered counts (same as preview step). If accounts were skipped, a note says "N accounts excluded from import."

**Post-import results:** The server's `ExecuteResult` already returns `importedCount` and `skippedCount`. The `skippedCount` will naturally include rows from excluded accounts (since they weren't in the mappings). No changes needed to the results display — it shows what actually happened.
