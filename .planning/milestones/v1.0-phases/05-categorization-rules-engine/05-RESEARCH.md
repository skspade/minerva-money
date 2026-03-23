# Phase 5: Categorization Rules Engine - Research

**Researched:** 2026-03-22
**Domain:** Rule-based transaction categorization with conflict resolution
**Confidence:** HIGH

## Summary

Phase 5 builds a categorization rules engine on top of the existing `categorization_rules` table from the schema. The domain is straightforward: CRUD for rules, a specificity-based evaluation engine, retroactive preview/apply workflow, and auto-categorization hook in the sync pipeline. No external libraries are needed beyond what the project already uses (better-sqlite3, tRPC, Zod, React, TanStack Query, Tailwind CSS v4).

The core algorithmic challenge is the specificity scoring and conflict resolution system. The scoring formula is additive (merchant exact=3, merchant contains=2, amount range both bounds=2, one bound=1, memo=1) with ties broken by higher rule ID (newer wins). This is computed at rule create/update time and stored, making evaluation a simple "first match wins" after sorting by score DESC, id DESC.

**Primary recommendation:** Implement the rules engine as a pure service layer with no external dependencies, using the established feature-directory pattern (`packages/server/src/rules/`). The migration adds `match_type` to `categorization_rules` and `rule_id` to `transactions`. TDD the scoring and evaluation logic thoroughly since it's the core complexity.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `categorization_rules` table already exists with columns: `id`, `name`, `merchant_pattern`, `amount_min`, `amount_max`, `memo_pattern`, `category_id`, `specificity_score`, `created_at`, `updated_at`
- `merchant_pattern` supports exact and contains matching via a new `match_type` column (migration 003)
- `amount_min`/`amount_max` are INTEGER cents, nullable
- `memo_pattern` is contains-match, nullable
- Rules require at least one non-null condition
- Specificity score computed at create/update time, stored in `specificity_score` column
- Scoring: merchant exact=3, contains=2, amount both bounds=2, one bound=1, memo=1
- Ties broken by higher ID (newer rule wins)
- `evaluateRules(db, transaction)` returns winning rule or null
- Rules loaded once per batch, sorted by specificity_score DESC, id DESC
- All non-null conditions must match (AND logic)
- Merchant contains matching is case-insensitive
- After sync inserts, rules engine runs on newly added uncategorized transactions
- Manual categorization takes precedence over rules
- `rule_id` column on transactions tracks which rule categorized it (migration 003, ON DELETE SET NULL)
- Retroactive preview shows current vs proposed category for uncategorized transactions
- Confirm applies all changes in a single database transaction
- New `rulesRouter` with: list, create, update, delete, preview, apply
- Extend `transactions.list` to include `rule_id` and rule name
- Service layer in `packages/server/src/rules/`
- Migration 003 adds `match_type` and `rule_id`
- TDD with Vitest

### Claude's Discretion
- Internal naming of rules service functions and helper utilities
- Exact specificity score point values (guidance provided but adjustable)
- Rules list page layout details (table vs cards)
- Whether rule edit reuses the create form or has its own component
- Exact wording of rule match explanations in transaction detail
- How the retroactive preview is displayed (modal vs inline vs separate page)

### Deferred Ideas (OUT OF SCOPE)
- Transfer detection and exclusion from spending (Phase 6)
- Budget allocations tied to categories (Phase 7)
- Category spending totals and reports (Phase 9)
- Rule import/export functionality
- Regex-based pattern matching
- Rule testing/dry-run against a single transaction
- Rule priority manual ordering (explicitly rejected)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CATG-02 | User can create categorization rules matching on merchant name, amount range, and/or memo text | Rules CRUD service with `match_type` for exact/contains, Zod validation ensuring at least one condition, specificity score computation |
| CATG-03 | Rules apply retroactively to all existing matching transactions when created | Preview query showing current vs proposed category, confirm-and-apply mutation with bulk UPDATE in single transaction |
| CATG-04 | Rules apply automatically to all future matching transactions | Post-sync hook in `syncAccount` calling rules engine on newly added uncategorized transactions, setting `category_id` and `rule_id` |
| CATG-05 | When multiple rules match, most specific wins (ties: newer wins) | Specificity scoring algorithm (additive points), sorted evaluation (score DESC, id DESC), first-match-wins pattern |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | SQLite database operations | Already in project, synchronous API ideal for rule evaluation |
| @trpc/server | (existing) | API layer | Established pattern for all server procedures |
| zod | (existing) | Input validation | Used by all existing tRPC procedures |
| vitest | (existing) | Testing | Project-wide test framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query | (existing) | Client data fetching | Rules list, transaction list with rule attribution |
| react-router | (existing) | Client routing | `/rules` route |
| tailwindcss | v4 (existing) | Styling | Rules management UI |

### Alternatives Considered
No new libraries needed. The rules engine is pure TypeScript logic operating on SQLite. The existing stack covers all requirements.

## Architecture Patterns

### Recommended Project Structure
```
packages/server/src/rules/
  rules-service.ts       # CRUD, scoring, evaluation, preview, apply
  rules-service.test.ts  # TDD tests

packages/server/migrations/
  003-rules-engine.sql   # match_type + rule_id columns

packages/client/src/pages/
  RulesPage.tsx           # Rules management page

packages/client/src/components/
  RuleForm.tsx            # Create/edit form (shared)
  RetroactivePreview.tsx  # Preview modal before applying
```

### Pattern 1: Service Function with `db` First Parameter
**What:** All service functions accept `db: Database.Database` as the first parameter
**When to use:** Every rules service function
**Example:**
```typescript
export function createRule(db: Database.Database, input: CreateRuleInput): Rule {
  const score = computeSpecificity(input);
  // ... INSERT and return
}
```
This follows the exact pattern established in `category-service.ts`.

### Pattern 2: Sorted Evaluation with First-Match-Wins
**What:** Load all rules sorted by specificity DESC, id DESC. First matching rule wins.
**When to use:** Both single-transaction and batch evaluation
**Example:**
```typescript
export function evaluateRules(db: Database.Database, transaction: Transaction): Rule | null {
  const rules = db.prepare(
    'SELECT * FROM categorization_rules ORDER BY specificity_score DESC, id DESC'
  ).all();
  for (const rule of rules) {
    if (matchesRule(rule, transaction)) return rule;
  }
  return null;
}
```

### Pattern 3: Post-Sync Hook
**What:** After `syncAccount` inserts new transactions, call rules engine on uncategorized new rows
**When to use:** Auto-categorization on import
**Example:**
```typescript
// In syncAccount, after the transaction insert loop:
// Collect IDs of newly added transactions, then evaluate rules
```

### Anti-Patterns to Avoid
- **Lazy rule loading per transaction:** Load all rules once per batch, not per transaction (N+1 query)
- **Overriding manual categorization:** Never re-categorize transactions where `category_id IS NOT NULL AND rule_id IS NULL` (manually categorized)
- **Mutable specificity scores:** Always recompute when rule conditions change via update

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Case-insensitive text matching | Custom JS toLowerCase comparison | SQLite `LIKE` or `LOWER()` | SQLite handles it natively in queries |

**Key insight:** The rules engine is simple enough that no external libraries are warranted. The specificity scoring is a pure function, and the evaluation is a linear scan of sorted rules.

## Common Pitfalls

### Pitfall 1: Forgetting to Recompute Specificity on Update
**What goes wrong:** Rule is updated (e.g., removing a condition) but specificity_score stays stale
**Why it happens:** Only computing score on create, not update
**How to avoid:** Extract `computeSpecificity()` as a pure function, call it in both `createRule` and `updateRule`
**Warning signs:** Rules with fewer conditions winning over rules with more conditions

### Pitfall 2: Race Condition Between Sync and Manual Categorization
**What goes wrong:** User manually categorizes a transaction, then sync triggers rule evaluation which overwrites it
**Why it happens:** Rule evaluation doesn't check if transaction was manually categorized
**How to avoid:** Only evaluate rules on transactions where `category_id IS NULL` and no splits exist. Also skip transactions where `rule_id IS NULL AND category_id IS NOT NULL` (manually set)
**Warning signs:** Manual categories disappearing after sync

### Pitfall 3: Preview Showing Stale Data After Apply
**What goes wrong:** After retroactive apply, the preview still shows old data
**Why it happens:** Client cache not invalidated after apply mutation
**How to avoid:** Invalidate both rules and transactions queries after apply mutation
**Warning signs:** UI showing incorrect category assignments after apply

### Pitfall 4: Amount Comparison Direction
**What goes wrong:** Rules don't match because amount sign is wrong
**Why it happens:** Transaction amounts can be negative (debits). Amount range in rules should compare against absolute value or the raw amount consistently.
**How to avoid:** Define clearly whether `amount_min`/`amount_max` compare against the raw amount (which includes sign) or absolute value. Per CONTEXT.md, amounts are INTEGER cents. The user likely thinks in absolute terms ("transactions between $50 and $100"), so compare against `ABS(amount)`.
**Warning signs:** Rules matching only credits or only debits unexpectedly

## Code Examples

### Specificity Score Computation
```typescript
interface RuleConditions {
  merchantPattern: string | null;
  matchType: 'exact' | 'contains';
  amountMin: number | null;
  amountMax: number | null;
  memoPattern: string | null;
}

function computeSpecificity(conditions: RuleConditions): number {
  let score = 0;
  if (conditions.merchantPattern) {
    score += conditions.matchType === 'exact' ? 3 : 2;
  }
  if (conditions.amountMin !== null && conditions.amountMax !== null) {
    score += 2;
  } else if (conditions.amountMin !== null || conditions.amountMax !== null) {
    score += 1;
  }
  if (conditions.memoPattern) {
    score += 1;
  }
  return score;
}
```

### Rule Matching
```typescript
function matchesRule(rule: CategorRule, transaction: { payee: string | null; amount: number; memo: string | null }): boolean {
  if (rule.merchant_pattern) {
    if (!transaction.payee) return false;
    if (rule.match_type === 'exact') {
      if (transaction.payee.toLowerCase() !== rule.merchant_pattern.toLowerCase()) return false;
    } else {
      if (!transaction.payee.toLowerCase().includes(rule.merchant_pattern.toLowerCase())) return false;
    }
  }
  if (rule.amount_min !== null && Math.abs(transaction.amount) < rule.amount_min) return false;
  if (rule.amount_max !== null && Math.abs(transaction.amount) > rule.amount_max) return false;
  if (rule.memo_pattern) {
    if (!transaction.memo) return false;
    if (!transaction.memo.toLowerCase().includes(rule.memo_pattern.toLowerCase())) return false;
  }
  return true;
}
```

### Migration 003
```sql
ALTER TABLE categorization_rules ADD COLUMN match_type TEXT NOT NULL DEFAULT 'contains';
ALTER TABLE transactions ADD COLUMN rule_id INTEGER REFERENCES categorization_rules(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_rule_id ON transactions(rule_id);
```

## State of the Art

No significant changes relevant to this phase. The technology stack (SQLite, tRPC, React) is stable and well-established. The rules engine is a custom domain-specific implementation, not a library concern.

## Open Questions

1. **Amount comparison: raw vs absolute?**
   - What we know: Transaction amounts are signed integers (negative for debits). Rule amounts are nullable integers.
   - What's unclear: Should `amount_min`/`amount_max` compare against the raw amount or `ABS(amount)`?
   - Recommendation: Use `ABS(amount)` for comparison. Users think in terms of "transactions between $50-$100" regardless of debit/credit direction. This is the most intuitive behavior.

## Sources

### Primary (HIGH confidence)
- Project codebase: `001-initial-schema.sql`, `category-service.ts`, `sync-service.ts`, `trpc-router.ts` — verified table structure, service patterns, tRPC patterns
- CONTEXT.md: All design decisions are locked and clearly documented

### Secondary (MEDIUM confidence)
- better-sqlite3 API patterns from existing project code — verified against current usage

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing
- Architecture: HIGH - follows established project patterns exactly
- Pitfalls: HIGH - based on direct codebase analysis of integration points

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable domain, no external dependencies)
