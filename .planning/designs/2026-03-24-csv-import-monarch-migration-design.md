# CSV Import for Monarch Money Migration — Design

**Date:** 2026-03-24
**Approach:** Server-Side Import with Simple Upload UI

## CSV Parsing & Validation Service

The server gets a new module at `packages/server/src/import/` with two files:

**`csv-parser.ts`** — Parses Monarch Money CSV format (tab-delimited based on the sample data). Validates required columns exist (`Date`, `Merchant`, `Category`, `Account`, `Amount`). Returns structured rows:

```typescript
interface CsvRow {
  date: string;       // "2026-03-24" (already ISO-ish from Monarch)
  merchant: string;   // "PayPal"
  category: string;   // "Entertainment & Recreation"
  account: string;    // "CASHBACK DEBIT (...4271)"
  originalStatement: string;
  notes: string;
  amount: number;     // -18.32 (dollars, converted to cents on import)
  tags: string;
  owner: string;
}
```

**`import-service.ts`** — Orchestrates the import flow:
1. `parseAndValidate(csvContent: string)` → returns parsed rows + extracted unique accounts and categories for mapping
2. `executeImport(rows, accountMap, categoryMap)` → inserts transactions in a single SQLite transaction, converts amounts to cents, generates dedup hashes, runs rules engine on all new transaction IDs

Validation rejects rows with missing date, merchant, or amount. Invalid dates or non-numeric amounts are flagged with row numbers in the error response.

## tRPC API Endpoints

Two new endpoints added to a new `import` nested router in `trpc-router.ts`:

**`import.preview`** (mutation) — Accepts the raw CSV string content. Calls `parseAndValidate()`. Returns:
```typescript
{
  rows: CsvRow[];           // All parsed rows for display
  uniqueAccounts: string[]; // Distinct account names from CSV
  uniqueCategories: string[]; // Distinct category names from CSV
  existingAccounts: Array<{ id: string; name: string }>;  // Current Minerva accounts for mapping dropdowns
  existingCategories: Array<{ id: number; name: string; groupName: string }>; // Current categories
  errors: Array<{ row: number; message: string }>; // Validation errors
}
```

**`import.execute`** (mutation) — Accepts:
```typescript
{
  csvContent: string;  // Re-parsed server-side for safety
  accountMap: Record<string, string>;   // CSV account name → Minerva account ID
  categoryMap: Record<string, number>;  // CSV category name → Minerva category ID (unmapped = skip)
}
```

Returns `{ imported: number; skipped: number; errors: string[] }`.

The CSV content is sent as a string (not file upload) since Monarch exports are typically small (< 1MB). The client reads the file via `FileReader` and sends the text content.

## Import Page UI

A new `ImportPage` at `/import`, accessible from the "More" sheet on mobile and the nav bar on desktop.

**Single-screen layout with three collapsible sections:**

1. **Upload Section** — File input (`<input type="file" accept=".csv">`) with a drag-drop zone. On file select, reads the file client-side and calls `import.preview`. Shows row count and any validation errors.

2. **Mapping Section** (appears after successful preview) — Two mapping tables side by side (stacked on mobile):
   - **Account Mapping**: Left column shows each unique CSV account name, right column is a dropdown of existing Minerva accounts. All must be mapped to proceed.
   - **Category Mapping**: Left column shows each unique CSV category name, right column is a dropdown of existing Minerva categories (grouped by category group) with a "Skip" option. Unmapped categories default to "Skip".

3. **Confirm & Import Section** (appears after mapping complete) — Summary showing: total rows, rows that will import, rows that will be skipped (unmapped category), mapped accounts count, mapped categories count. An "Import" button triggers `import.execute`. After import, shows results (imported count, skipped count, any errors) with a link to the Transactions page.

Follows existing patterns: TanStack Query mutations, Tailwind styling, mobile-responsive with `max-md:` variants.

## Deduplication & Rules Integration

**Deduplication:** Each imported transaction gets a dedup hash using the existing `generateDedupHash(accountId, date, amount, payee)` formula. The `INSERT OR IGNORE` pattern (same as sync) prevents duplicate imports if the user accidentally imports the same CSV twice. This also prevents collisions with transactions already synced from SimpleFIN — if a Monarch transaction has the same account, date, amount, and payee as an existing synced transaction, it's silently skipped.

**Rules Engine:** After all transactions are inserted, the import service calls `categorizeNewTransactions(db, newTransactionIds)` — the same function used by the sync pipeline. This means:
- Rules that match will **override** the CSV-mapped category (per user preference)
- Transactions whose CSV category was "Skipped" still get categorized if a rule matches
- The specificity scoring and "most-specific-rule-wins" logic applies identically

**Transaction identity:** Imported transactions get `crypto.randomUUID()` as their ID (same as manual transactions), since Monarch CSV rows don't have SimpleFIN transaction IDs. The `pending` flag is set to `0` for all imports.

**Atomicity:** The entire import runs in a single SQLite transaction (`db.transaction()`). If any row fails, the whole import rolls back.

## Navigation & Routing

**Route:** `/import` added to the React Router config in `App.tsx`.

**Desktop nav:** "Import" link added to the top navigation bar, placed after the existing links.

**Mobile nav:** "Import" added to the "More" bottom sheet alongside Accounts, Categories, Rules, Transfers, and Reports.

No separate settings/admin section — Import is a top-level page like any other feature. This keeps it discoverable and consistent with the flat navigation pattern.
