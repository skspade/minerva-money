# Project Research Summary

**Project:** Minerva Money v2.3 CSV Import (Monarch Money Migration)
**Domain:** Personal finance CSV import with deduplication and account/category mapping
**Researched:** 2026-03-24
**Confidence:** HIGH

## Executive Summary

Minerva Money v2.3 adds a one-time migration path from Monarch Money by importing its CSV export format. This is a well-bounded problem: Monarch exports a fixed 8-column CSV (Date, Merchant, Category, Account, Original Statement, Notes, Amount, Tags), and the existing Minerva architecture already provides every building block needed — dedup hash generation, transaction insertion, rules engine invocation, and transfer detection. The entire feature requires exactly one new server dependency (`csv-parse`) and three new files (`import-service.ts`, `import-router.ts`, `ImportPage.tsx`).

The recommended approach is a stateless 3-step wizard: upload the file on the client, send CSV text via a tRPC mutation, present a preview with account and category mapping dropdowns, then execute the import with confirmed mappings. No server-side session state, no multipart upload, no new client dependencies. The server re-parses the CSV on execute — a sub-millisecond cost that eliminates state management complexity. Post-insert, the existing rules engine runs first, then CSV-mapped categories apply as fallback for unmatched transactions.

The primary risk is cross-source deduplication: Monarch normalizes merchant names ("Amazon") while SimpleFIN provides raw bank strings ("AMAZON.COM AMZN.COM/BILL WA"). The `dedup_hash` mechanism will NOT deduplicate these as the same transaction. The mitigation is UX guidance, not code — the import UI must warn users to import only historical transactions predating their SimpleFIN connection start date. Secondary risks (floating-point cents truncation, UTF-8 BOM corruption, delimiter ambiguity) all have clear, tested solutions documented in research.

## Key Findings

### Recommended Stack

The core stack is unchanged. v2.3 adds exactly one new server dependency: `csv-parse@^5.6.0` for RFC-4180-compliant CSV parsing with a synchronous API suited to the tRPC request/response model. The client reads files using the native `File.text()` browser API, eliminating any need for upload libraries. All validation remains with the existing Zod 4 installation.

**Core technologies:**
- `csv-parse` (^5.6.0): Server-side CSV/TSV parsing — mature library (2840+ npm dependents), zero external dependencies, sync API handles sub-10MB files cleanly; `bom: true` option strips UTF-8 BOM automatically
- `File.text()` (browser built-in): Client-side file reading — modern Promise-based API replacing FileReader callbacks, no library needed, all current browsers supported
- Zod 4 (already installed at ^4.3.6): tRPC input validation — no additional schema library justified

Full details: `.planning/research/STACK.md`

### Expected Features

The import wizard follows established finance app patterns (YNAB, Beyond Budget) with a 3-step flow: upload, map, confirm.

**Must have (table stakes):**
- File upload with drag-and-drop zone — universal UX signal for file inputs in data import flows
- Data preview with first 10 rows and total row count — users need visual confirmation before committing
- Account mapping UI with auto-suggest — Monarch account names never match Minerva account names exactly
- Category mapping UI with auto-suggest — same mismatch problem; default unmapped to "Uncategorized"
- Duplicate detection with count shown before import — user will likely have overlap with SimpleFIN-synced data
- Error reporting per row with option to import valid rows — missing date/amount must not silently drop rows
- Import confirmation screen (X new, Y skipped, Z errors) — final review before write operation
- Post-import rules engine run — existing rules apply to imported transactions identically to synced ones
- Post-import transfer detection — catches transfers spanning historical imports and live sync data

**Should have (differentiators):**
- Auto-match accounts by name similarity (case-insensitive substring match)
- Auto-match categories by exact name
- Dry-run dedup stats before confirming (show exact new vs. duplicate vs. error counts)
- Import history log (timestamp, filename, row counts) for auditability
- Clear messaging on re-import: "500 skipped — already exist" vs. silent zero count

**Defer to v2+:**
- Generic CSV column mapping UI — only Monarch format needed; add format selector if a second source appears
- Tag import — Minerva has no tag system; ignore Tags column silently
- Balance history import — Minerva calculates balances from transactions; historical snapshots will be incomplete
- Undo/rollback — provide clear preview instead; manual deletion via date-range filter is sufficient
- Inline account creation during import — user creates accounts beforehand via Accounts page

Full details: `.planning/research/FEATURES.md`

### Architecture Approach

The import feature is a thin vertical slice through the existing architecture: a new `import/` module under `packages/server/src/` (matching the `sync/`, `categories/`, `rules/` pattern), a new tRPC router added to `appRouter` as the 14th nested router, and a new `ImportPage.tsx` in the client. The import service reuses `generateDedupHash()`, `categorizeNewTransactions()`, `detectTransferCandidates()`, and `toCents()` directly — no modifications to those modules. Only 5 existing files need changes, totaling approximately 15 lines.

**Major components:**
1. `import-service.ts` — Parse CSV, validate rows, transform to transaction rows, bulk insert with `INSERT OR IGNORE`, invoke rules + transfer detection, apply CSV category fallback for unmatched transactions
2. `import-router.ts` — tRPC router with two mutations: `preview` (parse + extract unique accounts/categories + dedup stats) and `execute` (re-parse + insert with confirmed mappings)
3. `ImportPage.tsx` — 3-step wizard UI: file upload -> preview + mapping -> confirm + result summary

**Category handling priority (key architectural decision — order matters):**
1. Rules engine runs first via `categorizeNewTransactions()` — identical to sync behavior; sets `category_id` AND `rule_id`
2. CSV-mapped categories apply as fallback via `applyCsvCategoryFallback()` — only for transactions still uncategorized after rules; sets `category_id`, leaves `rule_id` NULL
3. Users can override later via TransactionsPage

**Express body limit must be raised** from the default 100KB to 10MB to accommodate CSV file content sent as a JSON string in the tRPC mutation body.

Full details: `.planning/research/ARCHITECTURE.md`

### Critical Pitfalls

1. **Floating-point cents truncation** — `19.99 * 100` produces `1998.999...` in JavaScript; `Math.floor()` silently drops a cent. Use `toCents()` from `@minerva/shared` exclusively — it uses `Math.round()`. Unit test with known values: `19.99 -> 1999`, `-18.32 -> -1832`.

2. **Dedup hash mismatch across sources** — Monarch stores "Amazon"; SimpleFIN stores "AMAZON.COM AMZN.COM/BILL WA". The `INSERT OR IGNORE` + `dedup_hash` mechanism will NOT catch these as the same transaction. Mitigation is UX only: prominently warn users to import data predating their SimpleFIN connection. Do not attempt payee normalization — false positives are worse than duplicates.

3. **Amount sign convention** — Monarch (negative = expense) should match SimpleFIN and Minerva conventions, but this MUST be verified against a real Monarch export before first implementation. A sign flip after a full import requires complete re-import.

4. **UTF-8 BOM corrupts first column header** — Files re-saved from Excel prepend `\uFEFF`. The parser sees `"\uFEFFDate"` instead of `"Date"` and fails with a confusing "missing required column" error. Use `csv-parse` with `bom: true` option — it strips BOM automatically.

5. **Delimiter ambiguity** — PROJECT.md says "tab-delimited" but Monarch documentation indicates standard comma CSV. A hard-coded tab delimiter treats the entire first row as one column. Auto-detect with: `headerLine.includes('\t') ? '\t' : ','` before calling `csv-parse`.

Full details: `.planning/research/PITFALLS.md`

## Implications for Roadmap

Based on research, the build order follows natural dependency flow: service logic must exist before the API, and the API must exist before the UI. Two phases is the right split.

### Phase 1: Import Service and API

**Rationale:** Service logic and tRPC API can be built and fully tested independently of UI. The import service encapsulates all the tricky logic — parsing, dedup, cents conversion, date normalization, category fallback. Getting this right with unit tests before building UI prevents UI-driven debugging of backend issues. All integration points are directly observable in the existing codebase.

**Delivers:** Working `import-service.ts` with full test coverage, `import-router.ts` wired into `appRouter`, Express body limit raised to 10MB. The API is callable before any UI exists.

**Addresses features:** CSV parsing, dedup detection, rules engine integration, transfer detection, amount conversion, error reporting per row, post-import categorization

**Avoids pitfalls:** Floating-point truncation (use `toCents()`), BOM handling (`bom: true`), delimiter auto-detection, dedup hash alignment with `generateDedupHash()`, sign convention validation via unit tests

**Research flag:** No additional research needed — all patterns directly derived from existing codebase inspection (HIGH confidence). Validate Monarch CSV format (delimiter, date format, sign convention) with a real export file at the start of this phase before finalizing the parser.

### Phase 2: Import UI (3-Step Wizard)

**Rationale:** Depends on Phase 1 API. The UI calls `preview` and `execute` mutations. Account and category mapping logic is entirely presentational once the API returns unique names and auto-suggestions. Standard React form/wizard pattern with Tailwind styling matching existing app conventions.

**Delivers:** `ImportPage.tsx` with 3-step wizard (upload -> preview + mapping -> confirm + result), navigation entries in Layout and MoreSheet, route in App.tsx.

**Addresses features:** File upload with drag-and-drop, data preview table, account/category mapping dropdowns with auto-suggest, duplicate count warning, date range overlap warning (key UX mitigation for cross-source dedup), success summary with categorization breakdown

**Avoids pitfalls:** Cross-source dedup (overlap date range warning in UI), category orphans (show uncategorized count before confirm), account misidentification (show institution/account type in mapping dropdowns), re-import confusion (explicit "already exists" skip reason in result)

**Research flag:** Standard React wizard pattern — no additional research needed. Mobile layout follows existing mobile card patterns from v2.2.

### Phase Ordering Rationale

- Service-first order mirrors the existing codebase pattern — every feature has a service layer tested independently before UI
- The stateless preview/execute design cleanly decouples phases: Phase 1 can be verified via tRPC mutation before Phase 2 starts
- Critical pitfall mitigations are concentrated in Phase 1 where unit tests can catch them; Phase 2 is primarily UX work with lower risk
- The `applyCsvCategoryFallback()` function must be implemented in Phase 1 alongside `executeImport()` — the category priority logic is a service concern, not a UI concern

### Research Flags

Phases with well-documented patterns (skip additional research):
- **Phase 1 (Import Service):** All integration points directly observed in codebase. `generateDedupHash`, `categorizeNewTransactions`, `detectTransferCandidates`, `toCents`, and `INSERT OR IGNORE` pattern are confirmed from source. HIGH confidence.
- **Phase 2 (Import UI):** Standard React wizard, existing Tailwind/React patterns throughout codebase. No novel technology.

One validation item that requires real data (not resolvable from research alone):
- **Actual Monarch CSV format:** Research is MEDIUM confidence on delimiter (comma vs. tab), date format (`YYYY-MM-DD` vs. `MM/DD/YYYY`), and sign convention. Auto-detection handles delimiter at runtime. Regex-based date parser handles both formats. But sign convention MUST be verified with a real export file before the Phase 1 parser is finalized.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | One new dependency (`csv-parse`), everything else is existing validated technology. Direct codebase inspection. |
| Features | HIGH | Established wizard patterns from YNAB, Beyond Budget, Smashing Magazine. Monarch column format confirmed across multiple community sources. |
| Architecture | HIGH | All integration points directly observed in existing codebase. Component boundaries mirror existing modules exactly. Only 5 files modified, ~15 lines. |
| Pitfalls | HIGH | Floating-point and BOM issues are well-documented JavaScript behavior. Dedup hash formula confirmed from codebase source. Only MEDIUM items are Monarch-specific format details requiring real data. |

**Overall confidence:** HIGH

### Gaps to Address

- **Monarch CSV delimiter:** PROJECT.md says tab-delimited; Monarch documentation says comma CSV. Auto-detection resolves this at runtime, but the parser should be validated against a real Monarch export file before Phase 1 closes.
- **Monarch date format:** May be `YYYY-MM-DD` or `MM/DD/YYYY`. Implement regex-based parser supporting both, then verify against real data. Output must always be `YYYY-MM-DD` to match the `transactions.date` column.
- **Amount sign convention:** Assumed to match (Monarch negative = expense = Minerva DB convention), but must be verified with a real export. A unit test with a known transaction is sufficient before writing the parser.
- **Express body size limit location:** The current Express setup file was not inspected to confirm the exact location of `express.json()`. This is a 1-line change but must be located before Phase 1 is complete.

## Sources

### Primary (HIGH confidence)
- Existing codebase (direct inspection): `sync-service.ts`, `simplefin-client.ts`, `rules-service.ts`, `transfer-service.ts`, `001-initial-schema.sql`, `trpc-router.ts`, `Layout.tsx`, `MoreSheet.tsx`, `App.tsx`
- `packages/shared/src/types.ts` — `toCents()` confirmed uses `Math.round(dollars * 100)`
- [csv-parse official documentation](https://csv.js.org/parse/) — sync API, options reference, `bom` option
- [csv-parse npm](https://www.npmjs.com/package/csv-parse) — version 5.6.0, 2840+ dependents, zero external deps

### Secondary (MEDIUM confidence)
- [Monarch Money CSV format blog](https://blog.tracefunc.com/notes/monarch-money.html) — confirmed 8 columns: Date, Merchant, Category, Account, Original Statement, Notes, Amount, Tags
- [Monarch Money export help](https://help.monarch.com/hc/en-us/articles/15526600975764-Downloading-Transaction-or-Account-History) — CSV export documentation
- [Smashing Magazine: Designing Data Importers](https://www.smashingmagazine.com/2020/12/designing-attractive-usable-data-importer-app/) — wizard UX patterns, error handling
- [YNAB File-Based Import Guide](https://support.ynab.com/en_us/file-based-import-a-guide-Bkj4Sszyo) — duplicate detection and account selection patterns in finance apps

### Tertiary (LOW confidence — needs validation with real Monarch export)
- Monarch CSV delimiter (comma vs. tab) — conflicting between PROJECT.md and official docs; auto-detection mitigates at runtime
- Monarch date format — assumed `YYYY-MM-DD` based on community docs; needs verification
- Amount sign convention — assumed negative = expense based on Monarch documentation; needs verification before first import

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*
