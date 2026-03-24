# Technology Stack

**Project:** Minerva Money v2.3 CSV Import
**Researched:** 2026-03-24
**Confidence:** HIGH
**Scope:** NEW capabilities only -- CSV/TSV parsing, file upload handling, validation

## Context: Subsequent Milestone

The core stack (React 19, Vite 6, Tailwind CSS v4, tRPC 11, TanStack Query, Express 4, better-sqlite3, Zod 4) is validated and unchanged. This document covers only what v2.3 adds.

**v2.3 goal:** Import transaction history from Monarch Money CSV exports into Minerva Money with deduplication, account/category mapping, and rules engine integration.

**Existing patterns to preserve:**
- tRPC-only API (no Express middleware for uploads)
- `INSERT OR IGNORE` with `dedup_hash` UNIQUE constraint for deduplication
- `generateDedupHash(accountId, date, amount, payee)` in `simplefin-client.ts`
- Rules engine `applyRule()` for post-insertion categorization
- Zod 4 for all input validation

---

## Recommended Stack

### New Dependencies

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `csv-parse` | ^5.6.0 | Parse CSV/TSV transaction files on the server | Mature library (2840+ npm dependents), zero external dependencies, sync API returns parsed objects immediately, configurable delimiter for both comma and tab formats. Active maintenance (last published March 2026). |

**One new package. That is all.**

### No New Client Dependencies

File reading uses the built-in browser `File.text()` API. No file upload library needed.

### No New Validation Dependencies

Zod 4 (already installed at `^4.3.6`) handles all validation for parsed rows and tRPC input schemas.

---

## CSV Parsing: `csv-parse` Sync API

**Import path:** `csv-parse/sync` -- synchronous, non-streaming parsing.

**Why sync over streaming:** Transaction CSV files are small (even 10,000 rows is < 5MB). The entire file content arrives as a string in a tRPC mutation. Streaming adds complexity with zero benefit here. The sync API takes a string and returns an array of objects -- perfect for the request/response model.

**Configuration for this project:**

```typescript
import { parse } from 'csv-parse/sync';

const records = parse(fileContent, {
  delimiter: detectedDelimiter, // '\t' or ','
  columns: true,                // first row becomes object keys
  skip_empty_lines: true,       // ignore blank lines
  trim: true,                   // strip whitespace from values
  relax_column_count: true,     // tolerate rows with fewer columns (e.g., missing Tags)
  bom: true,                    // strip UTF-8 BOM if present (Excel exports often include this)
});
// records: Array<Record<string, string>>
```

**Delimiter auto-detection:** `csv-parse` does not auto-detect delimiters, but detection is trivial:

```typescript
function detectDelimiter(content: string): string {
  const firstLine = content.split('\n')[0];
  if (firstLine.includes('\t')) return '\t';
  return ',';
}
```

This makes the importer work for both comma-CSV and tab-TSV files without user configuration.

---

## Monarch Money Export Format

**Columns (8 total):** Date, Merchant, Category, Account, Original Statement, Notes, Amount, Tags

**Format:** Standard comma-delimited CSV (not tab-delimited). The PROJECT.md reference to "tab-delimited Monarch format" appears inaccurate based on Monarch's documentation and community tooling -- their exports use standard CSV. However, some users may re-export as TSV from spreadsheet software, so supporting both delimiters is prudent.

**Amount format:** Positive for income, negative for expenses (as decimal dollars, e.g., `-45.67`). Must be converted to integer cents for storage.

**Confidence:** MEDIUM -- based on third-party documentation (blog.tracefunc.com) consistent with Monarch help articles. Direct verification against an actual export file is recommended before implementation.

---

## File Upload: Client-Side FileReader

**Approach:** Read file as text on the client, send the string content via tRPC mutation.

**Why NOT server-side multipart upload:**
- Transaction CSVs are small (< 10MB)
- tRPC mutations accept string payloads natively as JSON fields
- Avoids adding `multer`, `busboy`, or `formidable` Express middleware
- Preserves the existing tRPC-only API pattern (no raw Express routes)
- Simpler error handling -- Zod validates the string content on the server

**Client-side pattern:**

```typescript
// Modern File API -- cleaner than FileReader event callbacks
const file = inputRef.current.files[0];
const text = await file.text(); // Returns Promise<string>
// Send as string field in tRPC mutation
const preview = await trpc.import.preview.mutate({ content: text });
```

`File.text()` is supported in Chrome 76+, Firefox 69+, Safari 14+ -- all modern browsers.

**File input element:**

```tsx
<input
  type="file"
  accept=".csv,.tsv,.txt"
  onChange={handleFileSelect}
  className="..." // Style with Tailwind to match app
/>
```

No `react-dropzone` or drag-and-drop library needed. A styled file input is sufficient for a single-user app.

---

## What NOT to Add

| Library | Why NOT | Use Instead |
|---------|---------|-------------|
| `multer` / `busboy` / `formidable` | Multipart upload is unnecessary. Adds Express middleware that breaks the clean tRPC-only pattern. | Client `file.text()` + tRPC string mutation |
| `papaparse` | Browser-focused library with auto-detection features we don't need. `csv-parse` is the standard Node.js choice with better TypeScript support and a dedicated sync API. | `csv-parse` |
| `fast-csv` | Viable but `csv-parse` has more downloads, better docs, and cleaner sync API. | `csv-parse` |
| `joi` / `yup` / `ajv` | Zod 4 already handles all validation. Adding another library is redundant. | Zod 4 (already installed) |
| `react-dropzone` | Over-engineered for a simple file input. Single-user app doesn't need drag-and-drop polish. | Native `<input type="file">` styled with Tailwind |
| Manual `String.split('\t')` | Fails on edge cases: quoted fields containing delimiters, escaped quotes, fields with embedded newlines. `csv-parse` handles all of these correctly. | `csv-parse` |
| `xlsx` / `exceljs` | Excel format support is out of scope. Users can export CSV from any spreadsheet app. | CSV/TSV only |

---

## Integration Points

### Existing Code to Reuse

| Component | Location | Integration |
|-----------|----------|-------------|
| `generateDedupHash()` | `packages/server/src/sync/simplefin-client.ts` | Same hash formula (account+date+amount+payee) for imported transactions. **Extract to a shared utility** so both sync and import can use it without importing SimpleFIN code. |
| Transaction INSERT | `packages/server/src/sync/sync-service.ts` | Same `INSERT OR IGNORE INTO transactions` with `dedup_hash` UNIQUE constraint. Imported transactions that match synced ones are silently skipped. |
| Rules engine | `packages/server/src/rules/rules-service.ts` | Run rules on imported transactions post-import, same as the sync flow does. |
| Account list | Existing tRPC procedure | Needed for the mapping UI -- user maps CSV "Account" strings to existing Minerva account IDs. |
| Category list | `packages/server/src/categories/category-service.ts` | Needed for the mapping UI -- user maps CSV "Category" strings to existing Minerva category IDs. |

### New Code to Create

| Component | Location | Purpose |
|-----------|----------|---------|
| CSV parse service | `packages/server/src/import/` | Parse content, detect delimiter, validate rows, extract unique accounts/categories for mapping |
| Import tRPC router | `packages/server/src/import/` | `preview` mutation (parse + return mappings) and `execute` mutation (import with confirmed mappings) |
| Import page | `packages/client/src/pages/ImportPage.tsx` | File upload, preview table, account/category mapping dropdowns, confirm/import button |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| CSV parsing | `csv-parse` (sync) | Manual `split()` | Breaks on quoted fields, escaped characters, embedded newlines |
| CSV parsing | `csv-parse` (sync) | `papaparse` | Browser-focused, heavier, auto-detection unnecessary |
| CSV parsing | `csv-parse` (sync) | `csv-parse` (streaming) | Overkill for <10MB files in a request/response model |
| File upload | Client `file.text()` | Server multipart upload | Adds middleware, breaks tRPC pattern, unnecessary for small files |
| File upload | `file.text()` | `FileReader` API | `file.text()` is the modern Promise-based replacement |
| Validation | Zod 4 | Additional library | Already installed and used everywhere |

---

## Installation

```bash
# Single new dependency (server only)
npm install csv-parse --workspace=packages/server
```

---

## Sources

- [csv-parse official documentation](https://csv.js.org/parse/) -- sync API, options reference
- [csv-parse sync API docs](https://csv.js.org/parse/api/sync/) -- import path, usage examples
- [csv-parse on npm](https://www.npmjs.com/package/csv-parse) -- version, download stats, dependents
- [Monarch Money export format](https://blog.tracefunc.com/notes/monarch-money.html) -- column headers: Date, Merchant, Category, Account, Original Statement, Notes, Amount, Tags
- [Monarch Money import help](https://help.monarch.com/hc/en-us/articles/4409682789908-Importing-Transaction-History-Manually) -- 8-column format, keyword-based mapping
- [Monarch Money download history](https://help.monarch.com/hc/en-us/articles/15526600975764-Downloading-Transaction-or-Account-History) -- CSV export documentation

---
*Stack research for: Minerva Money v2.3 CSV Import*
*Researched: 2026-03-24*
