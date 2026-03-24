# Plan 27-01 Summary: ImportPage with 3-step wizard

**Status:** Complete
**Completed:** 2026-03-24

## What was built

Created `ImportPage.tsx` with a 3-step CSV import wizard:

1. **Upload step** — Drag-and-drop zone with file picker fallback, reads CSV via FileReader, calls `import.preview` tRPC mutation
2. **Preview & Map step** — Shows sample rows table, parse errors (collapsible), dedup stats, account mapping dropdowns (required), category mapping dropdowns (optional, defaults to uncategorized)
3. **Confirm & Results step** — Pre-import summary with new/duplicate/error counts, back button, import button with loading state; post-import results with imported/skipped/categorized counts and link to Transactions

## Key decisions

- Types defined locally in ImportPage.tsx matching server interfaces (avoids cross-package type imports)
- Component broken into UploadStep, PreviewStep, ResultsStep sub-components for readability
- Category dropdowns use `<optgroup>` elements grouped by category group
- Account mappings initialized from auto-suggestions, all must be mapped before Continue is enabled

## Key files

- `packages/client/src/pages/ImportPage.tsx` (created, 571 lines)

## Requirements addressed

CSV-01, MAP-01, MAP-03, UI-01, UI-02, UI-03, UI-04, UI-05
