# Feature Research

**Domain:** Personal envelope budgeting (self-hosted, single-user)
**Researched:** 2026-03-22
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Bank sync with auto-import | Every competitor does this; manual entry is a dealbreaker for most users | MEDIUM | SimpleFIN handles the heavy lifting; need polling, dedup, error handling |
| Transaction categorization | Uncategorized transactions are useless data; users expect at least merchant-based auto-categorization | MEDIUM | Rules engine + manual fallback; Actual and YNAB both auto-create rules from user behavior |
| Envelope/zero-based budgeting | Core methodology; the entire point of the app | HIGH | Monthly periods, category allocation from available funds, "every dollar has a job" |
| Budget rollovers | YNAB and Actual both roll positive balances forward; users expect unspent grocery money to persist | MEDIUM | Positive balances roll forward; overspending must deduct from next month's available funds |
| Overspending handling | When you overspend a category, the system must account for it clearly | MEDIUM | YNAB distinguishes cash vs credit overspending; for single-user simplicity, roll overspending into next month's "to budget" |
| Account balances dashboard | Users need a single view of all accounts and total net worth | LOW | Aggregate from SimpleFIN synced data; group by account type |
| Spending by category reports | "Where did my money go?" is the #1 question users ask | MEDIUM | Pie/bar charts, filterable by date range, category group |
| Net worth tracking over time | Every competitor tracks this; users want to see the trend line | MEDIUM | Requires daily balance snapshots; chart over time |
| Transaction search and filtering | Users need to find specific transactions by payee, amount, date, category | LOW | Standard list with filters; full-text search on payee/memo |
| Transfer detection | Transfers between own accounts must not count as spending; double-counting destroys budget accuracy | MEDIUM | Auto-suggest matching debits/credits by amount/date proximity; manual confirm |
| Split transactions | A single purchase may span categories (e.g., Walmart: groceries + household) | MEDIUM | YNAB and Monarch both support this; Monarch even has rule-based auto-splitting |
| Manual transaction entry | Sometimes you pay cash or need to add something before sync catches it | LOW | Simple form; match against incoming synced transactions later |
| Category groups | Organizing 30+ categories into groups (Housing, Food, Transport) is expected | LOW | Both YNAB and Actual use category groups; essential for readability |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable for a Monarch Money replacement.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Rules-based categorization with retroactive apply | Most apps only apply rules to new transactions; retroactive application across all history is powerful for fixing categorization mistakes en masse | MEDIUM | PROJECT.md specifies this; most-specific-rule-wins conflict resolution |
| Twice-monthly funding schedule | Aligned to actual pay schedule (15th and last day); YNAB and Actual have no concept of funding schedules — they just say "budget what you have" | LOW | Pre-populate envelope allocations on pay dates using default amounts; unique to this user's workflow |
| Default per-category budget allocations | Set-it-and-forget-it monthly defaults that auto-populate; reduces repetitive budgeting work each month | LOW | Manually overridable; most competitors require re-entering or copying from prior month |
| Sync error visibility | Monarch buries sync issues; having a clear status indicator with error logs builds trust in the data | LOW | Last sync time, per-account status, error details; most competitors show minimal sync info |
| Self-hosted data ownership | No subscription fees, no vendor lock-in, complete data control | LOW | Already decided in architecture; differentiates from Monarch ($100/yr) and YNAB ($110/yr) |
| Automated iCloud backup | SQLite snapshot backups without cloud vendor complexity | LOW | Atomic .backup command; scheduled post-sync and every 6 hours |
| Fast local-first performance | SQLite + single user = instant queries; no cloud round-trips | LOW | Actual Budget markets this heavily; genuine UX advantage over Monarch's cloud latency |

### Anti-Features (Deliberately NOT Building)

Features that seem good but create problems for a single-user self-hosted app.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Multi-user / household sharing | Monarch and YNAB support it; seems standard | Adds auth, permissions, data isolation, conflict resolution — massive complexity for no value in single-user context | Single-user by design; no auth layer needed |
| Mobile native app | Monarch and YNAB have iOS/Android apps | Building and maintaining native apps is a separate full project; web is accessible from any device | Responsive web UI works on phone browsers; Lunch Money takes this same approach |
| Investment portfolio tracking | Monarch shows holdings, gains/losses, allocation | Requires parsing complex brokerage data, handling cost basis, dividends, lots — enormous scope | Balance-only tracking for net worth; display total value per investment account |
| Recurring transaction forecasting | YNAB and Monarch predict upcoming bills | Requires pattern detection, scheduling engine, and false positive handling; real transactions arrive via bank sync anyway | SimpleFIN sync surfaces real transactions; no predictions needed |
| AI/ML-powered categorization | Marketed heavily by newer apps | Requires training data, model hosting, ongoing tuning; rules engine is deterministic and debuggable | Rules engine with most-specific-wins; user controls the logic transparently |
| Bill calendar view | Monarch and Lunch Money show bills on a calendar | Adds a scheduling/recurrence system that duplicates what bank sync provides; more UI surface to maintain | Transaction list with date filtering; budget view shows monthly allocation |
| Cryptocurrency tracking | Lunch Money supports crypto | Completely out of scope; adds exchange rate APIs, wallet integration, volatile asset handling | Not applicable to user's financial picture |
| Goal tracking / savings targets | YNAB Targets, Monarch Goals | Adds goal state management, progress tracking UI, allocation logic; envelope categories already serve this purpose | Use envelope categories for savings goals (e.g., "Vacation Fund" category with rollover) |
| Credit card payment tracking | YNAB has dedicated credit card payment categories | Adds significant complexity distinguishing credit spending from payment; for a single user, credit card payments are transfers | Treat credit card payments as transfers between accounts; spending is tracked when the charge occurs |
| Push notifications / email alerts | Seems useful for sync failures or budget warnings | Requires notification infrastructure (email service, push tokens); in-app indicator is sufficient for single user checking their own app | In-app sync status indicator; check the dashboard when you want updates |
| Data export (CSV/PDF reports) | Nice for tax time or sharing with accountant | Scope creep for v1; SQLite is directly queryable if needed | Direct SQLite access for ad-hoc queries; add CSV export later if needed |

## Feature Dependencies

```
[SimpleFIN Sync]
    └──requires──> [Account Setup]
    └──enables──> [Transaction Import]
                       └──enables──> [Transaction Categorization]
                       |                  └──requires──> [Categories & Groups]
                       |                  └──enhanced-by──> [Rules Engine]
                       └──enables──> [Transfer Detection]
                       └──enables──> [Balance Snapshots]

[Rules Engine]
    └──requires──> [Categories & Groups]
    └──requires──> [Transaction Import]
    └──enables──> [Retroactive Rule Application]

[Envelope Budgeting]
    └──requires──> [Categories & Groups]
    └──requires──> [Transaction Categorization]
    └──enhanced-by──> [Default Allocations]
    └──enhanced-by──> [Funding Schedule]
    └──enables──> [Rollover Tracking]

[Dashboard]
    └──requires──> [Account Balances] (from sync)
    └──requires──> [Spending by Category] (from categorized transactions)
    └──requires──> [Balance Snapshots] (for trends)

[Net Worth Tracking]
    └──requires──> [Balance Snapshots]
    └──requires──> [Investment Account Balances] (balance-only)

[Spending Reports]
    └──requires──> [Transaction Categorization]
    └──enhanced-by──> [Transfer Detection] (excludes transfers from spending)

[iCloud Backup]
    └──requires──> [SQLite Database] (independent of other features)
```

### Dependency Notes

- **Transaction Categorization requires Categories & Groups:** Categories must exist before transactions can be assigned to them; build category management first.
- **Envelope Budgeting requires Transaction Categorization:** Budget vs. actual tracking only works when transactions flow into the right categories.
- **Dashboard requires multiple data sources:** It aggregates balances, spending, and trends — build the data layer first, dashboard last.
- **Transfer Detection enhances Spending Reports:** Without transfer exclusion, reports double-count money movement between accounts.
- **Rules Engine enhances Transaction Categorization:** Rules automate what manual categorization starts; build manual first, then automate.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what's needed to replace Monarch Money.

- [ ] SimpleFIN sync with deduplication -- core data pipeline; nothing works without transactions flowing in
- [ ] Account and balance display -- see all accounts and balances at a glance
- [ ] Categories, category groups, and manual categorization -- organize transactions meaningfully
- [ ] Rules engine with retroactive application -- automate categorization; retroactive apply fixes history in bulk
- [ ] Transfer detection (auto-suggest + manual confirm) -- prevent double-counting in budgets
- [ ] Envelope budgeting with monthly periods and rollovers -- the core budgeting methodology
- [ ] Default allocations and twice-monthly funding -- matches pay schedule, reduces repetitive work
- [ ] Dashboard with balances, top categories, trends -- the daily landing page
- [ ] Net worth tracking with daily balance snapshots -- requires investment balance-only display
- [ ] Basic spending reports (by category, over time) -- "where did my money go?"
- [ ] Sync error logging and status indicator -- trust the data
- [ ] iCloud Drive SQLite backup -- data safety

### Add After Validation (v1.x)

Features to add once core is working and daily-drivable.

- [ ] Split transactions -- handle multi-category purchases (Walmart runs, etc.)
- [ ] Manual transaction entry with sync matching -- for cash purchases or pre-sync entries
- [ ] Advanced reporting (income vs expense, cash flow, custom date ranges) -- deeper analysis
- [ ] Transaction search with full-text and advanced filters -- power user need that grows with data volume
- [ ] Budget templates / copy from prior month -- speed up monthly budget setup

### Future Consideration (v2+)

Features to defer until the app is stable and daily-driven.

- [ ] CSV export for tax prep -- useful but SQLite is queryable directly
- [ ] Budget vs actual variance reports -- nice visualization, not critical
- [ ] Year-over-year spending comparison -- requires 12+ months of data to be meaningful
- [ ] Category spending alerts/warnings -- in-app notifications when approaching budget limits

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| SimpleFIN sync + dedup | HIGH | MEDIUM | P1 |
| Account/balance display | HIGH | LOW | P1 |
| Categories & groups | HIGH | LOW | P1 |
| Rules engine + retroactive | HIGH | MEDIUM | P1 |
| Transfer detection | HIGH | MEDIUM | P1 |
| Envelope budgeting + rollovers | HIGH | HIGH | P1 |
| Default allocations + funding schedule | MEDIUM | LOW | P1 |
| Dashboard | HIGH | MEDIUM | P1 |
| Net worth + balance snapshots | MEDIUM | MEDIUM | P1 |
| Spending reports | MEDIUM | MEDIUM | P1 |
| Sync status/error display | MEDIUM | LOW | P1 |
| iCloud backup | MEDIUM | LOW | P1 |
| Split transactions | MEDIUM | MEDIUM | P2 |
| Manual transaction entry | LOW | LOW | P2 |
| Advanced reporting | MEDIUM | MEDIUM | P2 |
| Transaction search/filters | MEDIUM | LOW | P2 |
| Budget templates | LOW | LOW | P2 |
| CSV export | LOW | LOW | P3 |
| Budget variance reports | LOW | MEDIUM | P3 |
| Year-over-year comparison | LOW | MEDIUM | P3 |
| Category spending alerts | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch (replaces Monarch Money)
- P2: Should have, add once daily-drivable
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Monarch Money | YNAB | Actual Budget | Lunch Money | Minerva Money (Our Plan) |
|---------|--------------|------|---------------|-------------|--------------------------|
| Bank sync | Plaid + MX (13K+ institutions) | Direct import + file import | GoCardless (EU/UK) + SimpleFIN (US) | Plaid + manual CSV | SimpleFIN only (16K+ via MX) |
| Budgeting method | Flexible (category or flex) | Zero-based / envelope | Envelope budgeting | Category-based | Envelope budgeting |
| Rollover | Yes | Yes (positive rolls forward; overspending deducts from next month) | Yes (configurable per category) | Yes | Yes (positive forward; overspend deducts) |
| Rules engine | Match on merchant/amount/category; auto-split | Auto-creates from behavior | Conditions (is/contains/matches/one-of) + stages (pre/default/post) | Robust rules with regex | Match on merchant/amount/memo; most-specific-wins; retroactive |
| Transfer detection | Category-based exclusion + rules | Manual categorization | Split transaction editor | Manual | Auto-suggest + manual confirm |
| Split transactions | Yes + rule-based auto-split | Yes | Yes | Yes | v1.x (post-launch) |
| Net worth | Yes + investment detail | Yes | Yes (reports) | Yes + crypto | Yes (balance-only investments) |
| Reports | Spending, income, net worth, custom | Spending, net worth, age of money | Net worth, cash flow, custom reports | Stats, trends, query tool | Spending by category, trends, net worth |
| Goal tracking | Yes (custom goals) | Yes (YNAB Targets) | No | No | No (use envelope categories) |
| Multi-user | Yes (household) | Yes (up to 6) | No | Yes (partner sharing) | No (single user) |
| Mobile app | iOS + Android | iOS + Android | Web only (PWA-like) | iOS + Android (web-first) | Web only (responsive) |
| Self-hosted | No | No | Yes | No | Yes |
| Pricing | $100/yr | $110/yr | Free (self-hosted) | $100/yr | Free (SimpleFIN $15/yr) |
| Manual entry | Yes | Yes (primary workflow) | Yes | Yes | v1.x |
| Calendar view | Yes (bills) | No | No | Yes | No (anti-feature) |
| Credit card handling | Standard account | Dedicated payment categories | Standard account | Standard account | Standard account (payments = transfers) |

## Sources

- [YNAB Features](https://www.ynab.com/features) -- official feature listing
- [YNAB Overspending Guide](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi) -- rollover and overspending mechanics
- [YNAB Monthly Rollovers](https://www.ynab.com/blog/master-your-monthly-rollovers) -- rollover behavior details
- [Monarch Money](https://www.monarch.com) -- competitor feature overview
- [Monarch Transaction Rules](https://help.monarch.com/hc/en-us/articles/360048393372-Creating-Transaction-Rules) -- rules engine details
- [Monarch Split Transactions](https://help.monarch.com/hc/en-us/articles/360050178492-Splitting-Transactions) -- split transaction support
- [Actual Budget Docs - Budgeting](https://actualbudget.org/docs/budgeting/) -- envelope budgeting implementation
- [Actual Budget Docs - Rules](https://actualbudget.org/docs/budgeting/rules/) -- rules engine with stages and conditions
- [Actual Budget Envelope Budgeting](https://actualbudget.org/docs/getting-started/envelope-budgeting/) -- methodology explanation
- [Lunch Money Features](https://lunchmoney.app/features) -- competitor feature listing
- [Key Features Every Personal Finance App Needs in 2026](https://financialpanther.com/key-features-every-personal-finance-app-needs-in-2026/) -- industry expectations
- [Best Budgeting Apps 2026 - NerdWallet](https://www.nerdwallet.com/finance/learn/best-budget-apps) -- market comparison
- [Zero-Based Budgeting Apps 2026 Comparison](https://waypointbudget.com/blog/zero-based-budgeting-apps-2026) -- envelope budgeting landscape

---
*Feature research for: Personal envelope budgeting (self-hosted, single-user)*
*Researched: 2026-03-22*
