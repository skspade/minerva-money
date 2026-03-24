# Phase 31: Stats Filtering and Polish - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

All preview stats, sample rows, and import results accurately reflect skip decisions, with convenience features for bulk operations. This phase adds client-side filtering so that preview stats, sample rows, and dedup stats dynamically exclude rows from skipped accounts as the user changes mappings. It also updates the confirm summary and results page to reflect filtered counts, adds a "Skip All Unmatched" convenience button, and adds a summary banner showing import scope when accounts are skipped.

</domain>

<decisions>
## Implementation Decisions

### Preview Stats Filtering (STAT-01)
- Compute filtered versions of `totalRows` and `validRows` by subtracting row counts for skipped accounts using `previewResult.rowCountByAccount`
- The stat cards in `PreviewStep` display the filtered counts instead of the raw server values when any accounts are skipped
- Filtering is purely client-side using existing `accountMappings` state and `rowCountByAccount` data from Phase 29 -- no server changes needed
- When no accounts are skipped, display the original unfiltered values (Claude's Decision: avoids unnecessary computation and keeps behavior identical to pre-skip UX when not using skip)

### Sample Rows Filtering (STAT-02)
- Filter `previewResult.sampleRows` to exclude rows where `row.accountName` matches a skipped account (where `accountMappings[row.accountName] === SKIP_SENTINEL`)
- Apply filter inline via `.filter()` in the JSX map, not by mutating preview state (Claude's Decision: derived filtering keeps source of truth in accountMappings state and recomputes reactively on mapping changes)
- Show a note below the sample rows table when some rows were filtered out, e.g., "Showing X of Y sample rows (Z excluded from skipped accounts)" (Claude's Decision: prevents user confusion about why sample count changed)

### Dedup Stats Filtering (STAT-03)
- Server dedup stats (`newCount`, `duplicateCount`) are computed against the full dataset including skipped accounts -- client must adjust them
- Compute filtered dedup stats by subtracting the row counts of skipped accounts from the total valid rows, then proportionally adjusting or recomputing based on available data (Claude's Decision: exact per-account dedup breakdown is not available from server, so a note-based approach is more honest)
- Display the raw dedup stats with an informational note: "Excludes N rows from Z skipped account(s)" when accounts are skipped (Claude's Decision: dedup stats are computed server-side against existing DB transactions -- client cannot accurately recompute per-account dedup without re-querying, so a note is more accurate than approximate math)

### Confirm Summary Filtering (EXEC-02)
- The confirm summary in `ResultsStep` (step 3, before execution) currently shows `previewResult.dedupStats.newCount`, `duplicateCount`, and `errors.length`
- Update to show filtered dedup stats with the same note approach as the preview step
- Add a skipped-accounts row to the summary grid showing the total number of rows being excluded due to skipped accounts (Claude's Decision: explicit skipped count in the summary gives the user final confirmation of what will be excluded)

### Results Page Filtering (EXEC-02)
- After execution, display `executeResult.skippedByAccountFilter` as a new stat card in the results grid
- Use amber/yellow styling (`bg-amber-50`, `text-amber-600`) consistent with the skip visual treatment from Phase 30
- Label: "Skipped (account filter)" to distinguish from dedup skips

### Skip All Unmatched Button (PLSH-01)
- Add a "Skip All Unmatched" button in the account mappings section header, next to the "Map Accounts" heading
- Button sets all accounts where `accountMappings[csvName]` is empty string (undecided) to `SKIP_SENTINEL`
- Accounts that already have a suggested match (auto-mapped) or were manually mapped are left unchanged
- Button is only visible when at least one account is undecided (Claude's Decision: hiding when not applicable reduces visual clutter)
- Styled as a secondary/text button to not compete with the primary Continue button (Claude's Decision: this is a convenience shortcut, not the primary action)

### Summary Banner (PLSH-02)
- Display a banner at the top of the preview step showing "Importing from X of Y accounts (Z skipped)" when at least one account is skipped
- Use an info-style banner with amber/yellow background (`bg-amber-50 border-amber-200 text-amber-800`) matching the skip color scheme
- Banner is hidden when no accounts are skipped (zero skipped = no banner)
- X = number of mapped (non-skip, non-empty) accounts, Y = total accounts, Z = number of skipped accounts

### Computed Values
- All filtering logic should be computed as derived values at the top of `PreviewStep` and `ResultsStep` using the existing `accountMappings` and `previewResult` props (Claude's Decision: co-locating derived computations with their consumers keeps the logic transparent and avoids prop drilling)
- Key derived values: `skippedAccountNames: Set<string>`, `skippedRowCount: number`, `filteredSampleRows: TransformedRow[]`, `mappedAccountCount: number`, `skippedAccountCount: number`

### Claude's Discretion
- Exact Tailwind classes for the summary banner
- Exact wording of the excluded-rows note on dedup stats
- Whether to use `useMemo` for filtered computations or compute inline
- Exact placement of the "Skip All Unmatched" button relative to the heading (right-aligned inline vs below)
- Whether the skipped-by-account-filter results card uses a 3-column or 2-column responsive grid now that there are 5 stat cards

</decisions>

<specifics>
## Specific Ideas

- The `previewResult.rowCountByAccount` data (from Phase 29) is the key enabler for client-side stat filtering -- summing row counts for skipped accounts gives the total rows to subtract from `totalRows` and `validRows`
- The sample rows table currently renders `previewResult.sampleRows.map(...)` at line 389 of ImportPage.tsx -- wrap with `.filter(row => !skippedAccountNames.has(row.accountName))` before `.map()`
- The dedup stats section at lines 404-409 shows `newCount` and `duplicateCount` -- add a conditional note element below this when `skippedRowCount > 0`
- The confirm summary grid at lines 534-547 mirrors the dedup stats -- apply the same filtering/note pattern plus add a skipped-accounts card
- The results grid at lines 587-604 has 4 cards in a 2-column grid -- add a 5th card for `skippedByAccountFilter` when its value is > 0
- For "Skip All Unmatched", iterate `previewResult.accounts` and batch-update `accountMappings` state for all entries where current value is empty string

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ImportPage.tsx` (624 lines): Single file containing all wizard components. All Phase 31 changes are contained within this file's `PreviewStep` and `ResultsStep` components.
- `SKIP_SENTINEL` constant and `filterSkippedAccounts()` helper: Already defined at module scope (lines 12, 18-22) from Phase 30 -- reuse for identifying skipped accounts in filtering logic.
- `getValidationState()` helper (lines 24-40): Already handles skip validation -- no changes needed for Phase 31.
- `previewResult.rowCountByAccount`: Already available from Phase 29 server changes and typed in the client `PreviewResult` interface (line 239).
- `executeResult.skippedByAccountFilter`: Already available from Phase 29 server changes and typed in the client `ExecuteResult` interface (line 246).

### Established Patterns
- Color-coded stat cards: green for positive/valid, red for errors, gray for skips/duplicates, blue for rules, purple for CSV categorization. Amber for skip-related items follows the Phase 30 convention.
- Conditional rendering based on state: Components use ternary operators and `&&` short-circuit for conditional styling and element visibility throughout ImportPage.tsx.
- Derived state computed inline in component body rather than separate hooks (e.g., `validationState` computed at line 138-140).
- Grid layouts: `grid grid-cols-1 md:grid-cols-3` for stat cards, `grid grid-cols-1 md:grid-cols-2` for mapping dropdowns and result cards.

### Integration Points
- `PreviewStep` receives `accountMappings` and `previewResult` as props -- all data needed for filtering is already available, no new props needed.
- `ResultsStep` receives `previewResult` and `executeResult` as props -- `previewResult` provides `rowCountByAccount` for the confirm summary, `executeResult` provides `skippedByAccountFilter` for results.
- `onAccountMappingChange` callback (line 176-178) triggers re-render when any account mapping changes -- filtered stats will automatically update reactively.
- The "Skip All Unmatched" button needs to call `onAccountMappingChange` for each undecided account, or more efficiently, a new batch update prop could be added (Claude's Decision: a single `setAccountMappings` call in the parent with a new `onSkipAllUnmatched` callback is cleaner than N individual calls).

</code_context>

<deferred>
## Deferred Ideas

- Server-side preview filtering (explicitly out of scope per REQUIREMENTS.md -- "Unnecessary complexity -- client already has all data to filter locally")
- Per-row skip/include checkboxes (out of scope -- "Wrong abstraction level -- account-level covers the real use case")
- Persistent skip preferences across imports (out of scope -- "One-time Monarch migration -- not a recurring workflow")
- Auto-skip by account type detection (out of scope -- "No account type metadata in CSV")

</deferred>

---

*Phase: 31-stats-filtering-and-polish*
*Context gathered: 2026-03-24 via auto-context*
