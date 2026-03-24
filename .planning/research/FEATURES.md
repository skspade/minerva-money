# Feature Landscape: CSV Import

**Domain:** Personal finance CSV import (Monarch Money migration)
**Researched:** 2026-03-24

## Monarch Money CSV Export Format

The source format is a comma-separated CSV with these 8 columns (confirmed via community documentation):

```
Date, Merchant, Category, Account, Original Statement, Notes, Amount, Tags
```

- **Date**: US date format (e.g. `2025-01-15` or `1/15/2025`)
- **Merchant**: Cleaned merchant name (user-edited in Monarch)
- **Category**: Monarch category name (will NOT match Minerva categories 1:1)
- **Account**: Account display name (will NOT match Minerva account names 1:1)
- **Original Statement**: Raw bank payee string (this maps to Minerva's `payee` field)
- **Notes**: User notes (maps to `memo`)
- **Amount**: Decimal with negative for debits (e.g. `-52.43`), needs conversion to integer cents
- **Tags**: Comma-separated or empty (Minerva has no tags -- ignore)

## Table Stakes

Features users expect. Missing = import feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| File upload (drag-and-drop + click) | Standard file input UX; dashed-border drop zone is the universal signal | Low | Use native HTML5 drag-and-drop; no library needed |
| Data preview with sample rows | Users must verify the file parsed correctly before committing | Low | Show first 5-10 rows in a table after parsing |
| Row count summary | "247 transactions found" gives confidence the whole file was read | Low | Display alongside preview |
| Account mapping | Monarch account names differ from Minerva accounts; user must map each | Medium | Dropdown per unique Monarch account name -> Minerva account. Pre-match by fuzzy name similarity |
| Category mapping | Monarch categories differ from Minerva categories; user must map or skip | Medium | Dropdown per unique Monarch category -> Minerva category (or "Uncategorized"). Pre-match exact name matches |
| Duplicate detection with count | Users will import files overlapping with SimpleFIN-synced transactions; must show "X duplicates will be skipped" | Medium | Reuse existing `generateDedupHash(accountId, date, amount, payee)` -- compute hash for each row using mapped account ID + parsed date + cents amount + Original Statement |
| Import confirmation screen | User reviews: X new, Y duplicates skipped, Z errors -- then clicks "Import" | Low | Summary stats before final commit |
| Error reporting per row | Rows with missing date, unparseable amount, or unmapped account must be flagged -- not silently dropped | Medium | Show error rows in a distinct section; allow import of valid rows while skipping errors |
| Amount conversion to integer cents | Monarch exports decimal dollars; Minerva stores integer cents | Low | `Math.round(parseFloat(amount) * 100)` -- already a pattern in the codebase |
| Post-import rules engine run | After inserting transactions, run `categorizeNewTransactions()` on new IDs so existing rules auto-apply | Low | Already built -- just call it with the array of new transaction IDs |

## Differentiators

Features that improve the experience beyond minimum viable. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Auto-match accounts by name similarity | Saves tedious manual mapping when account names are close (e.g. "Discover Checking" -> "Discover - Checking") | Low | Simple case-insensitive substring/includes matching; no need for Levenshtein |
| Auto-match categories by exact name | Many Monarch categories have direct Minerva equivalents (Groceries, Gas, etc.) | Low | Exact case-insensitive match against existing Minerva categories |
| Dry-run preview with dedup stats | Before importing, show exactly how many will be new vs duplicates vs errors | Medium | Requires computing dedup hashes server-side against existing transactions |
| "Create account" option in mapping | If Monarch file references an account not yet in Minerva, allow inline creation | Medium | Needs a name + institution + type; account won't have SimpleFIN sync but will hold imported history |
| Import history log | Record that an import happened (timestamp, filename, row counts) for auditability | Low | Simple `import_logs` table or append to sync_log |
| Transfer detection post-import | After import, run transfer candidate detection on new transactions | Low | Already built -- `detectTransferCandidates()` exists |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Generic CSV column mapping UI | Minerva is single-user migrating from Monarch -- building a flexible "map any column to any field" wizard adds complexity for a one-time migration | Hard-code Monarch format. If a second format is needed later, add a format selector with a second parser |
| Tag import | Minerva has no tagging system; building one for import is scope creep | Silently ignore the Tags column |
| Balance history import | Monarch exports balance snapshots separately; Minerva calculates balances from transactions + daily snapshots from SimpleFIN | Skip -- daily balance snapshots will be incomplete for historical data anyway. Note this in UI |
| Streaming/chunked upload for large files | Monarch exports are typically < 10K rows (a few years of personal transactions); standard file upload handles this fine | Use standard multipart upload. If file exceeds ~50K rows, show a warning |
| Undo/rollback import | Complex to implement (would need to track which transactions came from which import) | Instead, provide clear preview/confirmation so users don't import wrong data. If needed, user can filter by date range and delete manually |
| Category creation during import | Adding categories requires group assignment and sort ordering -- complex inline UI | Map to existing categories or leave uncategorized. User can create categories beforehand |
| OFX/QFX/QIF format support | YAGNI -- the user is migrating from Monarch which exports CSV | Add later if needed; keep parser modular enough to swap |

## Feature Dependencies

```
File Upload -> CSV Parsing -> Data Preview
Data Preview -> Account Mapping (needs list of unique Monarch accounts)
Data Preview -> Category Mapping (needs list of unique Monarch categories)
Account Mapping -> Dedup Hash Computation (needs Minerva account IDs)
Account Mapping + Category Mapping -> Import Confirmation Screen
Import Confirmation -> Transaction Insert -> Rules Engine Run
Transaction Insert -> Transfer Detection Run
```

Key dependency: Account mapping MUST happen before dedup detection, because `generateDedupHash` requires the Minerva `accountId`. The Monarch CSV has account names, not IDs.

## MVP Recommendation

### Must Have (Minimum Viable Import)

1. **File upload** with drag-and-drop zone
2. **Monarch CSV parser** -- hard-coded 8-column format, date normalization, cents conversion
3. **Data preview** -- first 10 rows + total count
4. **Account mapping** -- dropdown per unique Monarch account -> existing Minerva account, with auto-match by name
5. **Category mapping** -- dropdown per unique Monarch category -> existing Minerva category (or Uncategorized), with auto-match by exact name
6. **Dedup detection** -- compute hashes, show "X new, Y duplicates" summary
7. **Error reporting** -- list rows with parse errors, allow importing valid rows
8. **Import execution** -- INSERT OR IGNORE with dedup hash, then `categorizeNewTransactions()` + `detectTransferCandidates()`
9. **Success summary** -- "Imported X transactions, skipped Y duplicates, Z errors"

### Defer

- **Import history log**: Nice but not needed for a one-time migration. Add if import becomes recurring.
- **"Create account" inline**: User can create accounts beforehand via the existing Accounts page.
- **Multiple format support**: Only needed if a second CSV source appears.

## Wizard Flow (Recommended UX)

Based on established CSV import UX patterns (Smashing Magazine, industry standard):

### Step 1: Upload
- Full-page drop zone with dashed border
- "Drop your Monarch Money CSV here" + browse button
- Accept `.csv` files only
- Parse immediately on upload, show loading spinner

### Step 2: Preview + Mapping
- Show parsed row count and first 5 sample rows in a table
- Show any parse errors (invalid dates, bad amounts) highlighted in red
- Account mapping section: each unique Monarch account name -> dropdown of Minerva accounts (auto-matched where possible)
- Category mapping section: each unique Monarch category -> dropdown of Minerva categories (auto-matched where possible, with "Uncategorized" default)
- "Analyze" button to compute dedup stats with mapped account IDs

### Step 3: Confirm + Import
- Summary: "Ready to import X transactions (Y duplicates will be skipped, Z rows have errors)"
- Show error rows if any, with option to proceed without them
- "Import" button (primary action)
- Progress indication (for large files: "Importing... X of Y")
- On completion: success banner with counts, link to Transactions page

### Why 3 Steps, Not More
The import is a one-time Monarch migration for a single user. Three steps (upload -> map -> confirm) match the standard wizard pattern without over-engineering. Each step has a clear purpose and the user never sees more than one decision at a time.

## Existing System Integration Points

### Dedup Hash Reuse
The existing `generateDedupHash(accountId, date, amount, payee)` in `simplefin-client.ts` produces a SHA-256 hash from `${accountId}|${date}|${amount}|${payee}`. For CSV import, the same function must be used with:
- `accountId` = the Minerva account ID from the mapping (not the Monarch account name)
- `date` = normalized to `YYYY-MM-DD` format
- `amount` = integer cents (converted from Monarch's decimal dollars)
- `payee` = the "Original Statement" column (raw bank string), NOT the "Merchant" column (user-edited in Monarch)

Using "Original Statement" as the payee ensures dedup hashes match transactions already synced via SimpleFIN (which uses the raw bank payee string).

### Rules Engine
`categorizeNewTransactions(db, transactionIds)` accepts an array of new transaction IDs and applies the most-specific matching rule. Imported transactions with a Monarch category mapping should be inserted with `category_id` set (from the mapping) but `rule_id` as NULL -- this makes them "manually categorized" and the rules engine will skip them. Transactions mapped to "Uncategorized" (NULL category_id) will be picked up by the rules engine.

### Transfer Detection
`detectTransferCandidates()` looks for offsetting transactions across accounts within a date window. After importing, calling this will catch transfers that span imported + synced transactions.

### Transaction ID Generation
SimpleFIN provides transaction IDs as the primary key. CSV imports have no natural ID. Generate UUIDs (e.g. `crypto.randomUUID()`) prefixed with `csv-` to distinguish imported transactions from synced ones.

## Sources

- [Monarch Money CSV Import Help](https://help.monarch.com/hc/en-us/articles/4409682789908-Importing-Transaction-History-Manually) -- required columns, format flexibility
- [Monarch Money CSV Export Help](https://help.monarch.com/hc/en-us/articles/15526600975764-Downloading-Transaction-or-Account-History) -- export format reference
- [Monarch Money CSV format blog](https://blog.tracefunc.com/notes/monarch-money.html) -- confirmed 8 columns: Date, Merchant, Category, Account, Original Statement, Notes, Amount, Tags
- [Smashing Magazine: Designing Data Importers](https://www.smashingmagazine.com/2020/12/designing-attractive-usable-data-importer-app/) -- wizard UX patterns, error handling, column mapping
- [Smart Interface Design Patterns: Bulk Import UX](https://smart-interface-design-patterns.com/articles/bulk-ux/) -- step-by-step wizard flow
- [ImportCSV: Data Import UX](https://www.importcsv.com/blog/data-import-ux) -- preview, validation, deduplication patterns
- [YNAB File-Based Import Guide](https://support.ynab.com/en_us/file-based-import-a-guide-Bkj4Sszyo) -- account selection, duplicate detection in finance apps
- [Beyond Budget CSV Import](https://www.beyondbudgetapp.com/import-transactions/csv) -- finance-specific CSV import reference
