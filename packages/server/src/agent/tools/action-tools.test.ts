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

  it('returns 12 tools', () => {
    const tools = createActionTools(db, ctx);
    expect(tools).toHaveLength(12);
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
      'create_category_group',
      'create_category',
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
});
