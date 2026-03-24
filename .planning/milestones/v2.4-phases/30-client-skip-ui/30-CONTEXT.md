# Phase 30: Client Skip UI - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users can mark CSV accounts as "skip" in the import wizard and see which accounts they are skipping with clear visual treatment. This phase adds a skip option to the account mapping dropdown, displays per-account row count badges from the Phase 29 `rowCountByAccount` data, applies visually distinct styling to skipped accounts, updates the continue button validation to accept skipped accounts as resolved, and strips the skip sentinel from the payload before sending to the server.

</domain>

<decisions>
## Implementation Decisions

### Skip Option in Dropdown (SKIP-01)
- Add a "Skip -- do not import" option to the account mapping `<select>` dropdown, positioned after the "Select account..." disabled placeholder and before the real account options
- Use a sentinel value `__SKIP__` as the `<option value>` to distinguish skip from unmapped (empty string) and mapped (real account ID)
- When user selects skip, store `__SKIP__` in the `accountMappings` state record for that CSV account name
- Define the sentinel as a named constant `SKIP_SENTINEL = '__SKIP__'` at module scope for readability (Claude's Decision: avoids magic strings scattered across the component)

### Row Count Badges (SKIP-02)
- Display a row count badge next to each CSV account name in the account mapping section, showing the number from `previewResult.rowCountByAccount[csvName]`
- Badge format: `{count} rows` in a small pill/tag style inline with the account label (Claude's Decision: pill badge is consistent with the app's existing stat display patterns)
- Update the client-side `PreviewResult` interface to include `rowCountByAccount: Record<string, number>` matching the Phase 29 server addition

### Skipped Account Visual Treatment (SKIP-03)
- When an account is set to skip, apply dimmed styling to its entire mapping row: reduced opacity (`opacity-60`) and an amber/yellow left border or background tint (Claude's Decision: amber signals "intentionally excluded" without implying error like red would)
- The skip option text in the dropdown should be visually distinct from real accounts -- use a different color or italic style (Claude's Decision: helps users distinguish skip from a real account selection at a glance)
- Show a small "Skipped" indicator or the skip label text below the dropdown when skip is selected (Claude's Decision: reinforces the skip state outside the dropdown for quick scanning)

### Continue Button Validation
- Change `allAccountsMapped` logic: an account is "resolved" if its mapping value is either a real account ID (non-empty, non-sentinel) OR the skip sentinel `__SKIP__`
- An account with empty string value is "undecided" and blocks the continue button
- If ALL accounts are set to skip, block the continue button with a distinct message: "At least one account must be mapped to import" (Claude's Decision: importing zero accounts is likely a user error and would send an empty payload)
- Update the validation message from "All accounts must be mapped before continuing" to "All accounts must be mapped or skipped before continuing"

### Payload Stripping
- Before calling `executeMutation.mutate()`, filter the `accountMappings` record to remove entries with the skip sentinel value
- The server receives only the mapped accounts (real account IDs) -- it never sees `__SKIP__`
- This aligns with the Phase 29 server behavior where omitted accounts in `accountMappings` are skipped during execute

### State Management
- Reuse the existing `accountMappings: Record<string, string>` state -- skip is just another string value (`__SKIP__`)
- No new state variables needed; the sentinel value carries all skip information (Claude's Decision: minimal state change reduces risk of desync between skip tracking and mapping tracking)

### Type Updates
- Update client-side `PreviewResult` interface to add `rowCountByAccount: Record<string, number>`
- Update client-side `ExecuteResult` interface to add `skippedByAccountFilter: number` (Claude's Decision: needed for Phase 31 results display, but the type should be correct now to avoid tRPC type mismatch warnings)

### Claude's Discretion
- Exact Tailwind classes for the amber/dimmed styling on skipped accounts
- Exact pill badge styling (rounded-full vs rounded-md, color shade)
- Whether to use a visual separator line between the skip option and real accounts in the dropdown
- Exact wording of the "at least one account must be mapped" message
- Whether the row count badge uses singular "row" for count of 1

</decisions>

<specifics>
## Specific Ideas

- The account mapping dropdown currently lives in `PreviewStep` at lines 394-409 of `ImportPage.tsx`. Each account renders a `<div>` with a label and `<select>`. The skip option inserts into the `<select>` as an `<option value="__SKIP__">Skip -- do not import</option>` after the disabled placeholder.
- The `handleImport` function at line 88 currently passes `accountMappings` directly. It needs a filter step: `Object.fromEntries(Object.entries(accountMappings).filter(([_, v]) => v !== SKIP_SENTINEL))`.
- The `allAccountsMapped` check at line 105-107 currently requires every value to be non-empty. It needs to also accept `__SKIP__` as valid, plus the additional "at least one real mapping" guard.
- The `onSuccess` callback in `previewMutation` (line 33-34) initializes `accountMappings` from `suggestedId`. Accounts without a suggestion get `''` (undecided), which is correct -- they will show "Select account..." and block continue until the user maps or skips them.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ImportPage.tsx`: Single-file component (572 lines) containing all three wizard steps (`UploadStep`, `PreviewStep`, `ResultsStep`) plus local type definitions. All changes for this phase are contained within this one file.
- `PreviewStep` component: Already has the account mapping grid layout with `<select>` dropdowns, label text, and conditional red border for unmapped accounts. Skip option and visual treatment layer directly onto this existing structure.
- `formatCurrency` from `../lib/format`: Already imported and used in the sample rows table.

### Established Patterns
- Account mapping state uses `Record<string, string>` where key is CSV account name and value is system account ID or empty string. The skip sentinel fits naturally as another string value.
- Validation pattern: `allAccountsMapped` boolean computed from state and passed as prop to `PreviewStep` for both disabling the button and showing the error message.
- Conditional Tailwind classes used throughout: template literals with ternary operators (e.g., line 400-401 for red/gray border based on mapping state).
- Color-coded stat cards in preview (green for valid, red for errors) and results (green, gray, blue, purple) -- amber/yellow for skipped accounts follows this color differentiation pattern.

### Integration Points
- `previewResult.rowCountByAccount` is now returned by the server (Phase 29) but the client `PreviewResult` interface at line 199 does not yet include it -- needs updating.
- `executeResult.skippedByAccountFilter` is now returned by the server (Phase 29) but the client `ExecuteResult` interface at line 209 does not yet include it -- needs updating.
- `executeMutation.mutate({ csvText, accountMappings, categoryMappings })` at line 89 is where the filtered payload must be constructed before sending to the server.
- The tRPC client (`useTRPC()`) automatically infers types from the server router, but the local interfaces in ImportPage.tsx are manually defined copies -- both must be updated.

</code_context>

<deferred>
## Deferred Ideas

- Preview stats filtering (total rows, valid rows exclude skipped accounts dynamically) -- Phase 31 (STAT-01)
- Sample rows table filtering (exclude rows from skipped accounts) -- Phase 31 (STAT-02)
- Dedup stats filtering (new/duplicate counts exclude skipped accounts) -- Phase 31 (STAT-03)
- Confirm summary reflecting filtered counts -- Phase 31 (EXEC-02)
- "Skip All Unmatched" button -- Phase 31 (PLSH-01)
- Summary banner "Importing from X of Y accounts (Z skipped)" -- Phase 31 (PLSH-02)
- Results page showing `skippedByAccountFilter` stat -- Phase 31 (EXEC-02)

</deferred>

---

*Phase: 30-client-skip-ui*
*Context gathered: 2026-03-24 via auto-context*
