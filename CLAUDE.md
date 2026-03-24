# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Minerva Money is a single-user personal budgeting app (Monarch Money replacement) hosted on a home iMac. It's a TypeScript monorepo with three packages: `client`, `server`, and `shared`.

## Commands

```bash
# Development (runs server + client concurrently)
npm run dev

# Build all packages (shared → server → client, order matters)
npm run build

# Production
npm run start:prod

# Tests
npm test                          # run all tests (vitest)
npx vitest run packages/server/src/rules  # run tests in a specific directory
npx vitest run -t "rule matching"         # run tests matching a name pattern

# Lint
npm run lint
```

## Architecture

```
React SPA (Vite, port 5173) → tRPC → Express (port 3001) → Services → SQLite (better-sqlite3)
```

- **Monorepo**: npm workspaces — `packages/client`, `packages/server`, `packages/shared`
- **API**: tRPC for type-safe client-server communication. Main router at `packages/server/src/sync/trpc-router.ts` with 13 nested routers
- **Database**: SQLite with WAL mode, foreign keys enabled. Migrations in `packages/server/migrations/`. All money values stored as **integer cents** to avoid floating-point errors
- **Shared package**: Exports only the `Cents` type
- **Client data layer**: TanStack Query + tRPC client (`packages/client/src/trpc.ts`)
- **Scheduling**: `croner` library for cron jobs — sync (6 AM/6 PM) and budget funding (15th/last day)
- **AI Agent**: Claude Agent SDK with MCP server and 21 tools wrapping the service layer (`packages/server/src/agent/`)

### Key Service Modules (all under `packages/server/src/`)

| Module | Purpose |
|--------|---------|
| `sync/` | SimpleFIN client, transaction sync, rate limiting, deduplication |
| `categories/` | Category groups, manual categorization, transaction splits |
| `rules/` | Categorization rules engine (merchant/amount/memo matching, specificity scoring) |
| `budget/` | Envelope budgeting — allocations, rollovers, auto-funding |
| `transfers/` | Auto-detect and link offsetting transfers across accounts |
| `reports/` | Spending by category, spending over time, net worth trends |
| `backup/` | Atomic SQLite backup to iCloud Drive |
| `agent/` | Claude AI agent with MCP tools |
| `db/` | Connection setup, migration runner |

### Client Structure (`packages/client/src/`)

Pages map 1:1 to features: `DashboardPage`, `TransactionsPage`, `BudgetPage`, `CategoriesPage`, `RulesPage`, `TransfersPage`, `ReportsPage`, `ChatPage`. All custom Tailwind components (no component library).

## Deployment

- **Process management**: macOS launchd (plist files in `deploy/`)
- **Scripts**: `deploy/setup.sh` (first-time), `deploy/deploy.sh` (updates)
- **Runtime**: Node 22 with `--env-file=.env` (no dotenv)
- **Express serves both** the tRPC API and the built client static files on port 3001
- **Health check**: `GET /health` returns `{ "status": "ok" }`
- **Backup**: Every 6 hours via launchd, also after each sync. Atomic `sqlite3 .backup` to iCloud Drive

## Key Conventions

- ESM throughout (`"type": "module"` in all packages)
- TypeScript strict mode, ES2022 target, Node16 module resolution
- Zod 4 for schema validation
- No auth layer (single user on private network)
- Planning docs live in `.planning/` (STATE.md tracks current milestone, PROJECT.md has requirements)
