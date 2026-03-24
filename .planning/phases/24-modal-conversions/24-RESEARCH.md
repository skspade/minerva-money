# Phase 24: Modal Conversions - Research

**Researched:** 2026-03-23
**Domain:** React modal-to-bottom-sheet conversion using vaul, Tailwind v4 responsive patterns
**Confidence:** HIGH (based on direct codebase inspection and existing vaul usage in Phase 21)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MODAL-01 | SplitModal renders as full-screen bottom sheet on mobile, centered modal on desktop | Architecture Pattern 1: vaul Drawer.Root with responsive inner layout |
| MODAL-02 | ManualTransactionForm renders as full-screen bottom sheet on mobile, centered modal on desktop | Architecture Pattern 3: inline form → sheet wrapping on mobile |
| MODAL-03 | Bottom sheets support drag-to-dismiss and backdrop tap to close | vaul provides both natively via Drawer.Root (drag handle) + Drawer.Overlay click |
| MODAL-04 | RuleForm renders as full-screen sheet on mobile | Architecture Pattern 2: inline form promoted to vaul sheet on mobile |
| MODAL-05 | ManualLinkModal renders as full-screen sheet on mobile | Architecture Pattern 1: existing modal → vaul Drawer with stacked column layout |
| TOUCH-03 | Form layouts stack vertically on mobile with full-width inputs | All 4 components require `max-md:flex-col` / `max-md:w-full` overrides on inputs |
</phase_requirements>

---

## Summary

Phase 24 converts four desktop-centric form overlays into mobile-appropriate full-screen bottom sheets, while preserving their desktop behavior unchanged. The project already uses `vaul` (v1.1.2) for the MoreSheet component built in Phase 21 — this is the confirmed library and the same `Drawer.Root / Drawer.Portal / Drawer.Overlay / Drawer.Content` pattern should be used for all four conversions.

The four components being converted have distinct current structures that require different approaches: SplitModal and ManualLinkModal are already `fixed inset-0` modals; RuleForm and ManualTransactionForm are inline-rendered (not modals at all) and need to be wrapped in a sheet on mobile. The key challenge for inline forms is that on desktop they expand inside page flow, but on mobile they must trigger a drawer. The strategy is to detect mobile via CSS-only: on desktop render the existing inline form; on mobile, render a trigger button that opens a vaul Drawer.

The critical insight from PITFALLS.md (Pitfall 4) is that full-screen sheets must have `overflow-y-auto` on the content body and a pinned footer with action buttons — otherwise form content is clipped on small screens when the keyboard opens. All inputs also need `text-base` (16px minimum) to prevent iOS auto-zoom, consistent with the TOUCH-02 requirement already applied in Phase 22.

**Primary recommendation:** Reuse the existing vaul `Drawer.Root` pattern from `MoreSheet.tsx` for all four conversions. No new libraries needed. Use `max-md:` Tailwind variants to swap between inline/centered-modal behavior (desktop) and vaul Drawer behavior (mobile).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vaul` | `^1.1.2` | Bottom sheet with drag-to-dismiss, iOS rubber-banding, backdrop | Already installed and used in Phase 21 MoreSheet — proven in this codebase |
| Tailwind v4 | `^4.2.2` | Responsive class variants for desktop vs mobile layout | Project standard; `max-md:` variants toggle between desktop/mobile rendering |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | existing | Drag handle indicator icon (optional) | Only if adding an explicit drag handle icon beyond the pill div |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vaul | Custom Sheet (see ARCHITECTURE.md Pattern 2) | Custom sheet was noted as an option but vaul is already installed and provides drag-to-dismiss natively; no custom implementation needed |
| vaul | Radix Dialog + custom mobile treatment | More complex, doesn't handle drag-to-dismiss; vaul is the right choice here |

**Installation:** No new packages needed. vaul `^1.1.2` is already in `packages/client/package.json`.

---

## Architecture Patterns

### Recommended Project Structure

No new files needed. All changes are in-place modifications to:

```
packages/client/src/
├── components/
│   ├── SplitModal.tsx          # MODIFY — add vaul Drawer wrapper for mobile
│   ├── ManualTransactionForm.tsx  # MODIFY — inline → vaul Drawer on mobile
│   ├── RuleForm.tsx            # MODIFY — inline → vaul Drawer on mobile
│   └── ManualLinkModal.tsx     # MODIFY — fixed modal → vaul Drawer + stacked layout
├── pages/
│   ├── TransactionsPage.tsx    # MODIFY — ManualTransactionForm trigger changes
│   └── RulesPage.tsx           # MODIFY — RuleForm trigger changes (if needed)
```

---

### Pattern 1: Fixed Modal → vaul Drawer (SplitModal, ManualLinkModal)

**What:** Existing `fixed inset-0` modals get replaced with a vaul `Drawer.Root` on mobile. Desktop keeps the original centered modal layout; mobile gets a bottom sheet.

**Key structural change for SplitModal:**

Current:
```tsx
<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
  <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
    {/* form content */}
  </div>
</div>
```

After — two separate render paths gated by CSS visibility:
```tsx
{/* Desktop: centered modal (hidden on mobile) */}
<div className="hidden md:flex fixed inset-0 bg-black/40 items-center justify-center z-50">
  <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
    {/* form content */}
  </div>
</div>

{/* Mobile: vaul bottom sheet (hidden on desktop) */}
<Drawer.Root open={true} onOpenChange={(o) => !o && onClose()} className="md:hidden">
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
    <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl max-h-[90svh] flex flex-col pb-safe">
      {/* drag handle pill */}
      <div className="mx-auto w-12 h-1.5 bg-gray-300 rounded-full mt-3 mb-2 flex-shrink-0" />
      {/* scrollable body */}
      <div className="overflow-y-auto flex-1 px-4 pb-4">
        {/* form content */}
      </div>
      {/* pinned footer */}
      <div className="flex-shrink-0 px-4 py-3 border-t flex justify-end gap-2">
        {/* Save / Cancel buttons */}
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

**Note on `max-h-[90svh]`:** Use `svh` (small viewport height — the stable size, excludes browser chrome) not `dvh` for the sheet max-height to prevent sheet resizing when Safari's toolbar appears/disappears. This is the correct unit for overlay max-heights per Pitfall 4.

---

### Pattern 2: Inline Form → vaul Drawer on Mobile (RuleForm, ManualTransactionForm)

**What:** These components currently render inline (in page flow, not as overlays). On mobile, the page should show a trigger button that opens a vaul Drawer; on desktop, the existing inline behavior is preserved.

**Strategy:** The parent page controls open state. On mobile, a "Create Rule" button opens a Drawer that contains the RuleForm. On desktop, the existing `{showForm && <RuleForm />}` inline render remains.

**Page-level approach (RulesPage.tsx example):**
```tsx
const [showForm, setShowForm] = useState(false);
const [editingRule, setEditingRule] = useState(null);

// Desktop: existing inline render (no change)
<div className="hidden md:block">
  {(showForm || editingRule) && (
    <RuleForm ... />
  )}
</div>

// Mobile: vaul Drawer containing the same RuleForm
<Drawer.Root
  open={(showForm || !!editingRule)}
  onOpenChange={(o) => { if (!o) { setShowForm(false); setEditingRule(null); } }}
  className="md:hidden"
>
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
    <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl max-h-[90svh] flex flex-col pb-safe">
      <div className="mx-auto w-12 h-1.5 bg-gray-300 rounded-full mt-3 mb-2 flex-shrink-0" />
      <div className="overflow-y-auto flex-1">
        <RuleForm ... />
      </div>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

**Alternative approach (simpler):** Rather than page-level Drawer, the `RuleForm` and `ManualTransactionForm` components can detect mobile themselves using a CSS-only technique. However, since `vaul` needs an `open` prop managed externally, the page-level approach is cleaner and avoids prop drilling.

**For ManualTransactionForm:** The component is currently always inline. The parent `TransactionsPage.tsx` controls `showAddForm` state. The Drawer open state maps directly to `showAddForm`. This is the same page-level pattern.

---

### Pattern 3: Form Layout Stacking (TOUCH-03)

**What:** All four forms have multi-column or horizontally-arranged inputs that must stack to full-width on mobile.

**Component-specific changes:**

**SplitModal** — split rows are `flex items-center gap-2` with CategoryPicker (`flex-1`) and amount input (`w-24`):
- On mobile: stack each split row to `flex-col` or keep row but make amount input wider (`max-md:w-full`)
- CategoryPicker + amount input in a row works on mobile if amount uses `flex-shrink-0 w-28`, CategoryPicker gets remaining width
- Better: `max-md:flex-col max-md:gap-1` on each split row, with both inputs `max-md:w-full`

**ManualTransactionForm** — `flex flex-wrap gap-3` with fixed-width subcontainers (`flex-col`, `w-28`, `flex-1 min-w-32`):
- Change to `max-md:flex-col max-md:w-full` on all child `<div>` containers
- All inputs become full-width on mobile: `max-md:w-full`

**RuleForm** — already uses `grid grid-cols-1 gap-3 sm:grid-cols-2` which stacks to single column below `sm:` (640px). This is already mobile-appropriate for layout. Inputs already have `w-full`. TOUCH-03 is likely satisfied for RuleForm with minimal changes.

**ManualLinkModal** — `grid grid-cols-2 gap-4`. On mobile this must stack to single column: `max-md:grid-cols-1`.
- The two transaction search panels (A and B) become sequential sections
- This means the full content is taller than the current 2-column layout — the `overflow-y-auto` on the sheet body handles this

---

### Pattern 4: vaul Drawer Already Known in Codebase

The `MoreSheet.tsx` component (Phase 21) is the reference implementation. Key details verified from that file:

```tsx
import { Drawer } from 'vaul';

<Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
    <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl pb-safe">
      <div className="mx-auto w-12 h-1.5 bg-gray-300 rounded-full mt-3 mb-4" />
      {/* content */}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

- `Drawer` is imported from `'vaul'` (named export)
- `onOpenChange={(o) => !o && onClose()}` handles backdrop tap + drag-to-dismiss → both call `onClose`
- `pb-safe` is a custom Tailwind utility (defined in Phase 21) for `padding-bottom: env(safe-area-inset-bottom)`
- The drag handle is a manual pill `div` (vaul doesn't inject it automatically)
- No `snapPoints` are used — sheet slides up freely and dismisses on drag down

**MODAL-03 requirement (drag-to-dismiss + backdrop tap):** vaul handles both natively. Drag-to-dismiss is built-in. Backdrop tap fires `onOpenChange(false)` via `Drawer.Overlay` click detection. No additional code needed.

---

### Anti-Patterns to Avoid

- **Duplicate form content:** Don't copy the form JSX into both desktop and mobile paths. Extract shared form content into the component itself and wrap with different shells. Or use a single vaul Drawer that conditionally applies mobile-only styles.
- **Using `dvh` for sheet max-height:** Use `svh` (stable viewport height) for the sheet `max-h`. `dvh` changes when the iOS keyboard opens, causing the sheet to resize. `svh` is stable, and the inner content scrolls.
- **Body scroll lock:** vaul handles scroll locking internally when `Drawer.Root` is open. Do not add manual `document.body.style.overflow = 'hidden'` — it conflicts with vaul's scroll lock management.
- **Missing `overflow-y-auto flex-1` on sheet content:** Without this, form content is clipped when keyboard is open on small screens.
- **Missing pinned footer:** Save/Cancel buttons inside the scrollable body area will scroll out of view. Always put action buttons in a `flex-shrink-0` footer below the scrollable area.
- **Using `h-screen` or `100vh` in sheet height:** Never. The sheet uses `max-h-[90svh]` and expands to fit content.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-to-dismiss bottom sheet | Custom translate-y drag handler with touch events | `vaul` `Drawer.Root` | iOS rubber-banding, velocity detection, accessibility are extremely complex to replicate |
| Backdrop tap detection | `onClick` on a backdrop `div` | vaul's built-in `onOpenChange` | vaul handles pointer events, touch events, and accessibility correctly |
| Body scroll locking | `document.body.style.overflow = 'hidden'` | vaul's built-in scroll lock | vaul coordinates with its own portal; manual approach causes conflicts |

**Key insight:** vaul was chosen specifically for this project in Phase 21 for these properties. All sheet requirements in this phase should use it.

---

## Common Pitfalls

### Pitfall 1: Sheet Content Clipped by Keyboard Open

**What goes wrong:** The vaul sheet has `max-h-[90svh]` but the inner content `div` doesn't have `overflow-y-auto`. When the iOS keyboard opens, the visual viewport shrinks but the sheet stays at 90svh of the layout viewport. Form content below the fold is unreachable.

**Why it happens:** Forgetting `overflow-y-auto flex-1` on the scrollable body area inside the Drawer.Content.

**How to avoid:** Always structure Drawer.Content as a flex column: drag handle (`flex-shrink-0`) → scrollable body (`overflow-y-auto flex-1`) → action footer (`flex-shrink-0`).

**Warning signs:** Save button is not visible without scrolling; form content is cut off at the bottom of the screen.

---

### Pitfall 2: Action Buttons Scroll Out of View

**What goes wrong:** Save/Cancel buttons are inside the scrollable body div. On a small screen with many form fields, the user must scroll to the bottom to submit. If the keyboard is open, the bottom may not be reachable.

**How to avoid:** Separate the scrollable content area from the action buttons with a `flex-shrink-0` container after the scrollable div, inside `Drawer.Content`.

---

### Pitfall 3: ManualLinkModal Desktop/Mobile Content Duplication

**What goes wrong:** ManualLinkModal has `max-w-4xl max-h-[80vh]` with a `grid grid-cols-2` layout. On mobile, this can't be made responsive within the existing structure without significant rearrangement.

**How to avoid:** Apply `max-md:grid-cols-1` to change from 2-column to single-column. The two search panels stack vertically. The sheet's `overflow-y-auto` body handles the additional height. No content duplication needed — one layout adapts via Tailwind.

---

### Pitfall 4: vaul `className` on `Drawer.Root` is Not for Visibility

**What goes wrong:** Adding `className="md:hidden"` to `Drawer.Root` to hide the drawer on desktop. vaul renders into a portal; `className` on `Drawer.Root` doesn't propagate to the portal content.

**How to avoid:** For desktop/mobile switching:
- Option A (recommended): Use the dual-render pattern — desktop-only modal div with `hidden md:flex`, mobile-only Drawer.Root. Both are always in the JSX but only one is visible. The Drawer `open` state controls whether it actually appears.
- Option B: Check `window.matchMedia` in the open handler and conditionally skip opening the Drawer on desktop. Then show the centered modal with a separate state.

Option A is simpler and consistent with the CSS-only approach used throughout this project.

---

### Pitfall 5: RuleForm `onSaved` Callback Needs RetroactivePreview

**What goes wrong:** In `RulesPage.tsx`, after `onSaved` is called, `setPreviewRuleId(ruleId)` is set to show `RetroactivePreview`. If the form is inside a Drawer on mobile, the Drawer must close before RetroactivePreview is shown — or RetroactivePreview appears behind the closed drawer.

**How to avoid:** The `onSaved` callback in the page already calls `setShowForm(false)` and `setEditingRule(null)`, which will close the Drawer (since Drawer `open` depends on these). `setPreviewRuleId` runs after, which is fine. Verify the order of state updates ensures the Drawer closes cleanly before RetroactivePreview appears.

---

## Code Examples

### Verified Pattern: MoreSheet.tsx (Phase 21 reference)

```tsx
// Source: packages/client/src/components/MoreSheet.tsx (existing codebase)
import { Drawer } from 'vaul';

<Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50" />
    <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl pb-safe">
      <div className="mx-auto w-12 h-1.5 bg-gray-300 rounded-full mt-3 mb-4" />
      <nav className="px-4 pb-6 space-y-1">
        {/* nav items */}
      </nav>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

### Full Sheet Content Structure (Form Sheets)

```tsx
// Pattern for form sheets with scrollable content and pinned footer
<Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl max-h-[90svh] flex flex-col pb-safe">
  {/* Drag handle */}
  <div className="mx-auto w-12 h-1.5 bg-gray-300 rounded-full mt-3 mb-2 flex-shrink-0" />

  {/* Sheet header (title + close button) */}
  <div className="flex justify-between items-center px-4 py-2 border-b flex-shrink-0">
    <h3 className="text-lg font-semibold">Sheet Title</h3>
    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
  </div>

  {/* Scrollable content */}
  <div className="overflow-y-auto flex-1 px-4 py-4">
    {/* form fields */}
  </div>

  {/* Pinned footer with actions */}
  <div className="flex-shrink-0 px-4 py-3 border-t flex justify-end gap-2">
    <button onClick={onClose} className="min-h-[44px] px-4 text-sm text-gray-600">Cancel</button>
    <button onClick={handleSave} className="min-h-[44px] px-4 text-sm bg-blue-600 text-white rounded">Save</button>
  </div>
</Drawer.Content>
```

### Dual-Render Desktop/Mobile Pattern

```tsx
// Desktop modal: centered (hidden on mobile)
<div className="hidden md:flex fixed inset-0 bg-black/40 items-center justify-center z-50">
  <div className="bg-white rounded-lg w-full max-w-lg mx-4 p-6">
    {/* existing content unchanged */}
  </div>
</div>

// Mobile drawer (rendered always, open state controls visibility)
<Drawer.Root open={isOpen} onOpenChange={(o) => !o && onClose()}>
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 md:hidden" />
    <Drawer.Content className="fixed bottom-0 inset-x-0 z-50 bg-white rounded-t-2xl max-h-[90svh] flex flex-col pb-safe md:hidden">
      {/* sheet structure */}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

Note: Apply `md:hidden` to `Drawer.Overlay` and `Drawer.Content` (not `Drawer.Root`) because these elements render in a portal and are what's actually visible.

### TOUCH-03: Input Stacking

```tsx
// ManualTransactionForm: change flex-wrap horizontal layout to vertical on mobile
// Before:
<div className="flex flex-wrap gap-3 items-start">

// After:
<div className="flex flex-wrap gap-3 items-start max-md:flex-col">
  {/* each child div also gets max-md:w-full */}
  <div className="flex flex-col max-md:w-full">
    <input className="... max-md:w-full" />
  </div>
```

---

## Component-by-Component Implementation Guide

### SplitModal.tsx

**Current:** `fixed inset-0` centered modal, `max-w-lg mx-4`
**Change needed:**
- Add dual-render: desktop keeps existing div; mobile wraps in vaul Drawer
- Split rows: add `max-md:flex-col max-md:gap-2` to each row div; amount input `max-md:w-full`
- All buttons: ensure `min-h-[44px]` on mobile
- Remove Escape key handler (vaul handles keyboard dismissal via its own accessibility layer)

**Complexity:** LOW-MEDIUM. The form logic doesn't change; only the shell wrapper.

### ManualTransactionForm.tsx

**Current:** Inline `bg-gray-100 border rounded-lg p-4` div rendered in page flow. Not a modal at all.
**Change needed:**
- On desktop: keep as-is (inline in TransactionsPage)
- On mobile: TransactionsPage renders a vaul Drawer containing ManualTransactionForm
- The component itself doesn't need a modal wrapper added — the parent page provides the Drawer on mobile
- Form layout: `flex flex-wrap gap-3` → `max-md:flex-col`; all child divs get `max-md:w-full`

**Complexity:** MEDIUM. Requires changes to both the component (TOUCH-03) and the parent page (Drawer wrapping).

### RuleForm.tsx

**Current:** Inline `bg-white border rounded-lg p-4` div rendered in RulesPage when `showForm || editingRule`
**Change needed:**
- Already uses `grid grid-cols-1 gap-3 sm:grid-cols-2` — stacks at < 640px. TOUCH-03 may already be satisfied.
- Inputs already have `w-full`. Likely only minor adjustments needed.
- RulesPage wraps the RuleForm in a vaul Drawer on mobile; keeps inline on desktop
- `onSaved` callback coordination: Drawer close → RetroactivePreview display (verify order)

**Complexity:** LOW-MEDIUM. The form itself is mostly ready for mobile; main work is adding the Drawer wrapper in RulesPage.

### ManualLinkModal.tsx

**Current:** `fixed inset-0` modal, `max-w-4xl max-h-[80vh]`, `grid grid-cols-2 gap-4`
**Change needed:**
- Add dual-render: desktop keeps existing modal; mobile wraps content in vaul Drawer
- Grid: `grid grid-cols-2 gap-4` → `max-md:grid-cols-1` (columns stack on mobile)
- The `max-h-[80vh]` on the desktop modal inner div is fine; the Drawer handles height itself
- Already has backdrop click handling (`onClick={onClose}` on outer, `stopPropagation` on inner) — vaul replaces this on mobile
- Transaction list items in filtered lists: rows are `px-3 py-2 text-sm` — consider `max-md:py-3` to meet 44px TOUCH-01 (verify computed height ≥ 44px)

**Complexity:** MEDIUM. The 2-column → 1-column change creates a taller layout; the sheet body needs proper scroll setup.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSS-only custom bottom sheet | vaul (drag-to-dismiss library) | Phase 21 of this project | Drag gesture + iOS rubber-banding without custom code |
| `vh` units | `svh`/`dvh` units | Safari 15.4 (2022), stable 2023 | Correct sheet max-heights on iOS Safari |

**Not deprecated in this codebase:**
- `Drawer.Root / Drawer.Portal / Drawer.Overlay / Drawer.Content` — this is the current vaul API as used in Phase 21

---

## Open Questions

1. **`md:hidden` on Drawer portal elements**
   - What we know: vaul renders `Drawer.Overlay` and `Drawer.Content` into a portal; CSS classes on these elements should work normally
   - What's unclear: Whether Tailwind's `md:hidden` on portal-rendered elements respects the viewport breakpoint correctly (portals render at body root, outside any parent with responsive classes)
   - Recommendation: Verify with a quick test — the CSS is viewport-based, not DOM-inheritance-based, so `md:hidden` should work. Alternatively use JS: only render `<Drawer.Root>` when below md breakpoint by checking `window.matchMedia`.

2. **Keyboard Escape key on SplitModal**
   - What we know: SplitModal has a manual `keydown` listener for Escape key (line 29-34 in SplitModal.tsx)
   - What's unclear: Does vaul handle Escape key dismissal internally, making the manual listener redundant?
   - Recommendation: Test with vaul — vaul does handle Escape for the Drawer. The manual listener can be removed for the Drawer path. Keep it for the desktop modal path since the desktop modal has no vaul.

3. **RetroactivePreview display after RuleForm save on mobile**
   - What we know: `setPreviewRuleId(ruleId)` in RulesPage runs after `setShowForm(false)`; RetroactivePreview renders inline below the rules list
   - What's unclear: On mobile, does the Drawer close animation complete before RetroactivePreview renders and requires the user to see it?
   - Recommendation: Test visually. If the Drawer close is fast enough, the inline RetroactivePreview appearing after is fine. If not, consider a short delay or a separate sheet for the preview.

---

## Validation Architecture

> Skipping — `workflow.nyquist_validation` is not present in `.planning/config.json` (defaults to disabled).

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection: `packages/client/src/components/MoreSheet.tsx` — confirmed vaul API, `pb-safe` utility, drag handle pattern
- Direct codebase inspection: `packages/client/src/components/SplitModal.tsx` — current structure, escape key handler, layout
- Direct codebase inspection: `packages/client/src/components/ManualTransactionForm.tsx` — inline (not modal) form, `flex flex-wrap` layout
- Direct codebase inspection: `packages/client/src/components/RuleForm.tsx` — `grid grid-cols-1 sm:grid-cols-2`, already mostly mobile-ready
- Direct codebase inspection: `packages/client/src/components/ManualLinkModal.tsx` — `grid grid-cols-2`, `max-w-4xl`, existing backdrop click handler
- Direct codebase inspection: `packages/client/src/pages/TransactionsPage.tsx` — confirms inline ManualTransactionForm and SplitModal rendering patterns
- Direct codebase inspection: `packages/client/src/pages/RulesPage.tsx` — inline RuleForm + RetroactivePreview sequencing
- `.planning/research/ARCHITECTURE.md` — existing sheet conversion pattern documented (items-end approach vs vaul)
- `.planning/research/PITFALLS.md` — Pitfall 4 (modal mobile issues), keyboard/viewport concerns

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` — confirms vaul as the project standard, `max-md:` as the Tailwind variant convention
- `.planning/REQUIREMENTS.md` — MODAL-01 through MODAL-05 and TOUCH-03 requirements verbatim

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — vaul already installed and working; same API used in Phase 21
- Architecture: HIGH — patterns derived directly from existing codebase code
- Pitfalls: HIGH — based on component code inspection and PITFALLS.md from Phase 21 research

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable; vaul and Tailwind v4 APIs don't change frequently)
