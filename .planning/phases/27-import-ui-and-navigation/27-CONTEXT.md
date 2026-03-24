# Phase 27: Import UI and Navigation - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated (autopilot mode)

<domain>
## Phase Boundary

Users can import Monarch CSV files through a 3-step wizard accessible from both desktop and mobile navigation. This phase delivers the complete frontend: an `ImportPage.tsx` with file upload (drag-and-drop + file picker), preview/mapping step with account and category dropdowns, confirm/import step with summary stats, and a results screen. Navigation entries are added to the desktop nav bar (`Layout.tsx`), the mobile "More" bottom sheet (`MoreSheet.tsx`), and the React Router config (`App.tsx`). No backend changes -- the Phase 26 `import.preview` and `import.execute` tRPC mutations are consumed as-is.

</domain>

<decisions>
## Implementation Decisions

### Wizard Structure
- Single `ImportPage.tsx` in `packages/client/src/pages/` following the established one-page-per-feature pattern
- 3-step wizard managed by local React state (`step: 'upload' | 'preview' | 'results'`) with no URL-based routing between steps (Claude's Decision: wizard is a single logical flow; URL sub-routes would add complexity with no benefit for a non-bookmarkable transient workflow)
- Step indicator at top showing progress (e.g., "Step 1 of 3: Upload") styled consistently with existing page headers (Claude's Decision: visual step indicator aids orientation in multi-step flows)
- Back button between steps 2 and 3 to return to mapping adjustments

### File Upload (Step 1 — CSV-01)
- Drag-and-drop zone with a "Browse" button fallback using a hidden `<input type="file" accept=".csv,.tsv,.txt">` element
- Drop zone styled as a dashed-border area with centered text and icon, matching the app's gray-50 background and white card pattern (Claude's Decision: dashed-border drop zone is a universally recognized upload pattern)
- File read via `FileReader.readAsText()` to obtain CSV text string
- On file read, immediately call `import.preview` tRPC mutation and advance to step 2
- Loading state shown while preview mutation runs (spinner + "Parsing file..." text)
- Use `Upload` icon from `lucide-react` for the drop zone (Claude's Decision: lucide-react is already installed and used across the app)

### Preview and Mapping (Step 2 — UI-02, MAP-01, MAP-03)
- Display total row count, valid row count, and parse errors at the top of the step
- Show first 10 sample rows in a responsive table (horizontal scroll on mobile) with columns: Date, Merchant, Account, Category, Amount
- Account mapping section: list each unique CSV account name with a `<select>` dropdown populated from existing Minerva accounts via `trpc.accounts.list` query; pre-select the auto-suggested match from `PreviewResult.accounts[].suggestedId`
- Category mapping section: list each unique CSV category name with a `<select>` dropdown populated from existing Minerva categories via `trpc.categories.list` query; pre-select the auto-suggested match from `PreviewResult.categories[].suggestedId`; include an "Uncategorized" option (empty/null) as the default for unmatched categories
- All CSV accounts must be mapped before the "Continue" button is enabled (MAP-05 validation on the client)
- Parse errors displayed as a collapsible list below the sample rows (Claude's Decision: errors are secondary info that shouldn't dominate the view but must be accessible)
- Dedup stats (new vs. duplicate counts) shown in the summary area (Claude's Decision: showing dedup stats at preview helps users understand what will actually be imported before committing)

### Confirm and Import (Step 3 — UI-03, UI-04)
- Summary card showing: new transactions to import, duplicates to skip, error rows
- "Import" button triggers `import.execute` tRPC mutation with the CSV text and confirmed mappings
- Loading state during execution (spinner + "Importing..." text with disabled button)
- On success, transition to results view showing: imported count, skipped count, and a "View Transactions" link (`<Link to="/transactions">`)
- On error, display error message with option to go back to mapping step (Claude's Decision: allowing retry from mapping rather than re-uploading respects user effort)

### Navigation Integration (NAV-01, NAV-02, NAV-03)
- Add `<Route path="import" element={<ImportPage />} />` to `App.tsx` inside the Layout route
- Add `<NavLink to="/import">Import</NavLink>` to the desktop nav bar in `Layout.tsx`, positioned after "Chat" (Claude's Decision: Import is a utility action used less frequently than core pages; placing it last keeps primary navigation uncluttered)
- Add `{ to: '/import', icon: Upload, label: 'Import' }` to the `MORE_LINKS` array in `MoreSheet.tsx` using the `Upload` icon from `lucide-react`

### Mobile Responsiveness (UI-05)
- Sample rows table uses `overflow-x-auto` wrapper for horizontal scrolling on small screens
- Account and category mapping sections stack vertically on mobile (full-width dropdowns) using existing Tailwind responsive classes (`md:grid-cols-2` grid on desktop, single column on mobile) (Claude's Decision: stacked layout matches the app's established mobile pattern from Phases 21-25)
- Drop zone fills available width on mobile with adequate touch target sizing (min-h-[200px])
- Summary cards use full-width stacked layout on mobile, side-by-side on desktop

### State Management
- All wizard state held in `ImportPage.tsx` local state: `csvText`, `previewResult`, `accountMappings`, `categoryMappings`, `step`, `executeResult`
- Account and category mappings initialized from preview auto-suggestions, then updated by user via dropdowns
- No TanStack Query caching for import mutations -- they are fire-and-forget operations (Claude's Decision: import is a one-time action with no need for query invalidation or refetching)
- Existing account and category lists fetched via standard `useQuery` with TanStack Query caching

### Error Handling
- File read errors (non-text file, encoding issues) shown as inline alert in the upload step
- Preview mutation errors shown as inline alert with "Try Again" option
- Execute mutation errors shown as inline alert in the confirm step with ability to go back
- Client-side validation prevents proceeding with unmapped accounts (button disabled + helper text)

### Claude's Discretion
- Exact Tailwind spacing, padding, and color choices within established patterns
- Whether to extract wizard step components into separate files or keep inline in ImportPage.tsx
- Table column widths and text truncation for sample rows
- Exact wording of status messages and helper text
- Animation/transition between wizard steps (if any)
- Whether mapping sections use accordion or flat list for many items

</decisions>

<specifics>
## Specific Ideas

- The `PreviewResult` interface from Phase 26 returns `sampleRows` (first 10 `TransformedRow` objects), `accounts` (array of `AccountMatch` with `csvName`, `suggestedId`, `suggestedName`), `categories` (array of `CategoryMatch` with `csvName`, `suggestedId`, `suggestedName`), `errors` (string array), and `dedupStats` (`newCount`, `duplicateCount`) -- the UI maps directly to these fields
- The `ExecuteResult` interface returns `importedCount`, `skippedCount`, `categorizedByRules`, `categorizedFromCsv` -- the results screen can show all four stats
- The `import.execute` mutation accepts `{ csvText: string, accountMappings: Record<string, string>, categoryMappings: Record<string, number> }` -- account mappings are keyed by CSV name to Minerva account ID (string UUID), category mappings are keyed by CSV name to Minerva category ID (number)
- The desktop nav bar in `Layout.tsx` uses a consistent `NavLink` pattern with `isActive` conditional styling (`bg-gray-700` active, `hover:bg-gray-800` inactive) -- the Import link follows this exact pattern
- The `MoreSheet.tsx` uses a `MORE_LINKS` const array with `{ to, icon, label }` objects -- adding Import is a single array entry
- The `useTRPC()` hook from `packages/client/src/trpc.ts` provides typed access to all tRPC procedures including the new `import` router

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/client/src/trpc.ts`: Exports `useTRPC()` hook providing typed access to `import.preview` and `import.execute` mutations
- `packages/client/src/lib/format.ts`: `formatCurrency()` utility for displaying amounts in the sample rows table
- `lucide-react` package: Already installed, provides `Upload` icon for drop zone and navigation entries
- `vaul` package: Already installed for drawer/bottom-sheet components, used by MoreSheet
- `@tanstack/react-query`: Already configured for data fetching; `useQuery` for accounts/categories lists, `useMutation` for import operations

### Established Patterns
- Pages follow `packages/client/src/pages/{Feature}Page.tsx` naming convention with default export
- All pages use `useTRPC()` hook + `useQuery`/`useMutation` from TanStack Query for data operations
- Loading states: `<p className="text-gray-500">Loading...</p>` pattern
- Error states: `<p className="text-red-600">Error: {message}</p>` pattern
- Desktop nav: `NavLink` components in `Layout.tsx` with `isActive` conditional class
- Mobile nav: `MORE_LINKS` array in `MoreSheet.tsx` with `lucide-react` icons
- Routes defined in `App.tsx` as `<Route path="..." element={<...Page />} />` inside Layout route
- Responsive design: `md:` breakpoint for desktop vs mobile layouts, `hidden md:block` / `md:hidden` toggles

### Integration Points
- `packages/client/src/App.tsx`: Add route for `/import` path (line ~27, after chat route)
- `packages/client/src/components/Layout.tsx`: Add NavLink for Import in desktop nav bar (line ~86, after Chat NavLink)
- `packages/client/src/components/MoreSheet.tsx`: Add entry to `MORE_LINKS` array (line ~11, after Reports entry)
- `packages/server/src/import/import-router.ts`: Already wired into `appRouter` -- client can call `import.preview` and `import.execute` immediately
- `trpc.accounts.list` and `trpc.categories.list`: Existing queries for populating mapping dropdowns

</code_context>

<deferred>
## Deferred Ideas

- Multiple CSV format support with format selector dropdown -- deferred to future release (EXTI-01)
- Import history log with timestamp, filename, and row counts -- deferred to future release (EXTI-02)
- Inline account creation during import mapping step -- explicitly out of scope (REQUIREMENTS.md)
- Category creation during import -- explicitly out of scope (REQUIREMENTS.md)
- CSV export of transaction data -- deferred to future release (EXTI-04)
- Drag-and-drop reordering of mapping entries -- unnecessary complexity for a one-time migration tool
- Progress bar for large file imports -- Monarch exports are typically < 10K rows; synchronous mutation is sufficient

</deferred>

---

*Phase: 27-import-ui-and-navigation*
*Context gathered: 2026-03-24 via auto-context*
