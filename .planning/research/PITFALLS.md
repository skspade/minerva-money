# Pitfalls Research

**Domain:** Personal budgeting / finance app (envelope budgeting, bank sync via SimpleFIN)
**Researched:** 2026-03-22
**Confidence:** HIGH (domain well-documented via Actual Budget's public issue tracker, SimpleFIN developer docs, and established financial software patterns)

## Critical Pitfalls

### Pitfall 1: Floating-Point Money Storage

**What goes wrong:**
Storing monetary values as JavaScript `number` (IEEE 754 float) causes rounding errors. `0.1 + 0.2 !== 0.3` in JavaScript. Over hundreds of transactions, budgets don't balance. Envelope totals drift from account totals by pennies. Users lose trust in the app when numbers don't add up.

**Why it happens:**
JavaScript has no native decimal type. It's natural to write `amount: 12.34` and store it directly. The errors are small and intermittent, so tests pass initially. The problem compounds over time and becomes visible only when summing many transactions.

**How to avoid:**
Store all monetary values as integers in cents (e.g., `$12.34` stored as `1234`). This is what Stripe, Actual Budget, and most production financial systems do. In SQLite, use `INTEGER` column type. Convert to display format only at the UI boundary. All arithmetic operates on integers.

**Warning signs:**
- Budget envelope totals don't sum to the total budgeted amount
- "Off by one cent" bugs in reports
- Tests that compare money values with tolerance thresholds instead of exact equality

**Phase to address:**
Database schema design (Phase 1). This must be the very first decision -- retrofitting cents-based storage after building on floats requires touching every query, every API response, and every UI component.

---

### Pitfall 2: Transaction Deduplication Failures

**What goes wrong:**
Bank sync imports duplicate transactions, or worse, misses transactions by over-aggressively deduplicating. SimpleFIN transaction IDs (`transactionId`) are the primary dedup key, but they can change when banks reprocess transactions (e.g., pending to posted). Some institutions reuse or reassign IDs. Hash-based fallback (account + date + amount + merchant) collides when someone buys coffee twice in one day for the same amount.

**Why it happens:**
The SimpleFIN protocol provides `transactionId` per transaction, but the upstream data quality varies by institution. Actual Budget's issue tracker documents cases where Mercury Bank provides cross-account mirror transactions with unique IDs that bypass deduplication. Pending transactions may have different IDs than their posted counterparts.

**How to avoid:**
Implement a layered dedup strategy:
1. Primary: Match on `transactionId` within the same account
2. Secondary: Hash of `accountId + date + absoluteAmount + normalizedMerchant`, but only flag as "possible duplicate" rather than auto-rejecting
3. Cross-account: For transfer detection, match opposite amounts within a date window (see Pitfall 5)
4. Always allow manual resolution -- surface suspected duplicates in the UI rather than silently dropping them

Store the original `transactionId` from SimpleFIN alongside the internal ID. When a pending transaction posts with a new ID, match on amount + date + merchant within the same account, within a 3-day window.

**Warning signs:**
- Users report missing transactions that appear in their bank
- Duplicate entries for the same purchase
- Balance in app drifts from actual bank balance after several sync cycles

**Phase to address:**
Bank sync implementation (Phase 2 or wherever SimpleFIN integration lives). Build the dedup logic alongside the initial sync, not as a patch later. Include a "pending to posted" reconciliation flow from day one.

---

### Pitfall 3: SimpleFIN Rate Limit Exhaustion

**What goes wrong:**
The app burns through the 24 requests/day/account quota during development, testing, or by syncing too aggressively. SimpleFIN warns via the `errors` array first, then disables the Access Token entirely. A disabled token requires manual re-setup with a new Setup Token -- there's no automatic recovery.

**Why it happens:**
24 requests/day feels generous until you're debugging sync logic and hitting the API in a loop. The "twice-daily auto + manual Sync Now" requirement means at minimum 2 requests/day per account, but bugs, retries, and user-initiated syncs add up fast. Quotas for `/accounts` (all accounts) and `/accounts?account=X` (individual) are separate but each is limited.

**How to avoid:**
- Cache SimpleFIN responses locally. Never hit the API if the last sync was less than 1 hour ago
- Implement a request counter that tracks daily usage and refuses to sync when approaching the limit (e.g., hard cap at 20, reserve 4 for manual syncs)
- Use a mock/fixture SimpleFIN response for all development and testing -- never hit the real API during development
- The "Sync Now" button should show remaining quota and warn when low
- Log every API call with timestamp for debugging quota issues

**Warning signs:**
- `errors` array in SimpleFIN responses contains warning messages
- Sync starts failing with token errors after working previously
- Development velocity drops because the API stops responding

**Phase to address:**
Bank sync implementation (Phase 2). Build the rate limiter and caching layer before writing any sync logic. Create mock fixtures from a single real API response on day one.

---

### Pitfall 4: Envelope Budget Math at Month Boundaries

**What goes wrong:**
Envelope balances become inconsistent during month rollovers. Negative balances in overspent categories need to carry forward. The bi-monthly funding schedule (15th and last day) creates a mid-month partial state that is neither "last month" nor "fully funded this month." Transactions that post on the 1st but were made on the 31st get assigned to the wrong month. Rollovers compound errors from prior months.

**Why it happens:**
Envelope budgeting has deceptively complex state management. Each envelope has: allocated amount, spent amount, rollover from previous month, and available balance. These interact across month boundaries. The bi-monthly funding (15th + last day) means budgets are half-funded for the first half of the month, which every calculation must account for. Posted date vs. transaction date disagreements create ambiguity about which month owns a transaction.

**How to avoid:**
- Use transaction date (not posted date) for budget period assignment. SimpleFIN provides both -- use the transaction date for categorization, posted date only for ordering
- Define clear rollover rules upfront: positive rollover adds to next month's available; negative rollover reduces next month's available (not next month's allocation)
- Separate "allocated this period" from "available to spend" in the data model. Available = allocation + rollover - spent
- For bi-monthly funding: model it as two funding events per month, not a special budget period. The budget period is always the calendar month; funding is an action within it
- Write extensive unit tests for month boundary scenarios: overspend rollover, underspend rollover, mid-month category reallocation, funding on the 15th when already overspent

**Warning signs:**
- Envelope balances jump unexpectedly on the 1st of the month
- "Available to budget" doesn't match sum of envelope balances
- Users can't figure out why an envelope shows a different amount than expected

**Phase to address:**
Budgeting engine (Phase 3 or wherever envelope logic lives). This is pure business logic that should be built with heavy test coverage before any UI touches it. Design the data model carefully -- changing it later requires migrating budget history.

---

### Pitfall 5: Transfer Detection False Positives and Double-Counting

**What goes wrong:**
Internal transfers between owned accounts (e.g., checking to savings) appear as both an expense and an income, inflating spending reports. Auto-detection matches unrelated transactions as transfers (same amount, close dates, but actually separate transactions). Confirmed transfers still appear in category spending if not properly excluded.

**Why it happens:**
Transfer detection relies on heuristics: matching opposite amounts within a date window across accounts. But real financial data is messy -- a $500 rent payment and a $500 transfer to savings on the same day look identical to the algorithm. SimpleFIN doesn't flag transfers; the app must infer them. Finary's approach (match opposite amounts within +/-5 days) works for most cases but generates false positives.

**How to avoid:**
- Auto-suggest transfers but never auto-confirm. Show candidates in the UI and require user confirmation
- Once confirmed, store the transfer as a linked pair (debit transaction ID + credit transaction ID) and exclude both from spending reports
- Transfers should have their own "Transfer" category that is excluded from all spending analysis
- For the three institutions in scope (Discover, Fidelity, Consumers CU), test transfer detection with real data early to calibrate the matching window
- Allow users to manually mark any two transactions as a transfer pair, even if the algorithm didn't suggest it

**Warning signs:**
- Monthly spending totals seem inflated compared to actual spending
- Users see transfer transactions categorized as expenses
- The same dollar amount appears in both income and expense reports

**Phase to address:**
Transaction management (Phase 2-3). Build transfer detection after basic sync works but before spending reports, since reports will be wrong without it.

---

### Pitfall 6: SQLite Backup Corruption

**What goes wrong:**
The iCloud Drive backup strategy corrupts the database if a backup runs while the database is being written to. SQLite's own documentation explicitly lists "backup while writing" as a corruption vector. A corrupted backup is worse than no backup -- you think you're protected but the backup is unusable.

**Why it happens:**
SQLite uses write-ahead logging (WAL) and the database file is not a consistent snapshot at any arbitrary point during writes. Simply copying the `.db` file while the app is running can capture a half-written transaction. The "every 6 hours + post-sync" schedule means backups will sometimes coincide with sync writes.

**How to avoid:**
- Use SQLite's `.backup` API (via `better-sqlite3`'s `backup()` method) which creates an atomic, consistent snapshot. Never use file copy (`cp` or `fs.copyFile`)
- Run backups exclusively through the application process, not as an external cron job
- The "post-sync" backup should run after the sync transaction commits and the WAL is checkpointed
- Validate backup integrity: after creating a backup, open it with `better-sqlite3` and run `PRAGMA integrity_check` before copying to iCloud Drive
- Keep at least 3 rotating backups so a corrupt backup doesn't overwrite the last good one

**Warning signs:**
- Backup file size is 0 bytes or drastically different from the live database
- `PRAGMA integrity_check` returns anything other than "ok"
- Restoring from backup produces "database disk image is malformed" errors

**Phase to address:**
Infrastructure / data layer (Phase 1-2). Implement backup correctly from the start. This is not a feature that can be "added later" -- by the time you discover corruption, it's too late.

---

### Pitfall 7: Categorization Rule Ordering Ambiguity

**What goes wrong:**
"Most-specific-rule-wins" sounds intuitive but is hard to define programmatically. What is "more specific"? A rule matching merchant "AMAZON" exactly vs. a rule matching merchant containing "AMZN" with amount > $50? Users create conflicting rules and can't understand why transactions are categorized unexpectedly. Retroactive rule application on historical transactions causes categories to change silently.

**Why it happens:**
Specificity is a multi-dimensional concept. Actual Budget handles this by running rules from least to most specific, where "is" conditions rank higher than "contains." But with multiple rule fields (merchant, amount range, memo), comparing specificity across dimensions requires explicit scoring. The PROJECT.md says "most-specific-rule-wins (ties: newer wins)" but doesn't define specificity scoring.

**How to avoid:**
- Define a concrete specificity score: exact match > contains match > regex match. More conditions = more specific. Condition types have weights (merchant exact = 10, merchant contains = 5, amount range = 3, memo contains = 2). Total score determines priority
- When rules conflict, show the user which rule won and why (in the transaction detail view)
- Retroactive application should be an explicit user action with a preview ("This will recategorize 47 transactions. Review changes?"), not automatic
- Log rule application decisions for debugging: store which rule ID categorized each transaction

**Warning signs:**
- Users report transactions in unexpected categories
- Adding a new rule changes categories of old transactions without warning
- Two rules that should apply differently produce the same result

**Phase to address:**
Categorization engine (Phase 3). Define the specificity algorithm before building the UI. Write test cases for ambiguous scenarios first, then implement the algorithm to pass them.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store amounts as floats | Simpler code initially | Rounding errors compound, requires full rewrite to fix | Never for financial data |
| Skip sync request counting | Faster development | Token gets disabled, requires manual re-setup | Never -- track from day one |
| Copy DB file for backup | Simple one-liner | Corruption risk on every backup | Never -- use SQLite backup API |
| Hardcode budget periods to calendar months | Simpler date logic | Can't support custom periods later | Acceptable for MVP since bi-monthly is defined in scope |
| Skip pending transaction handling | Fewer edge cases | Duplicates when pending posts, missing transactions | MVP only -- add before production use |
| Inline categorization logic | Fast to prototype | Untestable, unmaintainable rule engine | MVP prototype only, refactor before adding retroactive rules |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SimpleFIN | Treating Setup Token as reusable | Setup Token is single-use. Exchange it for an Access URL immediately and store the Access URL. If lost, user must generate a new Setup Token |
| SimpleFIN | Not checking `errors` array in responses | Always parse and surface the `errors` array. It contains rate limit warnings before the token gets disabled |
| SimpleFIN | Requesting all 90 days of history on every sync | Only request from last sync date forward. Use the full 90-day range only for initial import |
| SimpleFIN | Assuming transaction dates are in local timezone | SimpleFIN returns Unix epoch timestamps. Convert consistently using the same timezone throughout the app |
| iCloud Drive | Writing directly to iCloud Drive path | Write to a local temp file first, validate integrity, then move atomically to the iCloud Drive path |
| better-sqlite3 | Opening the database in multiple processes | better-sqlite3 is synchronous and single-process. Don't run backup scripts as separate processes that open the same DB |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unindexed transaction queries by date range | Dashboard loads slowly, reports take seconds | Index on `(accountId, date)` and `(categoryId, date)` from schema creation | ~5,000+ transactions (roughly 1 year of data) |
| Recalculating envelope balances on every page load | Budget page feels sluggish | Cache envelope balances in a summary table, update on transaction changes | ~20+ envelopes with 6+ months of history |
| Loading all transactions for trend calculations | Memory spikes, long response times | Use SQL aggregation (`SUM`, `GROUP BY`) rather than loading rows into JS | ~10,000+ transactions |
| Daily balance snapshots without cleanup | Database grows linearly forever | Aggregate old snapshots (keep daily for 90 days, weekly for 1 year, monthly beyond) | ~3+ years of data across multiple accounts |
| Re-running all categorization rules on every sync | Sync takes longer and longer | Only run rules on new/uncategorized transactions. Retroactive re-run is a separate explicit action | ~50+ rules with ~10,000+ transactions |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing SimpleFIN Access URL in the database | If DB is leaked/backed up insecurely, attacker gets read access to all bank data | Store in `.env` file only, never in SQLite. The DB backup to iCloud should not contain credentials |
| Exposing SimpleFIN credentials via tRPC error messages | Stack traces in development mode could leak the Access URL | Sanitize all error responses. Never log the full Access URL -- log only a truncated hash for identification |
| No rate limiting on the "Sync Now" endpoint | A stuck UI loop or browser refresh storm could exhaust SimpleFIN quota | Server-side cooldown: reject sync requests within 30 minutes of last sync. Return last cached result instead |
| Backup files accumulating with no access control | Old backups on iCloud Drive contain full financial history | Encrypt backups before writing to iCloud Drive, or at minimum ensure the iCloud Drive folder has restricted sharing |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Showing raw bank merchant names (e.g., "AMZN MKTP US*RT4K29SJ0") | Users can't identify transactions, categorization feels broken | Clean/normalize merchant names on import. Map common patterns ("AMZN MKTP" -> "Amazon") |
| Not showing sync status clearly | Users don't know if data is current, lose trust | Persistent status bar: "Last synced: 2 hours ago" with green/yellow/red indicator |
| Requiring category assignment before viewing transactions | Onboarding feels like a chore, users abandon setup | Show uncategorized transactions with a prominent "Categorize" action, but don't block viewing |
| Hiding where money went in transfers | Users see money "disappear" from one account with no explanation | Show transfers as linked pairs: "Transfer to Savings" / "Transfer from Checking" with clear visual treatment |
| Overwhelming users with all envelopes on first load | New users don't know where to start | Start with 5-8 default envelopes (Groceries, Dining, Transport, Bills, Entertainment, Savings). Let users customize later |
| Not explaining negative envelope balances | Users panic when an envelope shows -$42 | Inline explanation: "You overspent by $42. This will reduce next month's available amount." |

## "Looks Done But Isn't" Checklist

- [ ] **Transaction sync:** Often missing pending-to-posted reconciliation -- verify that pending transactions update correctly when they post, rather than creating duplicates
- [ ] **Envelope budgeting:** Often missing the "available to budget" calculation -- verify that unallocated money is tracked and visible, not just individual envelope balances
- [ ] **Month rollover:** Often missing negative rollover handling -- verify that overspent envelopes reduce next month's available, not just carry over positive balances
- [ ] **Spending reports:** Often missing transfer exclusion -- verify that internal transfers don't inflate income or expense totals
- [ ] **Categorization rules:** Often missing retroactive application preview -- verify that applying rules to historical transactions shows a diff before committing
- [ ] **Backup system:** Often missing integrity validation -- verify that backups are validated with `PRAGMA integrity_check` before being considered successful
- [ ] **Date handling:** Often missing timezone consistency -- verify that transaction dates display the same date regardless of browser timezone (use the date from the bank, not a timezone-converted datetime)
- [ ] **Balance snapshots:** Often missing the initial snapshot -- verify that the first sync captures starting balances, not just transactions

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Float money storage | HIGH | Schema migration to integer cents, update all queries, all API responses, all UI formatting. Requires recalculating all historical data |
| Duplicate transactions | MEDIUM | Add dedup logic, then run a one-time cleanup script that identifies and merges duplicates. Requires manual review of ambiguous cases |
| SimpleFIN token disabled | LOW | Generate new Setup Token from SimpleFIN dashboard, exchange for new Access URL, update `.env`. No data loss |
| Corrupt backup | HIGH if no good backup exists | If a valid backup exists, restore from it. If not, the live DB is the only copy. Implement proper backups immediately |
| Wrong month assignment | MEDIUM | Add a migration that reassigns transactions to correct months based on transaction date. Recalculate all envelope balances |
| Inflated spending from transfers | LOW | Retroactively mark transfer pairs and recalculate reports. No schema change needed if transfer linking was designed in |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Float money storage | Phase 1: Schema design | All money columns are INTEGER. All amounts in tests are in cents. No `parseFloat` on money values |
| Transaction deduplication | Phase 2: Bank sync | Import the same 90-day window twice and verify zero duplicates. Import a pending then posted version and verify single transaction |
| SimpleFIN rate limits | Phase 2: Bank sync | Request counter visible in logs. Mock API used in all tests. Manual test: hit Sync Now 5x rapidly, verify only 1 API call |
| Envelope month boundaries | Phase 3: Budget engine | Unit tests cover: positive rollover, negative rollover, mid-month reallocation, bi-monthly funding on 15th + last day |
| Transfer detection | Phase 3: Transaction management | Test with real Discover/Fidelity/CCU data. Verify transfers excluded from spending. Verify no false positives on same-amount transactions |
| SQLite backup corruption | Phase 1: Infrastructure | Backup creates valid DB (passes integrity check). Backup during active write succeeds without corruption |
| Categorization rule conflicts | Phase 3: Rules engine | Test matrix: exact vs. contains, single-field vs. multi-field, old rule vs. new rule. Each case has deterministic winner |

## Sources

- [SimpleFIN Developer Guide](https://beta-bridge.simplefin.org/info/developers) -- Official rate limits, token handling, API behavior (HIGH confidence)
- [Actual Budget SimpleFIN Issues](https://github.com/actualbudget/actual/issues/2272) -- Real-world sync problems from production usage (HIGH confidence)
- [Actual Budget Cross-Account Duplicates](https://github.com/actualbudget/actual/issues/7015) -- Mirror transaction deduplication failures (HIGH confidence)
- [Modern Treasury: Floats Don't Work for Cents](https://www.moderntreasury.com/journal/floats-dont-work-for-storing-cents) -- Authoritative explanation of integer money storage (HIGH confidence)
- [SQLite: How to Corrupt a Database](https://sqlite.org/howtocorrupt.html) -- Official SQLite corruption vectors (HIGH confidence)
- [Actual Budget Envelope Budgeting Docs](https://actualbudget.org/docs/getting-started/envelope-budgeting/) -- Rollover behavior in production envelope system (HIGH confidence)
- [Actual Budget Rules Docs](https://actualbudget.org/docs/budgeting/rules/) -- Rule specificity and conflict resolution patterns (HIGH confidence)
- [Finary Transfer Detection](https://help.finary.com/en/articles/11572132-internal-transfers-automatic-detection-and-exclusion-from-analysis) -- Transfer matching heuristics and false positive handling (MEDIUM confidence)

---
*Pitfalls research for: Minerva Money -- personal budgeting app with envelope budgeting and SimpleFIN bank sync*
*Researched: 2026-03-22*
