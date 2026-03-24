# Architecture Research

**Domain:** CSV Import Integration for Personal Budgeting App
**Researched:** 2026-03-24
**Confidence:** HIGH (all findings based on direct codebase inspection)

## System Overview

```
Client (ImportPage.tsx)
    |
    | FileReader.readAsText() -> tRPC mutation (POST body)
    |
    v
import-router.ts (tRPC: preview + execute)
    |
    v
import-service.ts (parse, validate, transform, bulk insert)
    |
    |--- reuses: generateDedupHash()         from sync/simplefin-client.ts
    |--- reuses: toCents()                   from @minerva/shared
    |--- reuses: categorizeNewTransactions() from rules/rules-service.ts
    |--- reuses: detectTransferCandidates()  from transfers/transfer-service.ts
    |
    v
SQLite (INSERT OR IGNORE with dedup_hash, inside db.transaction())
```

### Component Responsibilities

| Component | Responsibility | New/Modified |
|-----------|---------------|--------------|
| `packages/server/src/import/import-service.ts` | Parse CSV, validate rows, transform to transaction rows, bulk insert with dedup, invoke rules + transfer detection, apply CSV category fallback | **NEW** |
| `packages/server/src/import/import-router.ts` | tRPC router with `preview` and `execute` mutations | **NEW** |
| `packages/client/src/pages/ImportPage.tsx` | File upload, preview table, account/category mapping UI, confirm/execute | **NEW** |
| `packages/server/src/sync/trpc-router.ts` | Add `import: importRouter` to `appRouter` | **MODIFIED** (2-3 lines) |
| `packages/client/src/App.tsx` | Add `/import` route | **MODIFIED** (2 lines) |
| `packages/client/src/components/Layout.tsx` | Add "Import" NavLink in desktop nav | **MODIFIED** (~8 lines) |
| `packages/client/src/components/MoreSheet.tsx` | Add Import to mobile More drawer | **MODIFIED** (1 line in array) |

---

## Recommended Project Structure

```
packages/server/src/import/
    import-service.ts       # Business logic: parse, validate, transform, insert
    import-service.test.ts  # Unit tests
    import-router.ts        # tRPC router (thin wrapper)
```

### Structure Rationale

- **import/:** Follows existing convention where each feature is a directory under `packages/server/src/`. Matches `sync/`, `categories/`, `rules/`, `transfers/`, `budget/`, `reports/`, `agent/`. Contains a service file (business logic) and a router file (tRPC thin wrapper).
- **No shared types file needed:** Import types are internal to the service. The tRPC router infers types automatically for the client via `AppRouter`.

---

## Architectural Patterns

### Pattern 1: Reuse Existing Transaction Insertion

**What:** Follow the exact `INSERT OR IGNORE` pattern from `sync-service.ts` (lines 107-131) for bulk inserting CSV transactions, including dedup hash generation, rules engine invocation, and transfer detection.
**When to use:** Always -- this is the only correct way to insert transactions in Minerva.
**Trade-offs:** Re-parsing CSV on execute (vs caching parsed state) adds sub-millisecond overhead for 10K rows. Acceptable for stateless design.

**Example (replicate sync-service.ts pattern):**
```typescript
return db.transaction(() => {
  let added = 0;
  const newTransactionIds: string[] = [];
  const txnStmt = db.prepare(`
    INSERT OR IGNORE INTO transactions (id, account_id, date, amount, pending, payee, memo, dedup_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of transformedRows) {
    const info = txnStmt.run(
      row.id, row.accountId, row.date, row.amount,
      0, row.payee, row.memo, row.dedupHash,
    );
    if (info.changes > 0) {
      added++;
      newTransactionIds.push(row.id);
    }
  }

  // Reuse existing post-insert hooks -- identical to sync-service.ts
  if (newTransactionIds.length > 0) {
    categorizeNewTransactions(db, newTransactionIds);
    detectTransferCandidates(db, newTransactionIds);
  }

  // CSV category fallback: for transactions still uncategorized after rules
  applyCsvCategoryFallback(db, newTransactionIds, csvCategoryMap);

  return { imported: added, skipped: transformedRows.length - added };
})();
```

### Pattern 2: tRPC Mutation for Large Payloads

**What:** Use `mutation` (not `query`) for both preview and execute endpoints because the CSV text is sent as POST body.
**When to use:** When input exceeds URL parameter length limits. tRPC queries encode input in the URL. A 1MB CSV would overflow.
**Trade-offs:** Mutations are not cached by TanStack Query by default. This is fine -- preview results should not be cached.

**Example:**
```typescript
export const importRouter = router({
  preview: publicProcedure
    .input(z.object({ csvText: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return parseAndPreview(ctx.db, input.csvText);
    }),

  execute: publicProcedure
    .input(z.object({
      csvText: z.string().min(1),
      accountMappings: z.record(z.string(), z.string()),
      categoryMappings: z.record(z.string(), z.number()),
    }))
    .mutation(({ ctx, input }) => {
      return executeImport(ctx.db, input.csvText, input.accountMappings, input.categoryMappings);
    }),
});
```

### Pattern 3: Client-Side File Reading

**What:** Read the CSV file entirely on the client using `FileReader.readAsText()`, send the text string via tRPC. No multipart upload, no server filesystem access.
**When to use:** For text files under ~10MB. Monarch exports are typically 200KB-2MB.
**Trade-offs:** Simpler than multipart (no multer, no temp files). Requires increasing Express JSON body limit from default 100KB.

**Required configuration change:**
```typescript
// In Express setup -- ensure body limit accommodates CSV files
app.use(express.json({ limit: '10mb' }));
```

### Pattern 4: Stateless Preview/Execute Flow

**What:** No server-side state between preview and execute. Client holds the CSV text and sends it to both calls. Server re-parses on execute.
**When to use:** Always -- matches the stateless request model of all other tRPC procedures in this app.
**Trade-offs:** Tiny re-parse cost (~1ms for 10K tab-delimited rows) vs zero state management complexity.

---

## Data Flow

### Preview Flow (Parse + Extract Mappings)

```
User selects file
    |
FileReader.readAsText()
    |
trpc.import.preview.mutate({ csvText })
    |
parseAndPreview(db, csvText)
    |
    |--- Parse tab-delimited rows, skip header
    |--- Extract unique account names from CSV
    |--- Extract unique category names from CSV
    |--- Match account names against existing accounts (case-insensitive)
    |--- Match category names against existing categories (exact name match)
    |--- Compute dedup hash for each row, check which already exist
    |
    v
Return: { rows[], accountMappings[], categoryMappings[], duplicateCount }
    |
Client displays preview table + mapping dropdowns
```

### Execute Flow (Import with Confirmed Mappings)

```
User confirms mappings, clicks Import
    |
trpc.import.execute.mutate({ csvText, accountMappings, categoryMappings })
    |
executeImport(db, csvText, accountMappings, categoryMappings)
    |
    |--- Re-parse CSV (stateless)
    |--- Transform each row:
    |      id = crypto.randomUUID()
    |      accountId = accountMappings[csvAccountName]
    |      amount = toCents(parseFloat(csvAmount))
    |      date = csvDate (already YYYY-MM-DD)
    |      payee = csvMerchant
    |      memo = csvNotes or csvOriginalStatement
    |      dedupHash = generateDedupHash(accountId, date, amount, payee)
    |
    |--- db.transaction():
    |      INSERT OR IGNORE each row (dedup via hash)
    |      categorizeNewTransactions(db, newIds)     -- rules first
    |      detectTransferCandidates(db, newIds)      -- transfer detection
    |      applyCsvCategoryFallback(db, newIds, map) -- CSV category for unmatched
    |
    v
Return: { imported, skipped, categorizedByRules, categorizedFromCsv }
    |
Client displays result summary
```

### Category Handling Priority

This is the key architectural decision. Order matters:

1. **Rules engine runs first** via `categorizeNewTransactions()`. If a rule matches, it sets `category_id` AND `rule_id`. This is identical to sync behavior.
2. **CSV category as fallback**: For transactions where `category_id` is still NULL after rules, apply the mapped CSV category. Set `category_id` but leave `rule_id` NULL (indicating manual categorization). This preserves Monarch categorizations where no Minerva rule exists.
3. **User can override later**: Via TransactionsPage, same as any transaction.

```typescript
function applyCsvCategoryFallback(
  db: Database.Database,
  transactionIds: string[],
  csvCategoryMap: Map<string, number>, // transactionId -> categoryId from CSV
): number {
  const stmt = db.prepare(
    'UPDATE transactions SET category_id = ? WHERE id = ? AND category_id IS NULL'
  );
  let applied = 0;
  for (const txnId of transactionIds) {
    const catId = csvCategoryMap.get(txnId);
    if (catId !== undefined) {
      const info = stmt.run(catId, txnId);
      if (info.changes > 0) applied++;
    }
  }
  return applied;
}
```

---

## Integration Points

### Existing Functions Reused (No Modifications Needed)

| Function | Module | Signature | How Import Uses It |
|----------|--------|-----------|-------------------|
| `generateDedupHash` | `sync/simplefin-client.ts` | `(accountId, date, amount, payee) -> string` | Generate dedup hash for each CSV row after resolving account mapping |
| `categorizeNewTransactions` | `rules/rules-service.ts` | `(db, transactionIds) -> void` | Run rules engine on newly inserted transactions |
| `detectTransferCandidates` | `transfers/transfer-service.ts` | `(db, transactionIds) -> void` | Detect inter-account transfers in imported historical data |
| `toCents` | `@minerva/shared` | `(dollars) -> Cents` | Convert CSV dollar strings to integer cents |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| ImportPage <-> import-router | tRPC mutations (preview, execute) | CSV text sent as string in POST body |
| import-service -> simplefin-client | Direct function import (`generateDedupHash`) | Already exported, no changes needed |
| import-service -> rules-service | Direct function import (`categorizeNewTransactions`) | Already exported, called identically to sync-service |
| import-service -> transfer-service | Direct function import (`detectTransferCandidates`) | Already exported, called identically to sync-service |
| import-router -> appRouter | Router composition (`import: importRouter`) | Becomes 14th nested router in appRouter |

### Files Modified (Minimal Touchpoints)

| File | Change | Lines Changed |
|------|--------|---------------|
| `packages/server/src/sync/trpc-router.ts` | Import `importRouter`, add to `appRouter` object | 2-3 |
| `packages/client/src/App.tsx` | Import `ImportPage`, add `<Route>` | 2 |
| `packages/client/src/components/Layout.tsx` | Add "Import" `<NavLink>` after "Chat" | ~8 |
| `packages/client/src/components/MoreSheet.tsx` | Add `{ to: '/import', icon: Upload, label: 'Import' }` to `MORE_LINKS` | 1 |
| Express setup (if needed) | `express.json({ limit: '10mb' })` | 1 |

---

## Anti-Patterns

### Anti-Pattern 1: Server-Side File Upload with Multer

**What people do:** Use multipart form upload, write CSV to /tmp, parse from disk.
**Why it's wrong:** Adds dependency (multer), temp file management, cleanup logic. Completely unnecessary for sub-10MB text files sent over a local network.
**Do this instead:** Client `FileReader.readAsText()` -> tRPC mutation body.

### Anti-Pattern 2: Storing Parsed State Between Preview and Execute

**What people do:** Parse CSV on preview, store in memory/session, reference by ID on execute.
**Why it's wrong:** Requires server-side session state, memory leak risk, cleanup timers. Breaks the stateless request model that all other tRPC procedures follow.
**Do this instead:** Re-parse CSV on execute. Tab-delimited parsing of 10K rows takes <1ms. The client holds the CSV text as state.

### Anti-Pattern 3: Creating Accounts from CSV Data

**What people do:** Auto-create Minerva accounts for CSV account names that do not match existing accounts.
**Why it's wrong:** Minerva accounts are tied to SimpleFIN IDs, balance tracking, and sync. A CSV-created account has no SimpleFIN link, no balance snapshots, and breaks the sync/accounts relationship.
**Do this instead:** Require the user to map every CSV account name to an existing Minerva account. Skip rows with unmapped accounts.

### Anti-Pattern 4: Custom Dedup Logic for Imports

**What people do:** Build a separate dedup mechanism (checking date+amount+payee manually before insert).
**Why it's wrong:** The `dedup_hash` UNIQUE index on transactions already handles this. `INSERT OR IGNORE` skips duplicates automatically. Same hash formula works for CSV and sync data.
**Do this instead:** Call `generateDedupHash()` from `simplefin-client.ts` and use `INSERT OR IGNORE`.

### Anti-Pattern 5: Bypassing Rules Engine

**What people do:** Apply CSV categories directly, skip rules engine because "the data is already categorized."
**Why it's wrong:** Rules engine is the categorization source of truth. Imported transactions should behave identically to synced transactions. If a rule exists for "Amazon" -> "Shopping", it should apply to imported Amazon transactions regardless of Monarch's category.
**Do this instead:** Run `categorizeNewTransactions()` first, then apply CSV categories only as fallback for unmatched transactions.

---

## Monarch CSV Format Reference

```
Date\tMerchant\tCategory\tAccount\tOriginal Statement\tNotes\tAmount\tTags
2024-01-15\tAmazon\tShopping\tDiscover Checking\tAMZN MKTP US*123\tBirthday gift\t-45.99\t
2024-01-15\tPayroll\tIncome\tConsumers CU Checking\tDIRECT DEPOSIT\tJanuary pay\t2500.00\t
```

Key parsing notes:
- Tab-delimited (not comma)
- Amount in dollars: negative = expense, positive = income (verify against SimpleFIN sign convention during implementation -- SimpleFIN also uses negative for debits, so signs should align)
- Date is `YYYY-MM-DD` (matches Minerva internal format)
- Category and Account are display names requiring mapping to Minerva IDs
- Tags column: ignore for MVP
- Original Statement: use as memo if Notes is empty

---

## Build Order

Dependencies flow: service logic -> tRPC API -> client UI -> navigation wiring.

| Step | What | Depends On | Deliverable |
|------|------|------------|-------------|
| 1 | `import-service.ts` + `import-service.test.ts` | Nothing new (only existing exports) | CSV parser, validator, transformer, bulk inserter with dedup + rules + transfer hooks |
| 2 | `import-router.ts` + wire into `appRouter` | Step 1 | Working tRPC API (preview + execute) |
| 3 | `ImportPage.tsx` + route + navigation | Step 2 | Complete UI: file upload, preview, mapping, confirm, result summary |

Steps 1-2 form the backend phase. Step 3 is the frontend phase. Both can be planned as separate milestones or a single milestone with clear task boundaries.

---

## Sources

- Direct code analysis of existing codebase (HIGH confidence)
- `sync-service.ts` lines 107-131: transaction insertion pattern with dedup + rules + transfers
- `simplefin-client.ts` lines 62-65: `generateDedupHash()` implementation
- `rules-service.ts` lines 285-326: `categorizeNewTransactions()` implementation
- `category-service.ts` lines 131-148: `createManualTransaction()` pattern
- `trpc-router.ts` lines 443-455: `appRouter` composition with 13 nested routers
- `001-initial-schema.sql` line 47: `dedup_hash` UNIQUE index
- `Layout.tsx`, `MoreSheet.tsx`, `BottomTabBar.tsx`, `App.tsx`: navigation integration points

---
*Architecture research for: v2.3 CSV Import Integration*
*Researched: 2026-03-24*
