# Stack Research

**Domain:** Personal budgeting / finance web app (self-hosted)
**Researched:** 2026-03-22
**Confidence:** HIGH

## Core Stack (Pre-decided)

These are locked in per project constraints. Not up for debate.

| Technology | Version | Purpose | Notes |
|------------|---------|---------|-------|
| React | 19.x | UI framework | Latest stable |
| Tailwind CSS | 4.x | Styling (custom components, no UI library) | CSS-first config in v4 |
| Express | 4.x | HTTP server | Stable, well-understood |
| tRPC | 11.x (v11.12.0) | End-to-end type-safe API layer | v11 adds SSE subscriptions, FormData support |
| better-sqlite3 | 11.x | SQLite driver | Synchronous API, excellent perf for single-user |
| TanStack Query | 5.x | Server state management | Pairs with tRPC via @trpc/react-query |
| TypeScript | 5.x | Language | Full-stack type safety |

## Recommended Stack

### Build & Dev Tools

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vite | 8.x (8.0.1) | Frontend build tool | New standard for React apps. Vite 8 ships Rolldown (Rust bundler) for 10-30x faster builds. Native ESM dev server with instant HMR. CRA is dead. |
| tsx | 4.x | TypeScript runner for server | Zero-config, runs .ts files directly in Node.js. No build step needed for dev. Faster than ts-node. |
| tsup | 8.x | Server production build | Bundles Express/tRPC server for production. Simple config, outputs CJS. Only needed for deployment. |

**Confidence:** HIGH -- Vite 8 confirmed released 2026-03-12. tsx and tsup are standard Node.js TypeScript tooling.

### Validation

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| Zod | 4.x (4.3.6) | Runtime validation & tRPC input schemas | Default validator for tRPC. v4 has faster parsing, smaller bundles, better TypeScript compile times. Defines API contract once, validates at runtime, infers types at compile time. |

**Confidence:** HIGH -- Zod is the canonical tRPC validator per official docs.

### Date/Time Handling

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| date-fns | 4.x (4.1.0) | Date manipulation, formatting, comparison | Tree-shakeable (only import what you use). Functional API fits TypeScript well. v4 adds first-class timezone support via @date-fns/tz. Needed for budget period calculations (15th/last day), transaction date handling, and trend charts. |

**Confidence:** HIGH -- date-fns v4 confirmed via npm/official blog. Functional, immutable, tree-shakeable.

**Why not dayjs:** dayjs is 2KB but requires plugins for everything (timezone, formatting, etc.) and the plugin system adds complexity. date-fns is more TypeScript-native and tree-shakes to comparable sizes when you only import what you need.

**Why not Temporal API:** Still Stage 3 as of March 2026. Only available in Firefox Nightly. Not production-ready. Revisit in 2027.

### Money/Currency Handling

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| currency.js | 2.x (2.0.3) | Currency arithmetic and formatting | Lightweight (1.14KB), zero dependencies. Handles floating-point precision by working with integers internally. Simple API: `currency(19.99).add(0.01)` returns correct result. Includes built-in formatting (`$1,000.00`). |

**Confidence:** MEDIUM -- currency.js is stable and widely used but hasn't had a release in a while. The API is simple and correct, which is what matters for a single-currency (USD) personal finance app.

**Why not dinero.js:** dinero.js v2 is still in alpha. v1 works but the project's future is uncertain. Overkill for a single-currency app -- dinero.js shines for multi-currency with exchange rates.

**Why not raw integers:** You could store cents as integers and format manually, but currency.js handles edge cases (rounding, display) that you would otherwise have to write yourself. The 1KB cost is worth the correctness guarantee.

### Charts & Visualization

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| Recharts | 3.x (3.8.0) | Spending trends, category breakdowns, net worth over time | Declarative React components built on D3/SVG. Line charts (trends), bar charts (category spending), area charts (net worth). 3.6M weekly downloads, excellent docs. Good enough for a personal finance dashboard -- you need maybe 4-5 chart types, not custom visualizations. |

**Confidence:** HIGH -- Recharts 3.8.0 confirmed on npm. Most popular React chart library.

**Why not Chart.js/react-chartjs-2:** Canvas-based, harder to style consistently with Tailwind. SVG (Recharts) integrates better with React's component model and is easier to customize.

**Why not Visx:** Low-level D3 primitives. You would spend days building what Recharts gives you in an hour. Visx is for when Recharts can not do what you need -- unlikely for standard finance charts.

### Database Migrations

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| Custom migration runner | N/A | Schema versioning via `PRAGMA user_version` | For a single-user SQLite app, a heavyweight migration framework is unnecessary. Write a simple runner (~50 lines) that: reads `PRAGMA user_version`, runs numbered SQL files in `/migrations/`, updates `user_version` in a transaction. SQLite's `user_version` pragma is purpose-built for this. |

**Confidence:** HIGH -- `PRAGMA user_version` is a documented SQLite feature. This pattern is well-established (see Actual Budget, Litestream docs, multiple blog posts).

**Why not Knex/Drizzle/Prisma:** All are ORMs or query builders that add abstraction over better-sqlite3's already-clean API. You would be adding a dependency to generate SQL that you can write directly. For a single-user app with ~10-15 tables, raw SQL migrations are simpler and more transparent.

**Why not @blackglory/better-sqlite3-migrations:** It works, but it is a thin wrapper you can replicate in 50 lines without a dependency. Fewer dependencies = fewer things to break.

### Testing

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| Vitest | 4.x (4.1.0) | Unit and integration tests | Native Vite integration (shared config, transforms, plugins). 10-20x faster than Jest in watch mode. ESM-native (no CJS/ESM interop issues). Jest-compatible API so existing knowledge transfers. |
| @testing-library/react | 16.x (16.3.2) | React component testing | Standard for testing React components by behavior, not implementation. Works with Vitest out of the box. |
| jsdom | latest | DOM environment for Vitest | Vitest's default browser environment for component tests. Lightweight, good enough for a personal finance app's UI tests. |

**Confidence:** HIGH -- Vitest 4.1.0 confirmed on npm. @testing-library/react 16.3.2 confirmed. Standard pairing for React + Vite projects.

**Why not Jest:** Jest requires extra config for ESM/TypeScript, is slower, and does not share Vite's transform pipeline. For a Vite project, Vitest is the obvious choice.

### HTTP Client (SimpleFIN Integration)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| Node.js built-in `fetch` | N/A (Node 18+) | HTTP requests to SimpleFIN API | SimpleFIN is a simple REST API (GET with auth header). No need for axios or got. Node's built-in fetch (stable since Node 18) handles this with zero dependencies. |

**Confidence:** HIGH -- SimpleFIN API is documented REST. Node.js fetch is stable and sufficient.

### Scheduled Tasks

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| croner | 9.x | Cron scheduling for sync and backup jobs | TypeScript-native, handles DST/timezone edge cases correctly. Needed for: twice-daily SimpleFIN sync, 6-hour backup schedule, daily balance snapshots. Lightweight with no dependencies. |

**Confidence:** MEDIUM -- croner is well-regarded but less popular than node-cron. Chosen for TypeScript support and correct timezone handling, which matters for financial date boundaries.

**Why not node-cron:** node-cron lacks proper timezone/DST handling. For a finance app where "sync at midnight" must mean actual midnight (not DST-shifted), croner is safer.

**Why not system cron:** The app runs on a home iMac. Keeping scheduling in-process is simpler to deploy and monitor (sync status indicator requires in-app awareness).

### Logging

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| pino | 9.x | Structured JSON logging | Fast, low-overhead, structured logs. Log sync results, errors, and audit trail. JSON output is easy to search. pino-pretty for dev readability. |

**Confidence:** MEDIUM -- pino is the standard Node.js logger. Version should be verified at install time.

### Supporting Utilities

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nanoid | 5.x | Generate unique IDs | Transaction dedup hashes, internal record IDs. Smaller and faster than uuid. |
| superjson | 2.x | Serialize Dates/BigInt over tRPC | tRPC transformer for rich types. Dates come back as Date objects, not strings. |

**Confidence:** MEDIUM -- Standard tRPC ecosystem libraries. Verify versions at install time.

## Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| ESLint | Code quality | Use flat config (eslint.config.js). typescript-eslint for type-aware rules. |
| Prettier | Code formatting | Set once, never think about formatting again. |
| lint-staged + husky | Pre-commit hooks | Run ESLint + Prettier on staged files only. |

## Installation

```bash
# Core (pre-decided)
npm install react react-dom @trpc/server @trpc/client @trpc/react-query @tanstack/react-query better-sqlite3 express

# Supporting libraries
npm install zod date-fns recharts currency.js croner pino nanoid superjson

# Dev dependencies
npm install -D typescript vite @vitejs/plugin-react vitest @testing-library/react jsdom tsx tsup @types/better-sqlite3 @types/express eslint prettier pino-pretty
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| date-fns | dayjs | If bundle size is the absolute top priority and you only need basic formatting |
| currency.js | Raw integer math | If you want zero dependencies and are willing to handle formatting/rounding yourself |
| Recharts | Visx | If you need highly custom, brand-specific chart designs that Recharts cannot produce |
| Custom migrations | Drizzle ORM | If the schema grows beyond ~20 tables and you want generated type-safe queries |
| croner | System crontab | If you move to a Linux server and want OS-level scheduling |
| Vitest | Jest | Never, for this project. Vitest is strictly better with Vite. |
| pino | console.log | For prototyping only. Switch to pino before any real data flows. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Moment.js | Deprecated, mutable, massive bundle (329KB) | date-fns |
| Prisma | Heavy ORM with engine binary. Overkill for SQLite single-user. Adds cold-start time. | Raw SQL with better-sqlite3 |
| Knex | Query builder abstraction you don't need. better-sqlite3's API is already clean. | Raw SQL with better-sqlite3 |
| axios | Unnecessary dependency when Node.js has built-in fetch | Native fetch |
| Create React App | Deprecated, unmaintained | Vite |
| ts-node | Slower than tsx, more complex config, ESM issues | tsx |
| Ant Design / Material UI | Against project constraint (custom Tailwind components). Massive bundle. | Tailwind + custom components |
| Chart.js | Canvas-based, harder to integrate with React/Tailwind styling | Recharts (SVG) |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| Vite 8.x | React 19.x | Confirmed compatible, @vitejs/plugin-react |
| Vitest 4.x | Vite 8.x | Same ecosystem, shared config |
| tRPC 11.x | Zod 4.x | Zod is the default tRPC validator |
| tRPC 11.x | TanStack Query 5.x | Via @trpc/react-query |
| tRPC 11.x | superjson 2.x | Data transformer for rich types |
| better-sqlite3 11.x | Node.js 20+ | Native addon, requires node-gyp at install |

## Sources

- [Vite 8.0 release blog](https://vite.dev/blog/announcing-vite8) -- Confirmed Rolldown bundler, March 2026
- [tRPC v11 announcement](https://trpc.io/blog/announcing-trpc-v11) -- SSE, FormData, RSC support
- [Zod npm](https://www.npmjs.com/package/zod) -- v4.3.6 confirmed
- [Recharts npm](https://www.npmjs.com/package/recharts) -- v3.8.0 confirmed
- [date-fns blog](https://blog.date-fns.org/v3-is-out/) -- v4 with timezone support
- [Vitest 4.0 blog](https://vitest.dev/blog/vitest-4) -- Browser Mode stable, v4.1.0 latest
- [currency.js docs](https://currency.js.org/) -- v2.0.3, integer-based precision
- [SimpleFIN developer guide](https://beta-bridge.simplefin.org/info/developers) -- REST API docs
- [SQLite PRAGMA user_version](https://levlaz.org/sqlite-db-migrations-with-pragma-user_version/) -- Migration pattern
- [croner vs node-cron comparison](https://www.pkgpulse.com/blog/node-cron-vs-node-schedule-vs-croner-task-scheduling-nodejs-2026) -- Timezone handling
- [Vitest vs Jest 2026](https://devtoolswatch.com/en/vitest-vs-jest-2026) -- Performance benchmarks
- [MDN Temporal API status](https://developer.mozilla.org/en-US/blog/javascript-temporal-is-coming/) -- Stage 3, not production-ready

---
*Stack research for: Minerva Money (personal budgeting app)*
*Researched: 2026-03-22*
