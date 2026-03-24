# Project Research Summary

**Project:** Minerva Money v2.4 — CSV Import Account Filtering
**Domain:** Personal finance CSV import — account skip/exclude capability
**Researched:** 2026-03-24
**Confidence:** HIGH

## Executive Summary

Minerva Money v2.4 is a tightly scoped behavioral refinement of the v2.3 CSV import feature. The change adds a "skip" option to account mapping dropdowns so users can exclude specific accounts (e.g., investment or loan accounts) from a Monarch Money migration CSV without those accounts blocking the import. All four research streams converge on the same conclusion: this is a small, low-risk change to approximately 3 existing files with zero new dependencies.

The recommended approach is a sentinel-value pattern: the client tracks skip state using the string `"__skip__"` in the existing `accountMappings: Record<string, string>` state, strips skip entries before sending to the server, and the server interprets any account absent from the mappings record as "skip this account's rows." This single-source-of-truth design avoids new state, new API parameters, new component structure, or new files. The server replaces a throw with a filter loop. The client adds one `<option>` element, updates one validation function, and filters display stats with `useMemo`.

The key risks are cosmetic rather than data-integrity risks. The only high-severity risk is a permissive gate check that allows an import with a genuinely forgotten (unresolved) account — prevented by distinguishing three distinct states per account: `""` (undecided, blocks Continue), `"__skip__"` (resolved skip, allows Continue), and a real UUID (mapped, allows Continue). The SQLite foreign-key constraint on `account_id` acts as a hard backstop against any sentinel value leaking to the server as a real account ID.

## Key Findings

### Recommended Stack

No new dependencies are needed. This milestone modifies behavior within the existing React/tRPC/Vitest stack. The only technologies touched are React (UI logic and `useMemo` filtering), TypeScript (type additions to two existing interfaces), and Vitest (new test cases for skip scenarios).

**Core technologies (relevant changes only):**
- React: Add `<option value="__skip__">` to dropdown; filter sample rows and stats with `useMemo` — UI logic only
- TypeScript: Add `skippedByAccountFilter: number` to `ExecuteResult`; add `rowCountByAccount: Record<string, number>` to `PreviewResult` — type modifications only
- Vitest: New test cases for partial-mapping execute behavior — test additions only
- Zod 4: No change — `z.record(z.string(), z.string())` already accepts any string values including the sentinel

Full details: `.planning/research/STACK.md`

### Expected Features

**Must have (table stakes for v2.4):**
- Skip option in account mapping dropdown — core capability; entire feature depends on it
- Server execute accepts absent mappings gracefully — currently throws at line 362 of import-service.ts; must filter instead
- Per-account row count in mapping UI — users need to see impact magnitude before deciding to skip
- Client-side dedup stats exclude skipped accounts — prevents inflated "new transactions" count in preview
- Sample rows exclude skipped accounts — prevents irrelevant rows dominating preview table
- Results step reflects filtered counts — confirm summary must match actual import outcome

**Should have (v2.4 stretch goals):**
- Skipped account visual styling (dimmed mapping card) — CSS-only, high polish value
- "Skip All Unmatched" bulk action button — one-click skip for accounts without auto-suggested matches
- Filtered summary banner ("Importing 3 of 5 accounts") — persistent communication of filter state

**Not building (explicitly deferred):**
- Per-row checkboxes — wrong abstraction level; account-level skip covers the real use case
- Server-side preview recomputation on skip changes — unnecessary round-trip; client has all data needed
- Auto-skip by account type — no account type metadata in Monarch CSV exports
- Persistent skip preferences — one-time migration workflow; YAGNI

Full details: `.planning/research/FEATURES.md`

### Architecture Approach

The cleanest integration treats "skip" as a mapping value rather than a separate concept. The existing `accountMappings` record gains a tri-state per account: `""` (undecided), `"__skip__"` (skip), or a UUID (mapped). The client strips skip entries before sending to server; the server treats absence from the mappings record as the skip signal. No new files, no new components, no new API endpoints, no schema changes. Changes touch exactly 3 files: `import-service.ts`, `ImportPage.tsx`, and `import-service.test.ts`.

**Major components and changes:**
1. `import-service.ts` — Add `rowCountByAccount` to `PreviewResult`; replace unmapped-accounts throw with filter loop in `executeImport`; add `skippedByAccountFilter` to `ExecuteResult`
2. `ImportPage.tsx` — Add skip `<option>`; update `allAccountsMapped` gate to tri-state; filter stats/sample rows via `useMemo`; update ResultsStep to show filtered counts
3. `import-service.test.ts` — New tests for partial-mapping execute (no throw, correct counts, mixed skip+dedup scenario)

**Build order (each step independently testable):**
1. Server: Add `rowCountByAccount` to `previewImport` (additive, non-breaking)
2. Server: Replace throw with filter in `executeImport`, add `skippedByAccountFilter` to result
3. Client: Add skip `<option>` and update gate validation logic (tri-state)
4. Client: Filtered stats display in PreviewStep using `rowCountByAccount`
5. Client: ResultsStep updates showing `skippedByAccountFilter` stat card
6. Tests: Update existing + add skip-specific test cases

Full details: `.planning/research/ARCHITECTURE.md`

### Critical Pitfalls

1. **Dedup stats count skipped accounts as "new"** — The server computes dedup stats before any skip decisions exist. Client must recompute stats by filtering out skipped-account rows. Use `rowCountByAccount` from server for arithmetic rather than attempting to recalculate exact per-account dedup numbers (client does not have per-row dedup hashes). Display a note: "Excluding N rows from M skipped accounts."

2. **Server throws on unmapped accounts (import-service.ts lines 362-365)** — The existing throw fires immediately if the client omits skipped accounts from mappings. Must be replaced with a filter step before the row loop. This server change must land before or simultaneously with client UI changes.

3. **Gate logic blocks import when skip sentinel is selected** — Current `allAccountsMapped` check (ImportPage.tsx lines 105-107) treats any non-UUID value as unmapped. Must be updated to accept `"__skip__"` as a valid resolved state. Critically: the sentinel must be stripped from the server payload — it must never arrive as an account ID in an INSERT statement.

4. **Sample rows and confirm summary show unfiltered stats** — Both the PreviewStep sample table and the ResultsStep confirm summary read raw server data. Both must apply the same client-side filter based on current `accountMappings` state. A shared filtering utility function prevents the two views from diverging.

5. **All-accounts-skipped edge case** — If the user skips every account, the import should block with a clear message rather than silently importing 0 rows. Require at least one account to be mapped (not skipped) before enabling the execute button.

Full details: `.planning/research/PITFALLS.md`

## Implications for Roadmap

Based on combined research, a 3-phase implementation structure is recommended, following the natural server-then-client dependency order and grouping by blast radius.

### Phase 1: Server Foundation
**Rationale:** Server changes are non-breaking and must land before client changes can be tested. The throw at line 362 of import-service.ts is a hard blocker for any client that omits skipped accounts. Starting server-first means client work in Phase 2 can be tested against a working API from day one.
**Delivers:** Safe server that accepts partial `accountMappings` without throwing; correct `skippedByAccountFilter` count in execute results; `rowCountByAccount` available to the client for filtered stats.
**Addresses:** Per-account row count (must have), server execute grace (must have)
**Avoids:** Pitfall 2 (server throw on unmapped accounts)

### Phase 2: Client Skip Dropdown and Gate Logic
**Rationale:** This is the atomic foundation that all client features depend on. No other client feature is buildable until the skip option exists and the tri-state gate validation is correct. Keeping this phase tight — just the dropdown addition, gate update, and sentinel-stripping before server payload — reduces risk and creates a clean integration point.
**Delivers:** User can select "Skip" for any account; Continue button correctly enables/disables (undecided blocks, skip or UUID allows); skip sentinel is stripped before the server payload is sent; all-accounts-skipped edge case blocks import with clear message.
**Addresses:** Skip option (must have), gate logic correctness
**Avoids:** Pitfall 3 (gate blocks skip), sentinel leak to server

### Phase 3: Client Stats Filtering and Results
**Rationale:** With the skip option working and `rowCountByAccount` available from Phase 1, all remaining features are display refinements using client-side filtering. Grouping them together allows a single shared filtering utility to serve the sample rows, preview stats, and confirm summary — avoiding duplicated logic that would otherwise diverge.
**Delivers:** Sample rows filtered dynamically as user changes mappings; dedup stats recalculated excluding skipped accounts; per-account row count badges in mapping UI; confirm summary reflecting filtered counts; results page with `skippedByAccountFilter` stat card. Stretch: skipped account visual styling, "Skip All Unmatched" button, summary banner.
**Addresses:** All remaining must-haves and stretch goals
**Avoids:** Pitfalls 1, 4, 5 (inflated stats, unfiltered sample rows, unfiltered confirm summary)

### Phase Ordering Rationale

- Server before client is a hard dependency: the throw at line 362 must be removed before any end-to-end integration test can pass.
- Phase 2 (dropdown + gate) before Phase 3 (stats) is a data dependency: filtering stats requires skip state to be settable in the UI.
- Grouping all display filtering in Phase 3 allows a single shared utility function for sample rows, preview stats, and confirm summary — one source of truth for filtering logic.
- The all-accounts-skipped edge case guard belongs in Phase 2 alongside the gate logic, not Phase 3.
- The stretch goals (visual styling, bulk skip, summary banner) all belong in Phase 3 since they build on the same skip state established in Phase 2.

### Research Flags

All phases have well-documented patterns with exact code identified — no phases require a `research-phase` step:

- **Phase 1:** Server changes are direct modifications to lines identified in ARCHITECTURE.md and PITFALLS.md with exact line numbers and code snippets.
- **Phase 2:** Standard sentinel/tri-state dropdown pattern. Exact `<option>` HTML, gate validation code, and sentinel-stripping logic are all specified in ARCHITECTURE.md.
- **Phase 3:** Client-side filtering with `useMemo` on existing `previewResult` data. All data structures, filter expressions, and arithmetic are defined in ARCHITECTURE.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct codebase analysis; no external sources needed; zero new dependencies |
| Features | HIGH | Requirements from PROJECT.md v2.4 + direct inspection of existing import code; scope tightly bounded |
| Architecture | HIGH | All integration points identified with exact line numbers, interface definitions, and code diffs |
| Pitfalls | HIGH | All pitfalls traced to specific lines in existing source code; recovery costs assessed; edge cases documented |

**Overall confidence:** HIGH

### Gaps to Address

- **Dedup stats precision for skipped accounts:** Research recommends displaying "excluding N rows from M skipped accounts" alongside server-provided dedup numbers rather than recalculating exact per-account dedup counts. Confirm this level of approximation is acceptable before Phase 3 execution. If exact filtered dedup counts are required, the server would need to return per-row dedup hashes — a larger change.

- **Category mapping UI for skipped accounts:** Research explicitly defers filtering of category mappings (categories unique to skipped accounts still appear in the mapping UI) as acceptable tech debt for v2.4. These extra mappings are harmless — they are simply ignored during execute. Confirm this deferral is acceptable before Phase 3.

- **Stretch goal scope for v2.4:** The three stretch goals (skipped account styling, "Skip All Unmatched" button, summary banner) are all LOW complexity but should be explicitly scoped in or out before Phase 3 to avoid scope creep during execution.

## Sources

### Primary (HIGH confidence)
- `packages/server/src/import/import-service.ts` (438 lines, direct analysis) — dedup stats loop (lines 284-338), unmapped throw (lines 362-365), INSERT logic (lines 369-434), `PreviewResult` and `ExecuteResult` interfaces
- `packages/client/src/pages/ImportPage.tsx` (572 lines, direct analysis) — gate check (lines 105-107), account dropdown (lines 396-409), confirm summary (lines 477-527), sample rows display (lines 340-365)
- `packages/server/src/import/import-router.ts` (21 lines, direct analysis) — Zod schema confirming `z.record(z.string(), z.string())` requires no changes
- `.planning/PROJECT.md` — v2.4 milestone requirements (lines 42-51)

### Secondary (MEDIUM confidence)
- `packages/server/src/import/import-service.test.ts` — Existing test patterns for new test case design

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*
