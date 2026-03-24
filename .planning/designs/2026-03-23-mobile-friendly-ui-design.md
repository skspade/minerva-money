# Mobile-Friendly UI — Design

**Date:** 2026-03-23
**Approach:** Targeted Breakpoint Additions

Add mobile overrides to the existing desktop layout using Tailwind's `max-md:` variants (below 768px). Desktop layout remains untouched. Changes are incremental and can be shipped page-by-page. Target device: iPhone (375-430px width). Full functionality on mobile.

## Bottom Tab Bar Navigation

On screens below `md` (768px), the top navbar collapses into a **bottom tab bar** fixed to the screen bottom.

**Tab bar layout (5 visible tabs):**
- **Dashboard** (home icon)
- **Transactions** (list icon)
- **Budget** (wallet icon)
- **Chat** (message icon)
- **More** (ellipsis icon) — opens a slide-up sheet with: Accounts, Categories, Rules, Transfers, Reports

**Implementation:**
- Add a `BottomTabBar` component rendered inside `Layout.tsx`
- Show on `md:hidden`, hide on `md:block`
- Top navbar gets `hidden md:flex` on the nav links section
- The "Minerva Money" title and sync status stay in a minimal top bar on mobile
- Bottom bar is `fixed bottom-0` with `z-50`, `bg-gray-900`, `border-t border-gray-700`
- Active tab highlighted with `text-blue-400`, inactive `text-gray-400`
- "More" menu is a modal/sheet overlay with the remaining 5 links
- Main content gets `pb-16` on mobile to avoid overlap with the fixed bottom bar

**Icons:** Use simple inline SVG icons (no icon library dependency) — home, receipt, wallet, message-circle, ellipsis.

## Transaction Cards

On mobile (`max-md:`), the Transactions page replaces the table with a **card-based layout**.

**Card structure (each transaction):**
```
+-----------------------------------+
| Merchant Name              -$42.50|
| Mar 15 . Chase Visa              |
| [Groceries]  (category badge)    |
+-----------------------------------+
```

**Details:**
- Each card: `bg-white rounded-lg border border-gray-200 p-3 mb-2`
- Top row: merchant name (left, `font-medium truncate`) + amount (right, red/green for debit/credit)
- Second row: date + account name in `text-sm text-gray-500`
- Third row: category badge (tappable to open CategoryPicker)
- Tapping the card opens an expandable detail section or navigates to edit view (memo, splits, notes)
- Transfer badges (`purple`) shown inline as they are today

**Filters on mobile:**
- Collapse into a "Filter" button that opens a slide-up sheet with all filter options
- Active filter count shown as a badge on the Filter button

**Pagination/scroll:**
- Keep existing pagination but increase touch target size for page buttons (`min-w-[44px] min-h-[44px]`)

## Budget Page Mobile Layout

On mobile, the Budget page switches from table to **stacked category cards grouped by category group**.

**Layout:**
```
+- Essentials ----------------------+
|                                   |
|  Groceries                        |
|  ========------  $320 / $400     |
|  $80 remaining                    |
|                                   |
|  Rent                             |
|  ==============  $1,500 / $1,500 |
|  Fully funded                     |
|                                   |
+-----------------------------------+
```

**Details:**
- Category group headers as sticky section dividers (`sticky top-0 bg-gray-100 font-semibold px-3 py-2`)
- Each category: name, progress bar, spent/budgeted amounts, remaining
- Progress bar: `h-2 rounded-full bg-gray-200` with fill colored by status (green = under, yellow = near, red = over)
- Tapping a category opens inline expansion with: allocation input, rollover toggle, funding actions
- Month selector at top: left/right arrows with month name, full width

**Summary bar:**
- Sticky summary at top below month selector: total budgeted, total spent, total remaining
- Compact single-row layout: `flex justify-between text-sm`

## Forms, Modals & Touch Targets

All interactive elements need mobile adaptation for touch usability.

**Forms (Rules, Categories, etc.):**
- All form inputs: `min-h-[44px]` for touch targets (Apple HIG minimum)
- Form layouts stack vertically on mobile (`max-md:flex-col`)
- Select dropdowns and inputs go full-width on mobile (`max-md:w-full`)
- Submit/cancel buttons: full-width stacked on mobile with adequate spacing

**Modals & Sheets:**
- Existing modals (CategoryPicker, confirmations) become full-screen sheets on mobile
- `max-md:fixed max-md:inset-0` instead of centered overlay
- Add a visible close button (X) in top-right
- Sheet header with title and close button: `flex justify-between items-center p-4 border-b`

**Touch targets:**
- All buttons: minimum `44x44px` tap area (padding if needed)
- Action buttons (edit, delete, sync): increase hit area with padding
- Links in nav and elsewhere: adequate spacing to prevent mis-taps

**Typography scaling:**
- No font-size changes needed — Tailwind's defaults work well on mobile
- Ensure `truncate` on merchant names and long text to prevent overflow

## Remaining Pages

**Dashboard:**
- Already has `grid-cols-1 md:grid-cols-2` — works on mobile as-is
- Minor tweaks: ensure cards use full width, reduce padding on small screens (`max-md:p-3`)
- Sync status moves from top nav to a compact banner or into the dashboard's existing sync card

**Accounts:**
- Account list is already card-like — stack vertically on mobile (likely already works)
- Account detail/balance numbers: ensure they don't overflow, use `truncate` on long account names

**Reports (Charts):**
- Recharts components are responsive by default when wrapped in `ResponsiveContainer`
- Verify charts use `ResponsiveContainer` with `width="100%"`
- Chart controls (date range, type selector): stack vertically on mobile
- Legend: move below chart instead of beside it on mobile if needed

**Chat:**
- Chat interface is naturally mobile-friendly (vertical message list + input)
- Ensure input area is fixed to bottom with `fixed bottom-16` (above tab bar)
- Message bubbles: reduce max-width to `max-w-[85%]` on mobile for better use of space
- Input field: full-width with send button

**Categories & Rules:**
- Categories: group cards stack naturally — just ensure full-width on mobile
- Rules: list view with cards instead of table rows on mobile, similar to transaction cards pattern
- Rule form: already partially responsive, extend with `max-md:` stacking
