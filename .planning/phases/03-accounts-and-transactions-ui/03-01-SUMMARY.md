---
phase: 03-accounts-and-transactions-ui
plan: 01
status: complete
started: 2026-03-22
completed: 2026-03-22
---

# Plan 03-01: React App Shell — Summary

## What Was Built

Bootstrapped the React client from a bare main.ts into a full SPA with:
- React 19 + ReactDOM with createRoot
- tRPC v11 client with httpBatchLink to /trpc (proxied by Vite)
- TanStack Query v5 QueryClientProvider
- React Router v7 BrowserRouter with Accounts and Transactions routes
- Tailwind CSS v4 via @tailwindcss/vite plugin
- Persistent Layout with navigation bar and Outlet
- formatCurrency utility for integer cents to "$X,XXX.XX" conversion

## Key Decisions

- Used relative path import for AppRouter type (`../../server/src/sync/trpc-router.js`) instead of workspace package reference, since the server doesn't export types from package.json
- Client tsconfig uses `moduleResolution: "bundler"` and includes server source files directly for type checking (no project references needed since Vite handles bundling)
- Placeholder pages for Accounts and Transactions will be replaced in plans 02 and 03

## Key Files

### Created
- `packages/client/src/main.tsx` — React entry with tRPC + QueryClient providers
- `packages/client/src/trpc.ts` — createTRPCContext with AppRouter type
- `packages/client/src/app.tsx` — BrowserRouter with route definitions
- `packages/client/src/components/Layout.tsx` — Nav bar with Outlet
- `packages/client/src/lib/format.ts` — Currency formatting utility
- `packages/client/src/styles/app.css` — Tailwind import
- `packages/client/src/pages/AccountsPage.tsx` — Placeholder
- `packages/client/src/pages/TransactionsPage.tsx` — Placeholder

### Modified
- `packages/client/vite.config.ts` — Added React + Tailwind plugins
- `packages/client/tsconfig.json` — JSX, bundler resolution, server includes
- `packages/client/index.html` — CSS link + main.tsx entry
- `packages/client/package.json` — All new dependencies

### Deleted
- `packages/client/src/main.ts` — Replaced by main.tsx

## Self-Check

- [x] React app entry created with providers
- [x] tRPC client configured with httpBatchLink to /trpc
- [x] TanStack QueryClientProvider wraps the app
- [x] React Router BrowserRouter with routes
- [x] Layout with persistent navigation
- [x] Tailwind CSS v4 configured
- [x] formatCurrency utility works
- [x] TypeScript compiles without errors
- [x] All existing tests pass (63/63)
