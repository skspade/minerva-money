# Milestone Context

**Source:** Brainstorm session (CSV Import for Monarch Money Migration)
**Design:** .planning/designs/2026-03-24-csv-import-monarch-migration-design.md

## Milestone Goal

Add a reusable CSV import feature that allows migrating transaction history from Monarch Money (and potentially other sources) into Minerva Money. Server-side parsing and import logic with a simple upload/mapping/confirm UI. Account mapping is manual, category mapping is manual with skip option, and imported transactions run through the rules engine for categorization.

## Features

### CSV Parsing & Validation Service

New `packages/server/src/import/` module with `csv-parser.ts` (tab-delimited Monarch CSV parsing, column validation, structured row output) and `import-service.ts` (parseAndValidate + executeImport orchestration). Validates required fields, flags invalid dates/amounts with row numbers.

### tRPC API Endpoints

New `import` nested router with two mutations: `import.preview` (parse CSV, return rows + unique accounts/categories + existing entities for mapping) and `import.execute` (re-parse, apply mappings, insert transactions atomically, run rules engine). CSV sent as string content via FileReader.

### Import Page UI

New `ImportPage` at `/import` with three collapsible sections: file upload with drag-drop, account/category mapping tables (side-by-side on desktop, stacked on mobile), and confirm/import summary with results display. Uses TanStack Query mutations, Tailwind styling, mobile-responsive with `max-md:` variants.

### Deduplication & Rules Integration

Uses existing `generateDedupHash()` and `INSERT OR IGNORE` for dedup (prevents double-import and collisions with synced transactions). Calls `categorizeNewTransactions()` post-import so rules override CSV categories. Random UUIDs for transaction IDs, pending=0, entire import in single SQLite transaction for atomicity.

### Navigation & Routing

`/import` route in React Router, "Import" in desktop nav bar and mobile "More" bottom sheet. Top-level page consistent with flat navigation pattern.
