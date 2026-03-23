---
phase: quick
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/client/src/components/InlineConfirm.tsx
  - packages/client/src/pages/RulesPage.tsx
  - packages/client/src/pages/CategoriesPage.tsx
autonomous: true
must_haves:
  truths:
    - "Delete buttons show inline confirmation instead of browser confirm dialog"
    - "User can cancel a delete confirmation and nothing happens"
    - "User can confirm a delete and the item is removed"
  artifacts:
    - path: "packages/client/src/components/InlineConfirm.tsx"
      provides: "Reusable inline confirmation wrapper component"
    - path: "packages/client/src/pages/RulesPage.tsx"
      provides: "Rule delete uses inline confirm"
    - path: "packages/client/src/pages/CategoriesPage.tsx"
      provides: "Category and group delete use inline confirm"
  key_links:
    - from: "RulesPage.tsx"
      to: "InlineConfirm.tsx"
      via: "import and render around delete button"
    - from: "CategoriesPage.tsx (SortableCategory, SortableGroup)"
      to: "InlineConfirm.tsx"
      via: "import and render around delete buttons"
---

<objective>
Replace all three window.confirm() calls with non-blocking inline confirmation UI.

Purpose: window.confirm blocks the browser event loop and provides poor UX. Inline confirmation keeps the user in context and matches the app's Tailwind styling.
Output: An InlineConfirm component used in RulesPage and CategoriesPage delete actions.
</objective>

<execution_context>
@/Users/seanspade/.claude/get-shit-done/workflows/execute-plan.md
@/Users/seanspade/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@packages/client/src/pages/RulesPage.tsx
@packages/client/src/pages/CategoriesPage.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create InlineConfirm component</name>
  <files>packages/client/src/components/InlineConfirm.tsx</files>
  <action>
    Create a small InlineConfirm component that wraps a trigger element (the delete button) and replaces it with a confirmation prompt when clicked.

    Props interface:
    - `message: string` — confirmation text (e.g., "Delete rule "Amazon"?")
    - `onConfirm: () => void` — called when user clicks Confirm
    - `children: React.ReactNode` — the trigger element (rendered when not confirming)

    Behavior:
    - Default state: renders children normally
    - When children are clicked: replaces with inline confirmation showing the message, a red "Delete" button, and a gray "Cancel" button
    - Clicking "Delete" calls onConfirm and resets state
    - Clicking "Cancel" resets state (hides confirmation, shows children again)
    - Pressing Escape while confirmation is visible resets state

    Styling: Use Tailwind classes consistent with the app — text-sm, red-600 for destructive confirm button, gray-500 for cancel, flex with gap-2 layout. Keep it compact since it replaces small delete buttons/icons in tight table cells and list rows.

    The component should manage its own `confirming` boolean state internally. Wrap children in a span with onClick to trigger confirmation mode.
  </action>
  <verify>
    <automated>cd /Users/seanspade/Documents/Source/minverva-money && npx tsc --noEmit --project packages/client/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>InlineConfirm.tsx exists, exports a working component, TypeScript compiles without errors</done>
</task>

<task type="auto">
  <name>Task 2: Replace all window.confirm calls with InlineConfirm</name>
  <files>packages/client/src/pages/RulesPage.tsx, packages/client/src/pages/CategoriesPage.tsx</files>
  <action>
    Replace all three window.confirm() usages with InlineConfirm.

    **RulesPage.tsx (line 117-126):**
    Replace the delete button+confirm block with:
    ```
    <InlineConfirm message={`Delete rule "${rule.name}"?`} onConfirm={() => deleteMut.mutate({ id: rule.id })}>
      <button className="text-red-600 hover:text-red-800">Delete</button>
    </InlineConfirm>
    ```
    Import InlineConfirm from '../components/InlineConfirm'.

    **CategoriesPage.tsx SortableCategory (line 124-134):**
    Replace the delete button+confirm with:
    ```
    <InlineConfirm message={`Delete "${category.name}"? Transactions become uncategorized.`} onConfirm={() => onDelete(category.id)}>
      <button className="text-gray-400 hover:text-red-500 text-sm ml-2" title="Delete category">X</button>
    </InlineConfirm>
    ```

    **CategoriesPage.tsx SortableGroup (line 218-232):**
    Build the message dynamically (same logic as current code — check catCount > 0 for detailed message). Replace with:
    ```
    <InlineConfirm message={group.categories.length > 0 ? `Delete "${group.name}" and ${group.categories.length} categories? Transactions become uncategorized.` : `Delete "${group.name}"?`} onConfirm={() => onDeleteGroup(group.id)}>
      <button className="text-gray-400 hover:text-red-500 text-sm ml-2" title="Delete group">X</button>
    </InlineConfirm>
    ```

    Import InlineConfirm at the top of CategoriesPage.tsx.

    Ensure zero window.confirm calls remain in either file. Remove any now-unused imports.
  </action>
  <verify>
    <automated>cd /Users/seanspade/Documents/Source/minverva-money && npx tsc --noEmit --project packages/client/tsconfig.json 2>&1 | head -20 && grep -r "window.confirm" packages/client/src/ && echo "FAIL: window.confirm still present" || echo "PASS: no window.confirm calls"</automated>
  </verify>
  <done>All three window.confirm calls replaced with InlineConfirm. TypeScript compiles. No window.confirm references remain in client source.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes for client package
- `grep -r "window.confirm" packages/client/src/` returns no results
- InlineConfirm component exists and is imported in both pages
</verification>

<success_criteria>
- Zero window.confirm() calls remain in RulesPage.tsx and CategoriesPage.tsx
- Delete actions in rules table, category rows, and group headers show inline confirmation UI
- Inline confirm shows message + Delete/Cancel buttons, Cancel dismisses, Delete executes the action
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/1-replace-window-confirm-calls-with-inline/1-SUMMARY.md`
</output>
