import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createDatabase } from '../db/connection.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import {
  computeSpecificity,
  matchesRule,
  createRule,
  updateRule,
  deleteRule,
  listRules,
  evaluateRules,
  categorizeNewTransactions,
  previewRule,
  applyRule,
} from './rules-service.js';

function seedTestData(db: Database.Database) {
  db.prepare(`INSERT INTO category_groups (id, name, sort_order) VALUES (1, 'Spending', 0)`).run();
  db.prepare(`INSERT INTO categories (id, group_id, name, sort_order) VALUES (1, 1, 'Groceries', 0)`).run();
  db.prepare(`INSERT INTO categories (id, group_id, name, sort_order) VALUES (2, 1, 'Shopping', 1)`).run();
  db.prepare(`INSERT INTO categories (id, group_id, name, sort_order) VALUES (3, 1, 'Bills', 2)`).run();

  db.prepare(`INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 100000)`).run();
}

describe('computeSpecificity', () => {
  it('returns 3 for merchant exact match only', () => {
    expect(computeSpecificity({ merchantPattern: 'Amazon', matchType: 'exact', amountMin: null, amountMax: null, memoPattern: null })).toBe(3);
  });

  it('returns 2 for merchant contains match only', () => {
    expect(computeSpecificity({ merchantPattern: 'Amazon', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null })).toBe(2);
  });

  it('returns 2 for amount range with both bounds', () => {
    expect(computeSpecificity({ merchantPattern: null, matchType: 'contains', amountMin: 1000, amountMax: 5000, memoPattern: null })).toBe(2);
  });

  it('returns 1 for amount range with one bound', () => {
    expect(computeSpecificity({ merchantPattern: null, matchType: 'contains', amountMin: 1000, amountMax: null, memoPattern: null })).toBe(1);
  });

  it('returns 1 for memo pattern only', () => {
    expect(computeSpecificity({ merchantPattern: null, matchType: 'contains', amountMin: null, amountMax: null, memoPattern: 'subscription' })).toBe(1);
  });

  it('returns combined score for multiple conditions', () => {
    expect(computeSpecificity({ merchantPattern: 'Amazon', matchType: 'exact', amountMin: 1000, amountMax: 5000, memoPattern: 'prime' })).toBe(6);
  });

  it('returns 0 for no conditions', () => {
    expect(computeSpecificity({ merchantPattern: null, matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null })).toBe(0);
  });
});

describe('matchesRule', () => {
  it('matches merchant exact (case-insensitive)', () => {
    const rule = { merchant_pattern: 'Amazon', match_type: 'exact' as const, amount_min: null, amount_max: null, memo_pattern: null };
    expect(matchesRule(rule, { payee: 'amazon', amount: -5000, memo: null })).toBe(true);
    expect(matchesRule(rule, { payee: 'Amazon Prime', amount: -5000, memo: null })).toBe(false);
  });

  it('matches merchant contains (case-insensitive)', () => {
    const rule = { merchant_pattern: 'Amazon', match_type: 'contains' as const, amount_min: null, amount_max: null, memo_pattern: null };
    expect(matchesRule(rule, { payee: 'Amazon Prime', amount: -5000, memo: null })).toBe(true);
    expect(matchesRule(rule, { payee: 'AMAZON.COM', amount: -5000, memo: null })).toBe(true);
    expect(matchesRule(rule, { payee: 'Walmart', amount: -5000, memo: null })).toBe(false);
  });

  it('returns false when payee is null and merchant is required', () => {
    const rule = { merchant_pattern: 'Amazon', match_type: 'contains' as const, amount_min: null, amount_max: null, memo_pattern: null };
    expect(matchesRule(rule, { payee: null, amount: -5000, memo: null })).toBe(false);
  });

  it('matches amount range using ABS(amount)', () => {
    const rule = { merchant_pattern: null, match_type: 'contains' as const, amount_min: 1000, amount_max: 5000, memo_pattern: null };
    expect(matchesRule(rule, { payee: 'Store', amount: -3000, memo: null })).toBe(true);
    expect(matchesRule(rule, { payee: 'Store', amount: -500, memo: null })).toBe(false);
    expect(matchesRule(rule, { payee: 'Store', amount: -6000, memo: null })).toBe(false);
  });

  it('matches amount with only min bound', () => {
    const rule = { merchant_pattern: null, match_type: 'contains' as const, amount_min: 1000, amount_max: null, memo_pattern: null };
    expect(matchesRule(rule, { payee: 'Store', amount: -3000, memo: null })).toBe(true);
    expect(matchesRule(rule, { payee: 'Store', amount: -500, memo: null })).toBe(false);
  });

  it('matches memo contains (case-insensitive)', () => {
    const rule = { merchant_pattern: null, match_type: 'contains' as const, amount_min: null, amount_max: null, memo_pattern: 'subscription' };
    expect(matchesRule(rule, { payee: 'Netflix', amount: -1500, memo: 'Monthly Subscription' })).toBe(true);
    expect(matchesRule(rule, { payee: 'Netflix', amount: -1500, memo: null })).toBe(false);
  });

  it('requires ALL conditions to match (AND logic)', () => {
    const rule = { merchant_pattern: 'Amazon', match_type: 'contains' as const, amount_min: 1000, amount_max: 5000, memo_pattern: null };
    expect(matchesRule(rule, { payee: 'Amazon', amount: -3000, memo: null })).toBe(true);
    expect(matchesRule(rule, { payee: 'Amazon', amount: -500, memo: null })).toBe(false);
    expect(matchesRule(rule, { payee: 'Walmart', amount: -3000, memo: null })).toBe(false);
  });

  it('skips null conditions', () => {
    const rule = { merchant_pattern: null, match_type: 'contains' as const, amount_min: null, amount_max: null, memo_pattern: null };
    expect(matchesRule(rule, { payee: 'Anything', amount: -100, memo: null })).toBe(true);
  });
});

describe('createRule', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-rules-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a rule and computes specificity score', () => {
    const rule = createRule(db, {
      name: 'Amazon Groceries',
      merchantPattern: 'Amazon',
      matchType: 'contains',
      amountMin: null,
      amountMax: null,
      memoPattern: null,
      categoryId: 1,
    });

    expect(rule.id).toBeDefined();
    expect(rule.name).toBe('Amazon Groceries');
    expect(rule.specificityScore).toBe(2);
  });

  it('throws if no conditions are provided', () => {
    expect(() =>
      createRule(db, {
        name: 'Empty Rule',
        merchantPattern: null,
        matchType: 'contains',
        amountMin: null,
        amountMax: null,
        memoPattern: null,
        categoryId: 1,
      }),
    ).toThrow('at least one condition');
  });
});

describe('updateRule', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-rules-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('updates rule and recomputes specificity', () => {
    const rule = createRule(db, {
      name: 'Amazon',
      merchantPattern: 'Amazon',
      matchType: 'contains',
      amountMin: null,
      amountMax: null,
      memoPattern: null,
      categoryId: 1,
    });

    updateRule(db, rule.id, {
      name: 'Amazon Exact',
      merchantPattern: 'Amazon',
      matchType: 'exact',
      amountMin: 1000,
      amountMax: 5000,
      memoPattern: null,
      categoryId: 1,
    });

    const rules = listRules(db);
    const updated = rules.find(r => r.id === rule.id);
    expect(updated?.name).toBe('Amazon Exact');
    expect(updated?.specificityScore).toBe(5);
  });
});

describe('deleteRule', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-rules-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('deletes a rule by id', () => {
    const rule = createRule(db, {
      name: 'Test',
      merchantPattern: 'Test',
      matchType: 'contains',
      amountMin: null,
      amountMax: null,
      memoPattern: null,
      categoryId: 1,
    });

    deleteRule(db, rule.id);
    const rules = listRules(db);
    expect(rules.find(r => r.id === rule.id)).toBeUndefined();
  });
});

describe('listRules', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-rules-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns rules with category name sorted by specificity DESC, id DESC', () => {
    createRule(db, { name: 'Low', merchantPattern: null, matchType: 'contains', amountMin: null, amountMax: null, memoPattern: 'test', categoryId: 1 });
    createRule(db, { name: 'High', merchantPattern: 'Amazon', matchType: 'exact', amountMin: null, amountMax: null, memoPattern: null, categoryId: 2 });

    const rules = listRules(db);
    expect(rules[0].name).toBe('High');
    expect(rules[0].categoryName).toBe('Shopping');
    expect(rules[0].specificityScore).toBe(3);
    expect(rules[1].name).toBe('Low');
    expect(rules[1].categoryName).toBe('Groceries');
    expect(rules[1].specificityScore).toBe(1);
  });
});

describe('evaluateRules', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-rules-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the most specific matching rule', () => {
    createRule(db, { name: 'General Amazon', merchantPattern: 'Amazon', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null, categoryId: 1 });
    createRule(db, { name: 'Exact Amazon', merchantPattern: 'Amazon', matchType: 'exact', amountMin: null, amountMax: null, memoPattern: null, categoryId: 2 });

    const winner = evaluateRules(db, { payee: 'Amazon', amount: -3000, memo: null });
    expect(winner?.name).toBe('Exact Amazon');
  });

  it('breaks ties by newer rule (higher id)', () => {
    createRule(db, { name: 'Old Rule', merchantPattern: 'Store', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null, categoryId: 1 });
    createRule(db, { name: 'New Rule', merchantPattern: 'Store', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null, categoryId: 2 });

    const winner = evaluateRules(db, { payee: 'Store', amount: -1000, memo: null });
    expect(winner?.name).toBe('New Rule');
  });

  it('returns null when no rules match', () => {
    createRule(db, { name: 'Amazon', merchantPattern: 'Amazon', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null, categoryId: 1 });

    const winner = evaluateRules(db, { payee: 'Walmart', amount: -1000, memo: null });
    expect(winner).toBeNull();
  });
});

describe('previewRule', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-rules-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns matching uncategorized transactions with current and proposed category', () => {
    const rule = createRule(db, { name: 'Amazon', merchantPattern: 'Amazon', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null, categoryId: 1 });

    db.prepare(`INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('t1', 'acc1', '2026-01-01', -5000, 'Amazon Prime')`).run();
    db.prepare(`INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('t2', 'acc1', '2026-01-02', -3000, 'Walmart')`).run();

    const preview = previewRule(db, rule.id);
    expect(preview).toHaveLength(1);
    expect(preview[0].transactionId).toBe('t1');
    expect(preview[0].currentCategoryName).toBeNull();
    expect(preview[0].proposedCategoryName).toBe('Groceries');
  });

  it('excludes manually categorized transactions', () => {
    const rule = createRule(db, { name: 'Amazon', merchantPattern: 'Amazon', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null, categoryId: 1 });

    db.prepare(`INSERT INTO transactions (id, account_id, date, amount, payee, category_id) VALUES ('t1', 'acc1', '2026-01-01', -5000, 'Amazon Prime', 2)`).run();

    const preview = previewRule(db, rule.id);
    expect(preview).toHaveLength(0);
  });

  it('includes transactions categorized by a different rule', () => {
    const rule1 = createRule(db, { name: 'Old', merchantPattern: 'Amazon', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null, categoryId: 2 });
    const rule2 = createRule(db, { name: 'New', merchantPattern: 'Amazon', matchType: 'exact', amountMin: null, amountMax: null, memoPattern: null, categoryId: 1 });

    db.prepare(`INSERT INTO transactions (id, account_id, date, amount, payee, category_id, rule_id) VALUES ('t1', 'acc1', '2026-01-01', -5000, 'Amazon', 2, ?)`).run(rule1.id);

    const preview = previewRule(db, rule2.id);
    expect(preview).toHaveLength(1);
    expect(preview[0].currentCategoryName).toBe('Shopping');
    expect(preview[0].proposedCategoryName).toBe('Groceries');
  });
});

describe('applyRule', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-rules-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('applies rule to matching uncategorized transactions', () => {
    const rule = createRule(db, { name: 'Amazon', merchantPattern: 'Amazon', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null, categoryId: 1 });

    db.prepare(`INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('t1', 'acc1', '2026-01-01', -5000, 'Amazon Prime')`).run();
    db.prepare(`INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('t2', 'acc1', '2026-01-02', -3000, 'Amazon Fresh')`).run();
    db.prepare(`INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('t3', 'acc1', '2026-01-03', -2000, 'Walmart')`).run();

    const count = applyRule(db, rule.id);
    expect(count).toBe(2);

    const t1 = db.prepare('SELECT category_id, rule_id FROM transactions WHERE id = ?').get('t1') as { category_id: number; rule_id: number };
    expect(t1.category_id).toBe(1);
    expect(t1.rule_id).toBe(rule.id);

    const t3 = db.prepare('SELECT category_id, rule_id FROM transactions WHERE id = ?').get('t3') as { category_id: number | null; rule_id: number | null };
    expect(t3.category_id).toBeNull();
  });

  it('does not override manually categorized transactions', () => {
    const rule = createRule(db, { name: 'Amazon', merchantPattern: 'Amazon', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null, categoryId: 1 });

    db.prepare(`INSERT INTO transactions (id, account_id, date, amount, payee, category_id) VALUES ('t1', 'acc1', '2026-01-01', -5000, 'Amazon Prime', 2)`).run();

    const count = applyRule(db, rule.id);
    expect(count).toBe(0);

    const t1 = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t1') as { category_id: number };
    expect(t1.category_id).toBe(2);
  });
});

describe('categorizeNewTransactions', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-rules-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('categorizes uncategorized transactions matching a rule', () => {
    createRule(db, { name: 'Amazon', merchantPattern: 'Amazon', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null, categoryId: 1 });

    db.prepare(`INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('t1', 'acc1', '2026-01-01', -5000, 'Amazon Prime')`).run();

    categorizeNewTransactions(db, ['t1']);

    const txn = db.prepare('SELECT category_id, rule_id FROM transactions WHERE id = ?').get('t1') as { category_id: number | null; rule_id: number | null };
    expect(txn.category_id).toBe(1);
    expect(txn.rule_id).toBeDefined();
  });

  it('skips manually categorized transactions', () => {
    createRule(db, { name: 'Amazon', merchantPattern: 'Amazon', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null, categoryId: 1 });

    db.prepare(`INSERT INTO transactions (id, account_id, date, amount, payee, category_id) VALUES ('t1', 'acc1', '2026-01-01', -5000, 'Amazon Prime', 2)`).run();

    categorizeNewTransactions(db, ['t1']);

    const txn = db.prepare('SELECT category_id, rule_id FROM transactions WHERE id = ?').get('t1') as { category_id: number | null; rule_id: number | null };
    expect(txn.category_id).toBe(2);
    expect(txn.rule_id).toBeNull();
  });

  it('skips transactions with splits', () => {
    createRule(db, { name: 'Amazon', merchantPattern: 'Amazon', matchType: 'contains', amountMin: null, amountMax: null, memoPattern: null, categoryId: 1 });

    db.prepare(`INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('t1', 'acc1', '2026-01-01', -5000, 'Amazon Prime')`).run();
    db.prepare(`INSERT INTO transaction_splits (transaction_id, category_id, amount) VALUES ('t1', 1, 5000)`).run();

    categorizeNewTransactions(db, ['t1']);

    const txn = db.prepare('SELECT category_id, rule_id FROM transactions WHERE id = ?').get('t1') as { category_id: number | null; rule_id: number | null };
    expect(txn.category_id).toBeNull();
    expect(txn.rule_id).toBeNull();
  });

  it('handles empty transaction list', () => {
    expect(() => categorizeNewTransactions(db, [])).not.toThrow();
  });
});
