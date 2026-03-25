# Feature Research

**Domain:** Manual account management + CSV import integration for personal budgeting app
**Researched:** 2026-03-25
**Confidence:** HIGH (design doc is authoritative; web research confirms patterns match industry standard)

## Context

This is a subsequent milestone research file for v2.7. The features below describe ONLY what is new:
manual accounts and CSV import integration. Existing features (SimpleFIN sync, envelope budgeting,
categorization rules, transfer detection, agent, streaming chat) are fully shipped and out of scope.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in a manual account feature set. Missing these makes the feature feel
half-baked or creates data integrity problems.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Create manual account (name, institution, type) | Without this the entire feature doesn't exist. Monarch Money and YNAB both support this. | LOW | `manual_<uuid>` ID prefix avoids SimpleFIN ID collisions. Type defaults to `'banking'`. |
| Edit manual account metadata | Users make typos; institutions rename. | LOW | Name, institution, type only. Editing SimpleFIN accounts is explicitly blocked — their data comes from sync. |
| Delete manual account with cascade cleanup | Users want a clean undo. Missing cascade = orphaned budget allocations and splits. | MEDIUM | Must delete transactions, splits, budget allocations referencing those transactions atomically. Requires destructive-action confirmation dialog in UI. |
| Balance computed from transaction sums | Manual accounts have no external balance source; transactions ARE the source of truth. Standard pattern across Goodbudget and Monarch manual accounts. | LOW | `recalculateBalance()` called after each CSV import. No manual balance entry field needed. |
| Visual distinction from synced accounts | Users need to know which accounts are manual vs auto-synced. No "Last synced" timestamp should appear for manual accounts or users will think sync is broken. | LOW | "Manual" badge or label next to account name. "Last imported: {date}" instead of sync timestamp. No Sync Now button shown. |
| Source column in DB schema | All downstream features (reports, agent, dashboard, service guards) need to distinguish manual vs synced. | LOW | Migration: `ALTER TABLE accounts ADD COLUMN source TEXT NOT NULL DEFAULT 'simplefin'`. One-way, backward-compatible. |
| Manual accounts in dashboard and net worth | Users expect all accounts in one place. Invisible accounts break the net worth picture. | LOW | No new query logic needed — dashboard already reads `balance` column, balance snapshots already work against the column. |
| Manual account transactions in reports | Category spending, spending over time, and net worth reports must include manual transactions or the data picture is wrong. | LOW | No new query logic needed — reports already query all transactions. Manual transactions go through the same pipeline. |

### Differentiators (Competitive Advantage)

Features that go beyond the baseline and make manual accounts feel integrated rather than bolted on.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Inline account creation during CSV import wizard | Users hit "no account exists yet" at exactly the moment they're mapping. Forcing them to leave the wizard, create the account, and return breaks flow. Monarch Money supports account creation during import. | MEDIUM | "+" option at top of mapping dropdown triggers inline form. Client calls `accounts.create` mutation, gets back new ID, auto-selects it in the dropdown. No wizard step changes needed. |
| Post-import balance recalculation (automatic) | Without this, manual account balances are stale after every import. Users should not need to trigger a separate recalculate action. | LOW | `executeImport()` calls `recalculateBalance()` for each manual account that received transactions. Transparent to user. |
| Agent `create_account` tool | Power users can create accounts via chat ("Create a manual account for Freedom Mortgage as a loan"). Consistent with existing add-only agent safety pattern (category creation already works this way). | LOW | Wraps `accounts.create()`. Requires confirmation flow matching budget change pattern. System prompt guides agent to ask for institution name before creating. |
| `source` field exposed in `list_accounts` agent tool | Agent can answer "which of my accounts are manual vs synced?" and provide useful context about data freshness. | LOW | One-field addition to existing query tool response. No new tool needed. |
| Transfer detection across manual and synced accounts | A mortgage payment as a bank debit is a transfer to the loan account. Manual accounts should participate in the same transfer detection logic as synced ones. | LOW | No new code — `detectTransferCandidates` already operates on all transactions by account + amount + date. Works automatically once manual account transactions exist. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Manual balance entry (override computed balance) | "I want to set the starting balance without importing transactions" | Creates balance drift — computed vs manually entered balances diverge on every import. Two sources of truth break net worth accuracy and make recalculate logic unreliable. | Import a CSV with a single opening-balance transaction. Document this pattern in the UI tooltip or help text. |
| Edit or delete SimpleFIN accounts | "I want to rename a synced account or hide one I don't use" | SimpleFIN re-creates accounts on next sync. Deletions reappear. Renames are overwritten. This creates confusion and silent data loss. | Restrict CRUD to `source = 'manual'` only at the service layer. Synced accounts are read-only by design. |
| Import CSV to a synced account | "I want to backfill history for a bank I already have connected" | Duplicate risk is elevated: transactions already synced via SimpleFIN collide with imported ones. Dedup hash helps but date+amount+payee ambiguity causes edge cases that are hard to diagnose. | The app already allows importing to existing accounts — this works. Do not add UI language suggesting it is risk-free. Keep current behavior (dedup prevents exact duplicates) without special promotion. |
| Bulk CSV re-import in replace mode | "I want to re-import and overwrite everything" | Destroys manual categorizations and rule-applied categories. Hard to undo. Dedup already makes additive re-import safe and idempotent. | Dedup makes re-import additive and safe by default. Communicate this to the user instead of offering a destructive replace path. |
| Manual account type beyond banking | "I want a manual investment account" | Investment account balances are tracked as balance-only (not summed from transactions). The computed-from-transactions model does not apply to investments and the design would require branching logic throughout the service. Scope explosion. | Restrict manual account type to `'banking'` for this milestone. Investment accounts come from SimpleFIN only. |

---

## Feature Dependencies

```
[DB migration: source column]
    └──required by──> [Account CRUD service (createAccount, updateAccount, deleteAccount, recalculateBalance)]
                          └──required by──> [tRPC mutations: accounts.create, accounts.update, accounts.delete]
                                                ├──required by──> [Inline account creation in ImportPage dropdown]
                                                └──required by──> [Agent create_account tool]

[Account CRUD service: recalculateBalance()]
    └──required by──> [Post-import balance recalculation inside executeImport()]

[tRPC accounts.create mutation]
    └──required by──> [Inline creation flow in ImportPage Step 2]
                          └──enhances──> [Existing 3-step import wizard — no step count changes needed]

[source column returned in accounts.list response]
    └──required by──> [Visual distinction on AccountsPage (Manual badge, Last imported label)]
    └──enhances──> [Agent list_accounts query tool (add source field to output)]
```

### Dependency Notes

- **DB migration must be first.** Every other feature reads or writes the `source` column. The migration runs before any service code is wired up.
- **Account CRUD service before tRPC.** Service functions are the contract; the tRPC router wraps them. Consistent with every other module in this codebase (categories, rules, budget, etc.).
- **`accounts.create` tRPC mutation before inline import creation.** ImportPage calls the mutation, receives the new account ID, and injects it into `accountMappings`. The wizard itself does not change step structure.
- **Post-import recalculation is internal to `executeImport`.** No client change needed. It is a transparent side effect triggered inside the existing execute path.
- **Agent tool depends on service, not tRPC.** Consistent with existing action tools (action-tools.ts calls service functions directly, not through tRPC).
- **Visual distinction on AccountsPage depends on `source` being in the `accounts.list` response.** The tRPC router already returns the full account row; adding `source` to the returned shape is the only change needed.

---

## MVP Definition

### Launch With (v2.7)

All items confirmed in `.planning/designs/2026-03-25-manual-accounts-csv-import-design.md`.

- [ ] DB migration: `source` column with `'simplefin'` default on existing rows
- [ ] `accounts-service.ts`: createAccount, updateAccount, deleteAccount, recalculateBalance
- [ ] tRPC mutations: `accounts.create`, `accounts.update`, `accounts.delete` (added to existing accountsRouter)
- [ ] `executeImport()` calls `recalculateBalance()` for each manual account that received transactions
- [ ] ImportPage Step 2: "+" option in account mapping dropdown, inline creation form (name pre-filled, institution input, type dropdown), auto-selects newly created account
- [ ] AccountsPage: "Manual" badge, "Last imported" label for manual accounts, no Sync Now button shown for manual accounts
- [ ] `accounts.list` tRPC response includes `source` field
- [ ] Agent `create_account` tool with confirmation flow
- [ ] Agent `list_accounts` tool response includes `source` field
- [ ] System prompt update: guidance that agent can create manual accounts for institutions not in SimpleFIN

### Add After Validation (future milestone)

- [ ] Opening balance transaction pattern documented in UI help text — trigger: user asks how to set a starting balance without CSV data
- [ ] AccountsPage edit/rename/delete actions for manual accounts in the UI (currently CRUD is agent + tRPC only) — trigger: user wants to modify without going through agent

### Future Consideration (v3+)

- [ ] Multiple CSV format support beyond Monarch (OFX, QFX, bank-specific CSV) — depends on whether SimpleFIN coverage gaps justify the parsing investment
- [ ] Manual account type expansion to HELOC or loan (balance = negative sum of transactions) — depends on Freedom Mortgage use case maturing beyond current out-of-scope status

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| DB schema migration (source column) | HIGH | LOW | P1 |
| Account CRUD service | HIGH | LOW | P1 |
| tRPC create/update/delete mutations | HIGH | LOW | P1 |
| Post-import balance recalculation | HIGH | LOW | P1 |
| Inline account creation in import wizard | HIGH | MEDIUM | P1 |
| source field in accounts.list response | HIGH | LOW | P1 |
| Visual distinction on AccountsPage | MEDIUM | LOW | P1 |
| Agent create_account tool | MEDIUM | LOW | P1 |
| source field in agent list_accounts response | LOW | LOW | P1 |
| AccountsPage edit/delete UI for manual accounts | MEDIUM | LOW | P2 |
| Opening balance UI guidance | LOW | LOW | P2 |

---

## Competitor Feature Analysis

| Feature | Monarch Money | YNAB | Minerva v2.7 |
|---------|--------------|------|--------------|
| Manual account creation | Yes — "+ Add Account" flow, separate from import | Yes — Add Account first, then import file to it | Inline during CSV import AND standalone via tRPC mutation and agent tool |
| Account creation during import | Yes — can create or select account while mapping CSV | No — must create account first, then import separately | Yes — "+" option at top of mapping dropdown, no wizard step change |
| Balance source for manual accounts | User sets balance manually OR imports transactions | User sets opening balance, transactions update it | Computed entirely from transaction sums; no manual entry field |
| Visual distinction from synced accounts | "Manual" label on account tiles | Account list shows connection status indicator | "Manual" badge + "Last imported" instead of sync timestamp |
| Delete manual account | Yes, with data removal | Yes | Yes — cascade deletes transactions and related data atomically |
| Restrict edits to synced accounts | Yes — synced accounts are read-only | Yes | Yes — service enforces `source = 'manual'` check before allowing mutation |
| Agent-based account creation | No | No | Yes — `create_account` tool with confirmation flow |

---

## Sources

- `.planning/designs/2026-03-25-manual-accounts-csv-import-design.md` — authoritative design spec (HIGH confidence)
- `.planning/PROJECT.md` — existing feature inventory, constraints, key decisions (HIGH confidence)
- `packages/client/src/pages/ImportPage.tsx` — existing import wizard code, account mapping flow (HIGH confidence)
- `packages/server/src/import/import-router.ts` and `import-service.ts` — existing import API contract (HIGH confidence)
- `packages/server/src/agent/tools/action-tools.ts` — existing agent tool patterns (HIGH confidence)
- [Monarch Money CSV import help](https://help.monarch.com/hc/en-us/articles/4409682789908-Import-Transaction-Data-Manually-from-Banks-or-Other-Finance-Apps) — competitor pattern reference; page 403 on fetch but search result summary confirms account creation during import is supported (MEDIUM confidence)
- [Monarch Money CSV import announcement](https://www.monarch.com/whats-new/tags-csv-import) — confirms assign-or-create-account pattern during import (MEDIUM confidence)
- [YNAB file-based import](https://support.ynab.com/en_us/file-based-import-a-guide-Bkj4Sszyo) — competitor pattern reference; page not accessible but YNAB's create-account-first pattern is well known (MEDIUM confidence)
- Web search: budgeting app manual account UX patterns 2025 — general UX validation (LOW confidence, used for corroboration only)

---
*Feature research for: Minerva Money v2.7 Manual Accounts + CSV Import Integration*
*Researched: 2026-03-25*
