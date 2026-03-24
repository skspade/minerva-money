# Phase 27: Import UI and Navigation - Research

**Researched:** 2026-03-24
**Status:** Complete

## Phase Boundary

Build the frontend for CSV import: a 3-step wizard page (`ImportPage.tsx`) with file upload, preview/mapping, and confirm/results steps. Wire navigation entries in desktop nav bar, mobile bottom sheet, and React Router.

## Codebase Findings

### Import API (Phase 26 - Already Built)

**Router:** `packages/server/src/import/import-router.ts`
- `import.preview` mutation: accepts `{ csvText: string }`, returns `PreviewResult`
- `import.execute` mutation: accepts `{ csvText: string, accountMappings: Record<string, string>, categoryMappings: Record<string, number> }`, returns `ExecuteResult`

**PreviewResult interface** (`packages/server/src/import/import-service.ts`):
```typescript
interface PreviewResult {
  totalRows: number;
  validRows: number;
  sampleRows: TransformedRow[];  // first 10
  errors: string[];
  accounts: AccountMatch[];      // { csvName, suggestedId, suggestedName }
  categories: CategoryMatch[];   // { csvName, suggestedId, suggestedName }
  dedupStats: { newCount: number; duplicateCount: number };
}
```

**ExecuteResult interface:**
```typescript
interface ExecuteResult {
  importedCount: number;
  skippedCount: number;
  categorizedByRules: number;
  categorizedFromCsv: number;
}
```

**TransformedRow interface:**
```typescript
interface TransformedRow {
  date: string;
  amount: Cents;  // integer cents
  payee: string;
  memo: string | null;
  merchantName: string;
  categoryName: string;
  accountName: string;
}
```

### Client Architecture Patterns

**tRPC client:** `packages/client/src/trpc.ts` exports `useTRPC()` hook via `createTRPCContext<AppRouter>()`.

**Data fetching pattern** (from RulesPage, CategoriesPage):
```typescript
const trpc = useTRPC();
const { data, isLoading, error } = useQuery(trpc.someRouter.list.queryOptions());
const mutation = useMutation(trpc.someRouter.action.mutationOptions({ onSuccess: ... }));
```

**Page conventions:**
- Files at `packages/client/src/pages/{Feature}Page.tsx` with default export
- Loading: `<p className="text-gray-500">Loading...</p>`
- Error: `<p className="text-red-600">Error: {message}</p>`

**Currency formatting:** `formatCurrency()` from `packages/client/src/lib/format.ts` (cents -> USD string)

### Navigation Integration Points

**App.tsx** (`packages/client/src/app.tsx`):
- Routes inside `<Route element={<Layout />}>` block
- Last route is `<Route path="chat" element={<ChatPage />} />`
- Add `<Route path="import" element={<ImportPage />} />` after chat

**Layout.tsx** (`packages/client/src/components/Layout.tsx`):
- Desktop nav: `NavLink` components with `isActive` conditional class (`bg-gray-700` active, `hover:bg-gray-800` inactive)
- Last NavLink is "Chat" (line 79-86)
- Add "Import" NavLink after Chat

**MoreSheet.tsx** (`packages/client/src/components/MoreSheet.tsx`):
- `MORE_LINKS` array with `{ to, icon, label }` objects
- Currently has: Accounts, Categories, Rules, Transfers, Reports
- Uses `lucide-react` icons: `CreditCard, Tag, Sliders, ArrowLeftRight, BarChart`
- Add `{ to: '/import', icon: Upload, label: 'Import' }` to array
- Import `Upload` from `lucide-react`

**BottomTabBar.tsx** (`packages/client/src/components/BottomTabBar.tsx`):
- Primary tabs: Dashboard, Transactions, Budget, Chat
- "More" button opens MoreSheet
- No changes needed here — Import is in the MoreSheet

### Available Dependencies

- `lucide-react` - already installed, provides `Upload` icon
- `@tanstack/react-query` - `useQuery`, `useMutation`
- `react-router` - `Link`, `NavLink`
- `vaul` - drawer/bottom-sheet (used by MoreSheet)

### Existing Account/Category List Queries

- `trpc.accounts.list` returns `{ id: string, name: string, institution: string, type: string, balance: number, lastSynced: string | null }[]`
- `trpc.categories.groups.list` returns groups with nested categories (each category has `id: number, name: string`)

### Responsive Design Patterns

- `md:` breakpoint for desktop/mobile separation
- `hidden md:block` / `md:hidden` for show/hide
- `overflow-x-auto` for horizontal scrolling on tables
- Mobile bottom padding: `pb-20 md:pb-6` on main content area

## Technical Approach

### Plan Decomposition

This phase is a single-wave, two-plan structure:

**Plan 27-01:** ImportPage.tsx — the complete wizard component with all three steps (upload, preview/map, confirm/results). This is the main deliverable.

**Plan 27-02:** Navigation wiring — add route to App.tsx, NavLink to Layout.tsx, entry to MoreSheet.tsx. Small, focused integration changes.

Both can execute in wave 1 since Plan 02 only touches navigation files (not ImportPage.tsx).

### Key Implementation Details

1. **File upload:** Use hidden `<input type="file" accept=".csv,.tsv,.txt">` with a styled drop zone using `onDragOver`/`onDrop` handlers. Read file with `FileReader.readAsText()`.

2. **Preview mutation:** Call `import.preview` with csvText, which returns sample rows, account/category matches with auto-suggestions, errors, and dedup stats.

3. **Mapping UI:** Two sections (accounts and categories), each showing CSV name + dropdown. Initialize dropdowns from `suggestedId` values. Accounts required (disable Continue if any unmapped), categories optional (null = uncategorized).

4. **Execute mutation:** Send csvText + confirmed mappings. Show loading state, then results.

5. **No tests needed for this phase** — it's pure UI with no business logic (all logic is in the Phase 26 service layer). The mutations are tested server-side. The wizard state management is simple React `useState`.

## Requirements Coverage

| Requirement | Plan | How |
|-------------|------|-----|
| CSV-01 | 27-01 | Drag-and-drop zone + file picker in upload step |
| MAP-01 | 27-01 | Account mapping dropdowns in preview step |
| MAP-03 | 27-01 | Category mapping dropdowns in preview step |
| UI-01 | 27-01 | 3-step wizard with step indicator |
| UI-02 | 27-01 | Sample rows table + row count + errors |
| UI-03 | 27-01 | Summary card with new/duplicate/error counts |
| UI-04 | 27-01 | Results screen with counts + link to Transactions |
| UI-05 | 27-01 | Responsive layout with stacked mobile design |
| NAV-01 | 27-02 | Route in App.tsx |
| NAV-02 | 27-02 | NavLink in Layout.tsx |
| NAV-03 | 27-02 | Entry in MoreSheet.tsx |

---

## RESEARCH COMPLETE

*Phase: 27-import-ui-and-navigation*
*Researched: 2026-03-24*
