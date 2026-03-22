---
phase: 02-simplefin-data-pipeline
plan: 01
subsystem: sync
tags: [simplefin, http-client, normalization, fixtures]

requires:
  - phase: 01-foundation
    provides: Cents type and toCents helper, database schema
provides:
  - SimpleFIN API response types (SimpleFINAccountSet, SimpleFINAccount, SimpleFINTransaction)
  - App domain types (NormalizedAccount, NormalizedTransaction)
  - SimpleFINClient interface with fetchAccounts, fetchTransactions, fetchBalances
  - Mock client with fixture data for 3 accounts (Discover, Fidelity, Consumers CU)
  - Dedup hash generator (SHA-256)
  - Token claim utility
  - Client factory with SIMPLEFIN_MOCK env var support
affects: [02-simplefin-data-pipeline]

tech-stack:
  added: []
  patterns: [mock-switchable client interface, numeric string to Cents normalization]

key-files:
  created:
    - packages/server/src/sync/simplefin-types.ts
    - packages/server/src/sync/simplefin-client.ts
    - packages/server/src/sync/simplefin-client.test.ts
    - packages/server/src/sync/fixtures/simplefin-response.json
  modified: []

key-decisions:
  - "Account type derived from transaction presence (no txns = investment)"
  - "Dedup hash format: SHA-256 of accountId|date|amount|payee"
  - "Pending transaction date uses transacted_at or current date when posted=0"

patterns-established:
  - "Mock-switchable client: interface + real/mock implementations + env-based factory"
  - "Amount normalization: parseFloat(string) then toCents() for all SimpleFIN amounts"

requirements-completed: [SYNC-01]

duration: 8min
completed: 2026-03-22
---

# Plan 02-01: SimpleFIN HTTP Client Summary

**SimpleFIN client normalizes bank data from numeric strings to typed Cents with mock fixture mode for development and testing.**

## Performance

- **Duration:** 8 min
- **Tasks:** 2/2 completed
- **Files created:** 4
- **Tests:** 21 passing

## Accomplishments

- Created SimpleFIN protocol v2 type definitions matching official spec
- Implemented normalizeAccount and normalizeTransaction with Cents conversion
- Built deterministic SHA-256 dedup hash generator
- Created mock client returning realistic fixture data (3 accounts, 10+ transactions)
- Fixture includes pending transactions, zero-amount entries, deposits and withdrawals
- Token claim utility for one-time setup

## Self-Check: PASSED

- [x] All types compile
- [x] Mock client returns fixture data
- [x] Amount normalization correct (-45.67 -> -4567)
- [x] Dedup hash deterministic
- [x] 21 tests passing
