import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase } from '../../db/connection.js';
import { createActionTools } from './action-tools.js';
import { createGroup, createCategory } from '../../categories/category-service.js';
import { createRule as createRuleSvc } from '../../rules/rules-service.js';
import type Database from 'better-sqlite3';
import type { Context } from '../../sync/trpc.js';
import type { SimpleFINClient } from '../../sync/simplefin-types.js';
import type { RateLimiter } from '../../sync/rate-limiter.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

function parseResult(result: { content: { type: string; text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

describe('action-tools', () => {
  let db: Database.Database;
  let tmpDir: string;
  let ctx: Context;
  let findTool: (name: string) => { handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }> };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'minerva-action-test-'));
    db = createDatabase(join(tmpDir, 'test.db'));
    ctx = {
      db,
      client: {
        fetchAccounts: async () => ({ accounts: [] }),
      } as unknown as SimpleFINClient,
      rateLimiter: {
        canRequest: () => true,
        canManualSync: () => true,
        recordRequest: () => {},
      } as unknown as RateLimiter,
    };
    const tools = createActionTools(db, ctx);
    findTool = (name: string) => {
      const t = tools.find((t) => t.name === name);
      if (!t) throw new Error(`Tool ${name} not found`);
      return t as unknown as { handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }> };
    };
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns 17 tools', () => {
    const tools = createActionTools(db, ctx);
    expect(tools).toHaveLength(17);
  });

  it('returns tools with expected names', () => {
    const tools = createActionTools(db, ctx);
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      'categorize_transaction',
      'create_rule',
      'update_rule',
      'delete_rule',
      'apply_rule',
      'set_budget_allocation',
      'set_default_allocation',
      'confirm_transfer',
      'dismiss_transfer',
      'trigger_sync',
      'batch_categorize_transactions',
      'batch_set_budget_allocations',
      'batch_set_default_allocations',
      'batch_resolve_transfers',
      'create_category_group',
      'create_category',
      'create_account',
    ]);
  });

  describe('categorize_transaction', () => {
    it('sets category on existing transaction', async () => {
      const group = createGroup(db, 'Food');
      const category = createCategory(db, group.id, 'Dining');
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 10000)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn1', 'acc1', '2026-03-01', -500, 'Starbucks')").run();

      const result = await findTool('categorize_transaction').handler({ transactionId: 'txn1', categoryId: category.id });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.categoryId).toBe(category.id);

      const row = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('txn1') as { category_id: number };
      expect(row.category_id).toBe(category.id);
    });

    it('returns error for non-existent transaction', async () => {
      const group = createGroup(db, 'Food');
      const category = createCategory(db, group.id, 'Dining');

      const result = await findTool('categorize_transaction').handler({ transactionId: 'nope', categoryId: category.id });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('returns error for non-existent category', async () => {
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 10000)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn1', 'acc1', '2026-03-01', -500, 'Starbucks')").run();

      const result = await findTool('categorize_transaction').handler({ transactionId: 'txn1', categoryId: 99999 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('create_rule', () => {
    it('creates rule with merchant pattern', async () => {
      const group = createGroup(db, 'Food');
      const category = createCategory(db, group.id, 'Dining');

      const result = await findTool('create_rule').handler({
        name: 'Starbucks Rule',
        merchantPattern: 'Starbucks',
        categoryId: category.id,
      });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.rule.name).toBe('Starbucks Rule');
    });

    it('returns error for non-existent category', async () => {
      const result = await findTool('create_rule').handler({
        name: 'Bad Rule',
        merchantPattern: 'Test',
        categoryId: 99999,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('returns error when no conditions provided', async () => {
      const group = createGroup(db, 'Food');
      const category = createCategory(db, group.id, 'Dining');

      const result = await findTool('create_rule').handler({
        name: 'Empty Rule',
        categoryId: category.id,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('at least one condition');
    });
  });

  describe('update_rule', () => {
    it('updates existing rule', async () => {
      const group = createGroup(db, 'Food');
      const category = createCategory(db, group.id, 'Dining');
      const rule = createRuleSvc(db, {
        name: 'Old Rule',
        merchantPattern: 'OldMerchant',
        matchType: 'contains',
        amountMin: null,
        amountMax: null,
        memoPattern: null,
        categoryId: category.id,
      });

      const result = await findTool('update_rule').handler({
        ruleId: rule.id,
        name: 'Updated Rule',
        merchantPattern: 'NewMerchant',
        categoryId: category.id,
      });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
    });

    it('returns error for non-existent rule', async () => {
      const group = createGroup(db, 'Food');
      const category = createCategory(db, group.id, 'Dining');

      const result = await findTool('update_rule').handler({
        ruleId: 99999,
        name: 'Bad Update',
        merchantPattern: 'Test',
        categoryId: category.id,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('delete_rule', () => {
    it('deletes existing rule', async () => {
      const group = createGroup(db, 'Food');
      const category = createCategory(db, group.id, 'Dining');
      const rule = createRuleSvc(db, {
        name: 'To Delete',
        merchantPattern: 'DeleteMe',
        matchType: 'contains',
        amountMin: null,
        amountMax: null,
        memoPattern: null,
        categoryId: category.id,
      });

      const result = await findTool('delete_rule').handler({ ruleId: rule.id });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);

      const row = db.prepare('SELECT id FROM categorization_rules WHERE id = ?').get(rule.id);
      expect(row).toBeUndefined();
    });

    it('returns error for non-existent rule', async () => {
      const result = await findTool('delete_rule').handler({ ruleId: 99999 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('apply_rule', () => {
    it('applies rule and returns affected count', async () => {
      const group = createGroup(db, 'Food');
      const category = createCategory(db, group.id, 'Dining');
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 10000)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn1', 'acc1', '2026-03-01', -500, 'Starbucks')").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn2', 'acc1', '2026-03-02', -600, 'Starbucks Reserve')").run();

      const rule = createRuleSvc(db, {
        name: 'Starbucks',
        merchantPattern: 'Starbucks',
        matchType: 'contains',
        amountMin: null,
        amountMax: null,
        memoPattern: null,
        categoryId: category.id,
      });

      const result = await findTool('apply_rule').handler({ ruleId: rule.id });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.transactionsAffected).toBe(2);
    });
  });

  describe('set_budget_allocation', () => {
    it('sets allocation for category/period', async () => {
      const group = createGroup(db, 'Food');
      const category = createCategory(db, group.id, 'Dining');

      const result = await findTool('set_budget_allocation').handler({
        categoryId: category.id,
        period: '2026-03',
        amountInCents: 50000,
      });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.amountInCents).toBe(50000);
    });

    it('returns error for negative amount', async () => {
      const group = createGroup(db, 'Food');
      const category = createCategory(db, group.id, 'Dining');

      const result = await findTool('set_budget_allocation').handler({
        categoryId: category.id,
        period: '2026-03',
        amountInCents: -100,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('non-negative');
    });

    it('returns error for non-existent category', async () => {
      const result = await findTool('set_budget_allocation').handler({
        categoryId: 99999,
        period: '2026-03',
        amountInCents: 50000,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('set_default_allocation', () => {
    it('sets default allocation for category', async () => {
      const group = createGroup(db, 'Food');
      const category = createCategory(db, group.id, 'Dining');

      const result = await findTool('set_default_allocation').handler({
        categoryId: category.id,
        amountInCents: 30000,
      });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.amountInCents).toBe(30000);
    });
  });

  describe('confirm_transfer', () => {
    it('confirms existing transfer link', async () => {
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 10000)").run();
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc2', 'Savings', 'Bank', 'savings', 20000)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn1', 'acc1', '2026-03-01', -1000, 'Transfer')").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn2', 'acc2', '2026-03-01', 1000, 'Transfer')").run();
      db.prepare("INSERT INTO transfer_links (transaction_a_id, transaction_b_id, confirmed) VALUES ('txn1', 'txn2', 0)").run();

      const link = db.prepare('SELECT id FROM transfer_links LIMIT 1').get() as { id: number };
      const result = await findTool('confirm_transfer').handler({ linkId: link.id });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);

      const row = db.prepare('SELECT confirmed FROM transfer_links WHERE id = ?').get(link.id) as { confirmed: number };
      expect(row.confirmed).toBe(1);
    });

    it('returns error for non-existent link', async () => {
      const result = await findTool('confirm_transfer').handler({ linkId: 99999 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('dismiss_transfer', () => {
    it('dismisses existing transfer link', async () => {
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 10000)").run();
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc2', 'Savings', 'Bank', 'savings', 20000)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn1', 'acc1', '2026-03-01', -1000, 'Transfer')").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn2', 'acc2', '2026-03-01', 1000, 'Transfer')").run();
      db.prepare("INSERT INTO transfer_links (transaction_a_id, transaction_b_id, confirmed) VALUES ('txn1', 'txn2', 0)").run();

      const link = db.prepare('SELECT id FROM transfer_links LIMIT 1').get() as { id: number };
      const result = await findTool('dismiss_transfer').handler({ linkId: link.id });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);

      const row = db.prepare('SELECT confirmed FROM transfer_links WHERE id = ?').get(link.id) as { confirmed: number };
      expect(row.confirmed).toBe(-1);
    });
  });

  describe('trigger_sync', () => {
    it('calls runSync and returns result', async () => {
      const result = await findTool('trigger_sync').handler({});
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data).toHaveProperty('accountsSynced');
      expect(data).toHaveProperty('transactionsAdded');
    });

    it('returns error when rate limited', async () => {
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acct-1', 'Checking', 'Bank', 'checking', 100000)").run();
      ctx.rateLimiter = { ...ctx.rateLimiter, canManualSync: () => false } as unknown as RateLimiter;
      const tools = createActionTools(db, ctx);
      const triggerSync = tools.find(t => t.name === 'trigger_sync')!;
      const result = await (triggerSync as unknown as { handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }> }).handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Rate limit');
      expect(result.content[0].text).toContain('Checking');
    });
  });

  describe('batch_categorize_transactions', () => {
    it('categorizes multiple transactions to different categories', async () => {
      const group = createGroup(db, 'Food');
      const dining = createCategory(db, group.id, 'Dining');
      const groceries = createCategory(db, group.id, 'Groceries');
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 10000)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn1', 'acc1', '2026-03-01', -500, 'Starbucks')").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn2', 'acc1', '2026-03-02', -3000, 'Kroger')").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn3', 'acc1', '2026-03-03', -800, 'McDonalds')").run();

      const result = await findTool('batch_categorize_transactions').handler({
        items: [
          { transactionId: 'txn1', categoryId: dining.id },
          { transactionId: 'txn2', categoryId: groceries.id },
          { transactionId: 'txn3', categoryId: dining.id },
        ],
      });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.count).toBe(3);

      const rows = db.prepare('SELECT id, category_id FROM transactions ORDER BY id').all() as { id: string; category_id: number }[];
      expect(rows[0].category_id).toBe(dining.id);
      expect(rows[1].category_id).toBe(groceries.id);
      expect(rows[2].category_id).toBe(dining.id);
    });

    it('returns error when any transaction ID is invalid (no partial updates)', async () => {
      const group = createGroup(db, 'Food');
      const category = createCategory(db, group.id, 'Dining');
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 10000)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn1', 'acc1', '2026-03-01', -500, 'Starbucks')").run();

      const result = await findTool('batch_categorize_transactions').handler({
        items: [
          { transactionId: 'txn1', categoryId: category.id },
          { transactionId: 'nope', categoryId: category.id },
        ],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('nope');
      expect(result.content[0].text).toContain('not found');

      const row = db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('txn1') as { category_id: number | null };
      expect(row.category_id).toBeNull();
    });

    it('returns error when any category ID is invalid', async () => {
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 10000)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn1', 'acc1', '2026-03-01', -500, 'Starbucks')").run();

      const result = await findTool('batch_categorize_transactions').handler({
        items: [{ transactionId: 'txn1', categoryId: 99999 }],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Category 99999 not found');
    });
  });

  describe('batch_set_budget_allocations', () => {
    it('sets allocations for multiple categories in one period', async () => {
      const group = createGroup(db, 'Living');
      const rent = createCategory(db, group.id, 'Rent');
      const groceries = createCategory(db, group.id, 'Groceries');

      const result = await findTool('batch_set_budget_allocations').handler({
        period: '2026-04',
        items: [
          { categoryId: rent.id, amountInCents: 150000 },
          { categoryId: groceries.id, amountInCents: 60000 },
        ],
      });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.period).toBe('2026-04');
      expect(data.count).toBe(2);

      const alloc = db.prepare('SELECT amount FROM budget_allocations WHERE category_id = ? AND period = ?').get(rent.id, '2026-04') as { amount: number };
      expect(alloc.amount).toBe(150000);
    });

    it('returns error for non-existent category', async () => {
      const result = await findTool('batch_set_budget_allocations').handler({
        period: '2026-04',
        items: [{ categoryId: 99999, amountInCents: 50000 }],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('batch_set_default_allocations', () => {
    it('sets defaults for multiple categories', async () => {
      const group = createGroup(db, 'Living');
      const rent = createCategory(db, group.id, 'Rent');
      const groceries = createCategory(db, group.id, 'Groceries');

      const result = await findTool('batch_set_default_allocations').handler({
        items: [
          { categoryId: rent.id, amountInCents: 150000 },
          { categoryId: groceries.id, amountInCents: 60000 },
        ],
      });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.count).toBe(2);

      const alloc = db.prepare("SELECT amount FROM budget_allocations WHERE category_id = ? AND period = 'default'").get(groceries.id) as { amount: number };
      expect(alloc.amount).toBe(60000);
    });

    it('returns error for non-existent category', async () => {
      const result = await findTool('batch_set_default_allocations').handler({
        items: [{ categoryId: 99999, amountInCents: 50000 }],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });
  });

  describe('batch_resolve_transfers', () => {
    it('confirms and dismisses transfers in one call', async () => {
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 10000)").run();
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc2', 'Savings', 'Bank', 'savings', 20000)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn1', 'acc1', '2026-03-01', -1000, 'Transfer')").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn2', 'acc2', '2026-03-01', 1000, 'Transfer')").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn3', 'acc1', '2026-03-05', -2000, 'Transfer')").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn4', 'acc2', '2026-03-05', 2000, 'Transfer')").run();
      db.prepare("INSERT INTO transfer_links (transaction_a_id, transaction_b_id, confirmed) VALUES ('txn1', 'txn2', 0)").run();
      db.prepare("INSERT INTO transfer_links (transaction_a_id, transaction_b_id, confirmed) VALUES ('txn3', 'txn4', 0)").run();

      const links = db.prepare('SELECT id FROM transfer_links ORDER BY id').all() as { id: number }[];
      const result = await findTool('batch_resolve_transfers').handler({
        items: [
          { linkId: links[0].id, action: 'confirm' },
          { linkId: links[1].id, action: 'dismiss' },
        ],
      });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.confirmed).toBe(1);
      expect(data.dismissed).toBe(1);

      const rows = db.prepare('SELECT id, confirmed FROM transfer_links ORDER BY id').all() as { id: number; confirmed: number }[];
      expect(rows[0].confirmed).toBe(1);
      expect(rows[1].confirmed).toBe(-1);
    });

    it('returns error for non-existent link ID (rolls back all)', async () => {
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 10000)").run();
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc2', 'Savings', 'Bank', 'savings', 20000)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn1', 'acc1', '2026-03-01', -1000, 'Transfer')").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn2', 'acc2', '2026-03-01', 1000, 'Transfer')").run();
      db.prepare("INSERT INTO transfer_links (transaction_a_id, transaction_b_id, confirmed) VALUES ('txn1', 'txn2', 0)").run();

      const link = db.prepare('SELECT id FROM transfer_links LIMIT 1').get() as { id: number };
      const result = await findTool('batch_resolve_transfers').handler({
        items: [
          { linkId: link.id, action: 'confirm' },
          { linkId: 99999, action: 'dismiss' },
        ],
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');

      const row = db.prepare('SELECT confirmed FROM transfer_links WHERE id = ?').get(link.id) as { confirmed: number };
      expect(row.confirmed).toBe(0);
    });
  });

  describe('create_category_group', () => {
    it('creates a new category group', async () => {
      const result = await findTool('create_category_group').handler({ name: 'Travel' });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.id).toBeGreaterThan(0);
      expect(data.name).toBe('Travel');
    });

    it('returns error for duplicate group name (case-insensitive)', async () => {
      createGroup(db, 'Food');
      const result = await findTool('create_category_group').handler({ name: 'food' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('already exists');
      expect(result.content[0].text).toContain('Food');
    });

    it('returns error for duplicate group name (exact case)', async () => {
      createGroup(db, 'Entertainment');
      const result = await findTool('create_category_group').handler({ name: 'Entertainment' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('already exists');
    });

    it('includes confirmation requirement in description', () => {
      const tools = createActionTools(db, ctx);
      const tool = tools.find(t => t.name === 'create_category_group')!;
      expect(tool.description).toContain('Requires user confirmation before calling');
    });
  });

  describe('create_category', () => {
    it('creates a new category in existing group', async () => {
      const group = createGroup(db, 'Travel');
      const result = await findTool('create_category').handler({ groupId: group.id, name: 'Airlines' });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.id).toBeGreaterThan(0);
      expect(data.name).toBe('Airlines');
    });

    it('returns error for non-existent group', async () => {
      const result = await findTool('create_category').handler({ groupId: 99999, name: 'Airlines' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('returns error for duplicate category name within group (case-insensitive)', async () => {
      const group = createGroup(db, 'Food');
      createCategory(db, group.id, 'Dining');
      const result = await findTool('create_category').handler({ groupId: group.id, name: 'dining' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('already exists');
      expect(result.content[0].text).toContain('Dining');
    });

    it('allows same category name in different groups', async () => {
      const group1 = createGroup(db, 'Personal');
      const group2 = createGroup(db, 'Business');
      createCategory(db, group1.id, 'Travel');
      const result = await findTool('create_category').handler({ groupId: group2.id, name: 'Travel' });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.name).toBe('Travel');
    });

    it('includes confirmation requirement in description', () => {
      const tools = createActionTools(db, ctx);
      const tool = tools.find(t => t.name === 'create_category')!;
      expect(tool.description).toContain('Requires user confirmation before calling');
    });

    it('returns id usable with categorize_transaction immediately', async () => {
      const group = createGroup(db, 'Food');
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance) VALUES ('acc1', 'Checking', 'Bank', 'checking', 10000)").run();
      db.prepare("INSERT INTO transactions (id, account_id, date, amount, payee) VALUES ('txn1', 'acc1', '2026-03-01', -500, 'Starbucks')").run();

      const createResult = await findTool('create_category').handler({ groupId: group.id, name: 'Coffee' });
      const created = parseResult(createResult);

      const catResult = await findTool('categorize_transaction').handler({ transactionId: 'txn1', categoryId: created.id });
      expect(catResult.isError).toBeUndefined();
      const catData = parseResult(catResult);
      expect(catData.success).toBe(true);
      expect(catData.categoryId).toBe(created.id);
    });
  });

  describe('create_account', () => {
    it('creates a manual account and returns success', async () => {
      const result = await findTool('create_account').handler({ name: 'Chase Checking', institution: 'Chase', type: 'banking' });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.id).toMatch(/^manual_/);
      expect(data.name).toBe('Chase Checking');
      expect(data.institution).toBe('Chase');
      expect(data.type).toBe('banking');
      expect(data.source).toBe('manual');
    });

    it('creates a credit account', async () => {
      const result = await findTool('create_account').handler({ name: 'Chase Sapphire', institution: 'Chase', type: 'credit' });
      expect(result.isError).toBeUndefined();
      const data = parseResult(result);
      expect(data.success).toBe(true);
      expect(data.type).toBe('credit');
    });

    it('returns error for duplicate account name (case-insensitive)', async () => {
      db.prepare("INSERT INTO accounts (id, name, institution, type, balance, source) VALUES ('manual_abc', 'Chase Checking', 'Chase', 'banking', 0, 'manual')").run();
      const result = await findTool('create_account').handler({ name: 'chase checking', institution: 'Chase', type: 'banking' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('already exists');
      expect(result.content[0].text).toContain('Chase Checking');
    });

    it('includes confirmation requirement in description', () => {
      const tools = createActionTools(db, ctx);
      const tool = tools.find(t => t.name === 'create_account')!;
      expect(tool.description).toContain('Requires user confirmation before calling');
    });
  });
});
