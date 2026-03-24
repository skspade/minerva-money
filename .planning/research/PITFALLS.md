# Domain Pitfalls

**Domain:** CSV import for personal finance app (adding to existing app with bank sync)
**Researched:** 2026-03-24
**Confidence:** HIGH (patterns verified against existing codebase schema, dedup hash implementation, and shared `toCents()` function; amount parsing issues are well-documented JavaScript behavior)

## Critical Pitfalls

Mistakes that cause data corruption, incorrect balances, or require database cleanup.

### Pitfall 1: Floating-Point Cents Conversion Truncation

**What goes wrong:** Dollar amounts like `$19.99` parsed as floats and multiplied by 100 produce `1998.9999999999998` instead of `1999`. Using `Math.floor()`, `Math.trunc()`, or `parseInt()` without rounding silently drops a cent. Over thousands of imported transactions, cumulative error can reach dollars.

**Why it happens:** IEEE 754 floating-point cannot exactly represent most decimal fractions. `19.99 * 100 === 1998.9999999999998` in JavaScript. This is not a rare edge case -- it affects roughly 1 in 3 two-decimal dollar amounts.

**Consequences:** Budget math is off by pennies. Spending reports don't reconcile with source data. The error is silent and only discovered when totals don't match Monarch's exported totals.

**Prevention:** The shared `toCents()` function in `packages/shared/src/types.ts` already uses `Math.round()` -- use it for all CSV amount conversion. The import service must call `toCents(parseFloat(row.amount))`, never `parseInt(parseFloat(row.amount) * 100)` or any truncation variant. The design doc correctly says "converted to cents on import" -- enforce this by importing `toCents` from `@minerva/shared`.

**Detection:** Unit test with known problematic values: `19.99` (expect `1999`), `0.01` (expect `1`), `0.10` (expect `10`), `1.005` (expect `101`), `-18.32` (expect `-1832`). Verify `toCents(parseFloat("19.99")) === 1999`.

**Phase warning:** Must be correct in the very first implementation. Fixing after import means re-importing all data or running manual SQL corrections.

---

### Pitfall 2: Dedup Hash Mismatch Between CSV and Synced Transactions

**What goes wrong:** The existing dedup hash is `sha256(accountId|date|amount|payee)` (from `generateDedupHash` in `simplefin-client.ts`). For the same real-world transaction, the payee string from Monarch will almost certainly differ from SimpleFIN's payee string. Example: Monarch shows `"Amazon"` but SimpleFIN provides `"AMAZON.COM AMZN.COM/BILL WA"`. The hashes won't match and the import creates a duplicate of an already-synced transaction.

**Why it happens:** SimpleFIN passes raw bank strings directly. Monarch normalizes, truncates, and sometimes re-maps merchant names for display. The same transaction from the same bank will have different payee strings in each system.

**Consequences:** Duplicate transactions inflate spending reports and budget consumption. For any date range where Monarch and SimpleFIN overlap, every transaction is doubled. This is catastrophic for budget accuracy.

**Prevention:**
1. **Date range guidance is essential.** The import UI should ask users when they started SimpleFIN sync and warn if the CSV contains transactions after that date. For the Monarch migration use case, users should import only historical transactions that predate their SimpleFIN connection.
2. The design's `INSERT OR IGNORE` on `dedup_hash` handles exact hash matches (e.g., re-importing the same CSV twice). It will NOT catch cross-source duplicates with different payee strings.
3. Show separate counts in import results: "N imported, M skipped (already exist), K skipped (unmapped category)" so users can verify dedup is working.
4. Do NOT try to normalize payee strings for fuzzy matching -- this introduces false positives and complexity. Accept the limitation and mitigate via date range guidance.

**Detection:** After import, query for transactions with the same account + date + absolute amount but different IDs. If these exist in overlapping date ranges, warn the user.

**Phase warning:** The import UI should surface the overlap risk prominently. The import service itself cannot solve this -- it's a UX/guidance problem.

---

### Pitfall 3: Amount Sign Convention Mismatch

**What goes wrong:** Monarch exports expenses as negative numbers (`-18.32`) and income as positive (`2500.00`). If the import blindly passes these through, the sign must match what Minerva already stores. A sign flip means every expense appears as income and vice versa.

**Why it happens:** There is no universal standard. Some bank exports use positive for debits (you spent money). Monarch uses the opposite convention (negative = expense = balance decreased). The existing Minerva codebase stores expenses as negative cents (from SimpleFIN, which also uses negative for debits).

**Consequences:** All imported transactions have inverted amounts. Budget spending shows as zero. Income appears doubled. Requires complete re-import.

**Prevention:** The conventions match: Monarch negative = expense, SimpleFIN negative = expense, Minerva DB negative = expense. But this MUST be verified with actual Monarch export data before coding. Add a unit test that imports a Monarch row with amount `-18.32` and verifies it becomes `-1832` cents in the database. If the convention doesn't match, a single `* -1` fixes it, but it must be discovered before the first real import.

**Detection:** Import 5-10 known transactions and verify amounts match expected signs. Check that expenses are negative and income is positive.

**Phase warning:** Validate with real Monarch export data in the first implementation phase. A sign flip after a full import is catastrophic.

---

### Pitfall 4: UTF-8 BOM Corrupts First Column Header

**What goes wrong:** The design sends CSV content as a string via tRPC. The client reads the file with `FileReader.readAsText()` (defaults to UTF-8). If the Monarch CSV contains a UTF-8 BOM (`\uFEFF`), that invisible character becomes the first character of the first column header. The parser sees `"\uFEFFDate"` instead of `"Date"` and fails to find the required `Date` column.

**Why it happens:** Excel and some Windows tools prepend a UTF-8 BOM (byte order mark) to CSV files. Users who open and re-save a Monarch CSV in Excel will have a BOM. `FileReader.readAsText()` does not strip it.

**Consequences:** The parser fails with a confusing "missing required column: Date" error. The user sees all their data in the file but the app refuses to parse it. The error message gives no hint about the actual cause (an invisible character).

**Prevention:** Strip BOM as the very first step of parsing:
```typescript
csvContent = csvContent.replace(/^\uFEFF/, '');
```
This is a single line of code but easy to forget. If using PapaParse, it handles BOM automatically.

**Detection:** Test with a CSV string that starts with `\uFEFF`. Verify headers are still parsed correctly.

**Phase warning:** Address in the CSV parser implementation. One-line fix, but produces an invisible and confusing bug if missed.

## Moderate Pitfalls

### Pitfall 5: Date Format Ambiguity

**What goes wrong:** The design assumes Monarch dates are "already ISO-ish" (`2026-03-24`). But Monarch may export dates as `03/24/2026`, `3/24/2026`, or even locale-dependent formats depending on user settings or export version. The string `01/02/2026` is January 2nd in US format but February 1st internationally. Using `new Date("01/02/2026")` gives locale-dependent results.

**Prevention:** Do NOT use `new Date()` or `Date.parse()` for CSV date parsing -- both are locale-dependent and unreliable. Use a deterministic regex-based parser:

```typescript
function parseDate(s: string): string {
  const trimmed = s.trim();
  // ISO: 2026-03-24
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // US: 03/24/2026 or 3/24/2026
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, m, d, y] = match;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  throw new Error(`Unrecognized date format: "${trimmed}"`);
}
```

Since this is a Monarch-specific parser, test with an actual Monarch export to determine the exact format, then support that format plus ISO as a fallback. The output must always be `YYYY-MM-DD` to match the existing `transactions.date` column format.

**Detection:** Unit tests with `"2026-03-24"`, `"03/24/2026"`, `"3/24/2026"`, and invalid inputs. Validate output is always `YYYY-MM-DD`.

---

### Pitfall 6: Tab-Delimited vs Comma-Delimited Confusion

**What goes wrong:** The PROJECT.md says "tab-delimited Monarch format" but Monarch's official documentation and community resources indicate the export is standard comma-delimited CSV. If the parser is hardcoded for tab separation, it treats each entire row as a single column and either crashes or produces garbage data.

**Prevention:** Auto-detect the delimiter by inspecting the header line:
```typescript
const delimiter = headerLine.includes('\t') ? '\t' : ',';
```
Or better: use PapaParse which auto-detects delimiters. The actual Monarch export format should be verified with a real exported file before finalizing the parser. Support both delimiters to be safe.

**Detection:** Test with both tab-delimited and comma-delimited input. Verify both produce the correct number of columns.

---

### Pitfall 7: Naive String Split Instead of Proper CSV Parsing

**What goes wrong:** A manual `line.split(',')` parser breaks on:
- Merchant names with commas: `"Walmart Supercenter, #1234"` splits into two columns
- Notes with embedded newlines: a quoted field spanning two lines is treated as two rows
- Fields with escaped quotes: `"He said ""hello"""` is mangled

This shifts all subsequent columns in the row, causing amount to be parsed from the wrong field (or failing entirely).

**Prevention:** Use PapaParse (or equivalent RFC 4180-compliant parser). Do not write a manual split-based parser. PapaParse handles: quoted fields, embedded commas, embedded newlines, escaped double-quotes, BOM stripping, delimiter detection, and header row mapping. It's 14KB gzipped and battle-tested.

```bash
npm install papaparse
npm install -D @types/papaparse
```

PapaParse can run on the server side (Node.js) for the tRPC endpoint.

**Detection:** Test with merchant names containing commas, double quotes, and newlines. Verify all columns parse correctly.

---

### Pitfall 8: Empty and Whitespace-Only Field Handling

**What goes wrong:** CSV rows may have empty fields for optional columns (Notes, Tags, Original Statement). The parser produces empty strings `""`, but downstream code may:
- Insert `"undefined"` or `"null"` as literal strings if checking `if (!value)` and then using a template literal
- Insert empty strings where `NULL` is expected (the `payee` column in transactions is nullable `TEXT`)
- Fail validation on rows where optional fields are missing entirely (trailing delimiter absent)
- Treat whitespace-only strings (` ` or `\t`) as valid data

**Prevention:**
- Trim all field values immediately after parsing
- Map empty/whitespace-only strings to `null` for nullable database columns (`payee`, `memo`)
- Validate only required fields (date, amount, account) for non-empty after trimming
- Merchant/payee should never be `undefined` -- use `null` or the original statement as fallback

**Detection:** Test with rows where: Notes is empty, Tags is missing (no trailing comma), Merchant is whitespace-only, Original Statement contains only spaces.

---

### Pitfall 9: Category Mapping "Skip" Creates Mass Uncategorized Transactions

**What goes wrong:** The design allows "Skip" for unmapped categories. If Monarch uses different category names than Minerva (likely), a user who doesn't carefully map each one ends up with hundreds of uncategorized transactions. These flood the "Uncategorized" section of the budget page, making it noisy and the budget useless until manually categorized.

**Prevention:**
1. **Show the impact before confirming:** "47 transactions (23%) will be imported without a category" is much more alarming than a quiet "Skip" default.
2. **Pre-match by name similarity:** Auto-suggest Minerva categories that fuzzy-match Monarch names (e.g., "Entertainment & Recreation" matches "Entertainment"). Case-insensitive exact match first, then substring match. Don't require the user to manually map 30+ categories when most are obvious matches.
3. **Rules engine mitigates:** The design correctly runs `categorizeNewTransactions` post-import. Existing rules will catch transactions matching known merchants, even if the category mapping was skipped.
4. After import, show: "N transactions categorized by rules, M remain uncategorized."

**Detection:** Import a CSV with Monarch category names that don't exactly match Minerva categories. Verify the mapping UI surfaces this clearly and the post-import summary shows uncategorized count.

---

### Pitfall 10: Account Mapping Without Sufficient Context

**What goes wrong:** Monarch account names like `"CASHBACK DEBIT (...4271)"` don't obviously correspond to Minerva account names like `"Discover Checking"`. The user must mentally match accounts, and a wrong mapping puts transactions under the wrong account, skewing all account-level reports and net worth calculations.

**Prevention:**
- Show institution name and account type alongside both Monarch and Minerva account names in the mapping dropdown
- If Monarch names include last-4 digits of account numbers, surface those prominently
- Consider showing a sample transaction from each CSV account to help identification
- There's no automated solution -- this is a UX problem. Make the mapping UI as informative as possible.

**Detection:** Post-import, the user should verify a few known transactions appear under the correct account.

## Minor Pitfalls

### Pitfall 11: Transaction ID Generation Without Source Tracking

**What goes wrong:** The design uses `crypto.randomUUID()` for imported transaction IDs. This works but provides no way to distinguish imported transactions from synced or manual ones. If a bug is later discovered in the import (e.g., sign was flipped), there's no easy way to find and delete/fix only the imported transactions.

**Prevention:** Use a consistent UUID prefix or add an `import_source` column (or tag) to track provenance. A simpler approach: log the import batch with a timestamp and the set of created transaction IDs, so a rollback query can target them. Even just storing the import results (list of IDs) in the import log is sufficient.

**Detection:** After a test import, verify you can identify which transactions came from the import vs. sync.

---

### Pitfall 12: Re-Import Produces Confusing "0 Imported" Result

**What goes wrong:** User imports the same CSV twice. The second attempt silently skips all rows due to dedup hash matches. The user sees "0 imported, 500 skipped" and thinks the import is broken.

**Prevention:** Make skip reasons explicit in the result: "500 transactions skipped (already exist in database)". Distinguish from "skipped due to unmapped category." The UI should explain that this means the data was already imported successfully.

**Detection:** Unit test: import the same CSV twice. Verify second import returns `{ imported: 0, skipped: 500, errors: [] }` with a clear "already exists" reason.

---

### Pitfall 13: Rules Engine Silently Overrides Mapped Categories

**What goes wrong:** The design doc states: "Rules that match will override the CSV-mapped category." A user carefully maps Monarch's "Groceries" to Minerva's "Groceries" category, but an existing rule matching the merchant `"Trader Joe's"` re-categorizes those transactions to "Food & Dining." The user doesn't understand why some transactions have the wrong category after import.

**Prevention:** This is intentional behavior (documented in the design as "per user preference"). But the import results should surface it: "N transactions re-categorized by rules engine." This is informational, not an error. The user can adjust rules if the behavior is undesired.

**Detection:** Import transactions matching existing rules. Verify the rules engine ran and the import results report the re-categorization count.

---

### Pitfall 14: Line Ending Inconsistency (CRLF vs LF)

**What goes wrong:** Windows-generated CSVs use `\r\n` line endings. If the parser splits on `\n` only, each field in the last column retains a trailing `\r`. This corrupts the last column value (e.g., Tags becomes `"Travel\r"` instead of `"Travel"`). If the last column is used in a hash or comparison, the invisible `\r` causes mismatches.

**Prevention:** PapaParse handles this automatically. If writing a custom parser, normalize line endings first: `content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')`. Or trim each field value after parsing.

**Detection:** Test with a CSV using `\r\n` line endings. Verify the last column of each row has no trailing `\r`.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| CSV parser implementation | BOM handling (#4), delimiter detection (#6), quoted fields (#7), line endings (#14) | Use PapaParse; strip BOM as first step; auto-detect delimiter |
| Amount conversion | Floating-point truncation (#1), sign convention (#3) | Use `toCents()` from `@minerva/shared`; verify Monarch sign convention with real export data |
| Date parsing | Format ambiguity (#5) | Regex-based parser, not `new Date()`; test with actual Monarch export file |
| Dedup integration | Hash mismatch between CSV and synced data (#2) | Surface overlap risk in UI; advise importing only pre-sync historical data; show skip counts |
| Import service | Empty fields (#8), transaction provenance (#11) | Trim and null-check all fields; log import batch with transaction IDs |
| Mapping UI | Category orphans (#9), account identification (#10) | Show uncategorized count before confirm; show account metadata in dropdowns; auto-suggest fuzzy matches |
| Post-import UX | Re-import confusion (#12), rules override surprise (#13) | Clear messaging with distinct skip reasons; show re-categorization count |

## Sources

- Existing codebase: `packages/shared/src/types.ts` -- `toCents()` uses `Math.round(dollars * 100)`. HIGH confidence.
- Existing codebase: `packages/server/src/sync/simplefin-client.ts` -- `generateDedupHash` formula is `sha256(accountId|date|amount|payee)`. HIGH confidence.
- Existing codebase: `packages/server/migrations/001-initial-schema.sql` -- `dedup_hash` has UNIQUE index with WHERE NOT NULL. HIGH confidence.
- Design doc: `.planning/designs/2026-03-24-csv-import-monarch-migration-design.md` -- design decisions and integration approach. HIGH confidence.
- [Monarch Money CSV format](https://blog.tracefunc.com/notes/monarch-money.html) -- columns: Date, Merchant, Category, Account, Original Statement, Notes, Amount, Tags. MEDIUM confidence (third-party source).
- [Monarch Money import documentation](https://help.monarch.com/hc/en-us/articles/4409682789908-Importing-Transaction-History-Manually) -- CSV import requirements. MEDIUM confidence (could not fetch, 403).
- [Monarch Money large file import](https://help.monarch.com/hc/en-us/articles/7583213629204-Importing-Large-CSV-Files) -- file size limitations. MEDIUM confidence.
- IEEE 754 floating-point behavior (`19.99 * 100 !== 1999`) -- well-documented JavaScript behavior. HIGH confidence.

---
*Pitfalls research for: Minerva Money v2.3 CSV Import*
*Researched: 2026-03-24*
