# Plan 27-02 Summary: Navigation wiring

**Status:** Complete
**Completed:** 2026-03-24

## What was built

Wired the Import page into all navigation entry points:

1. **Route** — Added `<Route path="import" element={<ImportPage />} />` to `app.tsx`
2. **Desktop nav** — Added "Import" NavLink after "Chat" in `Layout.tsx` with existing active/hover styling
3. **Mobile nav** — Added `{ to: '/import', icon: Upload, label: 'Import' }` to `MORE_LINKS` array in `MoreSheet.tsx`

## Key files

- `packages/client/src/app.tsx` (modified)
- `packages/client/src/components/Layout.tsx` (modified)
- `packages/client/src/components/MoreSheet.tsx` (modified)

## Requirements addressed

NAV-01, NAV-02, NAV-03
