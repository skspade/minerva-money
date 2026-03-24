---
phase: 26-import-service-and-api
plan: 01
status: complete
completed: "2026-03-24"
---

# Plan 26-01: TDD CSV Parsing, Validation, and Row Transformation

## What Was Built

Core Monarch CSV parsing layer with four exported functions:

- **parseCsv(csvText)**: Auto-detects delimiter (tab vs comma), strips UTF-8 BOM, normalizes CRLF, validates required Monarch columns exist (Date, Merchant, Category, Account, Original Statement, Amount)
- **parseDate(dateStr)**: Deterministic regex-based parser supporting ISO (YYYY-MM-DD) and US (M/D/YYYY) formats, returns YYYY-MM-DD or null
- **validateRow(row, rowNumber)**: Checks required fields (date parseable, amount numeric, account non-empty, at least one of merchant/original-statement), returns errors with row numbers
- **transformRow(row)**: Converts to internal format — toCents for amount, Original Statement as payee with Merchant fallback, Notes to memo (null if empty)

## Key Files

| File | Action | Purpose |
|------|--------|---------|
| packages/server/src/import/import-service.ts | Created | Business logic: parse, validate, transform |
| packages/server/src/import/import-service.test.ts | Created | 36 unit tests covering all edge cases |
| packages/server/package.json | Modified | Added csv-parse ^5 dependency |

## Test Results

36 tests passing: 7 parseDate, 8 parseCsv, 10 validateRow, 11 transformRow.

## Decisions Made

- Used `csv-parse/sync` API for simplicity (no async needed for parsing)
- Date regex validates month 1-12 and day 1-31 (basic range check, not calendar-aware)
- Amount conversion uses toCents directly — Monarch sign convention matches Minerva (negative = expense)

## Self-Check: PASSED

- [x] parseCsv handles both delimiters
- [x] BOM stripped, CRLF normalized
- [x] Date parsing is deterministic (no Date constructor)
- [x] Validation reports row numbers
- [x] Amount edge cases verified (0.01, 19.99, -18.32)
- [x] Payee fallback logic works
