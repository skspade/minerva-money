import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import type { Context } from '../../sync/trpc.js';
import { updateTransactionCategory, createGroup, createCategory } from '../../categories/category-service.js';
import { createRule, updateRule, deleteRule, applyRule } from '../../rules/rules-service.js';
import { createAccount } from '../../accounts/accounts-service.js';
import { setAllocation, setDefaultAllocation } from '../../budget/budget-service.js';
import { confirmTransfer, dismissTransfer } from '../../transfers/transfer-service.js';
import { runSync } from '../../sync/sync-service.js';
import { jsonResult, errorResult } from './tool-helpers.js';

function categoryExists(db: Database.Database, categoryId: number): boolean {
  return !!db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
}

function ruleExists(db: Database.Database, ruleId: number): boolean {
  return !!db.prepare('SELECT id FROM categorization_rules WHERE id = ?').get(ruleId);
}

function groupExists(db: Database.Database, groupId: number): boolean {
  return !!db.prepare('SELECT id FROM category_groups WHERE id = ?').get(groupId);
}

function duplicateGroupName(db: Database.Database, name: string): { id: number; name: string } | null {
  return (db.prepare('SELECT id, name FROM category_groups WHERE LOWER(name) = LOWER(?)').get(name) as { id: number; name: string } | undefined) ?? null;
}

function duplicateCategoryName(db: Database.Database, groupId: number, name: string): { id: number; name: string } | null {
  return (db.prepare('SELECT id, name FROM categories WHERE group_id = ? AND LOWER(name) = LOWER(?)').get(groupId, name) as { id: number; name: string } | undefined) ?? null;
}

function duplicateAccountName(db: Database.Database, name: string): { id: string; name: string } | null {
  return (db.prepare('SELECT id, name FROM accounts WHERE LOWER(name) = LOWER(?)').get(name) as { id: string; name: string } | undefined) ?? null;
}

export function createActionTools(db: Database.Database, ctx: Context) {
  return [
    tool(
      'categorize_transaction',
      'Categorize a transaction by setting its category. Requires valid transactionId and categoryId.',
      {
        transactionId: z.string().describe('Transaction ID'),
        categoryId: z.number().describe('Category ID to assign'),
      },
      async (args) => {
        try {
          const txn = db.prepare('SELECT id FROM transactions WHERE id = ?').get(args.transactionId);
          if (!txn) return errorResult(new Error(`Transaction ${args.transactionId} not found`));
          if (!categoryExists(db, args.categoryId)) return errorResult(new Error(`Category ${args.categoryId} not found`));
          updateTransactionCategory(db, args.transactionId, args.categoryId);
          return jsonResult({ success: true, transactionId: args.transactionId, categoryId: args.categoryId });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'create_rule',
      'Create a categorization rule. Requires at least one condition (merchantPattern, amountMin/amountMax, or memoPattern) and a valid categoryId.',
      {
        name: z.string().describe('Rule name'),
        merchantPattern: z.string().nullable().optional().describe('Merchant name pattern to match'),
        matchType: z.enum(['exact', 'contains']).optional().default('contains').describe('Match type for merchant pattern'),
        amountMin: z.number().nullable().optional().describe('Minimum transaction amount in cents'),
        amountMax: z.number().nullable().optional().describe('Maximum transaction amount in cents'),
        memoPattern: z.string().nullable().optional().describe('Memo pattern to match'),
        categoryId: z.number().describe('Category ID to assign when rule matches'),
      },
      async (args) => {
        try {
          if (!categoryExists(db, args.categoryId)) return errorResult(new Error(`Category ${args.categoryId} not found`));
          const rule = createRule(db, {
            name: args.name,
            merchantPattern: args.merchantPattern ?? null,
            matchType: args.matchType ?? 'contains',
            amountMin: args.amountMin ?? null,
            amountMax: args.amountMax ?? null,
            memoPattern: args.memoPattern ?? null,
            categoryId: args.categoryId,
          });
          return jsonResult({ success: true, rule });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'update_rule',
      'Update an existing categorization rule. Requires valid ruleId and categoryId, and at least one condition.',
      {
        ruleId: z.number().describe('Rule ID to update'),
        name: z.string().describe('Updated rule name'),
        merchantPattern: z.string().nullable().optional().describe('Merchant name pattern to match'),
        matchType: z.enum(['exact', 'contains']).optional().default('contains').describe('Match type for merchant pattern'),
        amountMin: z.number().nullable().optional().describe('Minimum transaction amount in cents'),
        amountMax: z.number().nullable().optional().describe('Maximum transaction amount in cents'),
        memoPattern: z.string().nullable().optional().describe('Memo pattern to match'),
        categoryId: z.number().describe('Category ID to assign when rule matches'),
      },
      async (args) => {
        try {
          if (!ruleExists(db, args.ruleId)) return errorResult(new Error(`Rule ${args.ruleId} not found`));
          if (!categoryExists(db, args.categoryId)) return errorResult(new Error(`Category ${args.categoryId} not found`));
          updateRule(db, args.ruleId, {
            name: args.name,
            merchantPattern: args.merchantPattern ?? null,
            matchType: args.matchType ?? 'contains',
            amountMin: args.amountMin ?? null,
            amountMax: args.amountMax ?? null,
            memoPattern: args.memoPattern ?? null,
            categoryId: args.categoryId,
          });
          return jsonResult({ success: true, ruleId: args.ruleId });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'delete_rule',
      'Delete a categorization rule by ID.',
      {
        ruleId: z.number().describe('Rule ID to delete'),
      },
      async (args) => {
        try {
          if (!ruleExists(db, args.ruleId)) return errorResult(new Error(`Rule ${args.ruleId} not found`));
          deleteRule(db, args.ruleId);
          return jsonResult({ success: true, ruleId: args.ruleId });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'apply_rule',
      'Apply a categorization rule retroactively to all matching uncategorized transactions. Returns count of affected transactions.',
      {
        ruleId: z.number().describe('Rule ID to apply'),
      },
      async (args) => {
        try {
          if (!ruleExists(db, args.ruleId)) return errorResult(new Error(`Rule ${args.ruleId} not found`));
          const transactionsAffected = applyRule(db, args.ruleId);
          return jsonResult({ success: true, ruleId: args.ruleId, transactionsAffected });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'set_budget_allocation',
      'Set budget allocation for a category in a specific period. Amount in cents. Requires user confirmation before calling.',
      {
        categoryId: z.number().describe('Category ID'),
        period: z.string().describe('Budget period in YYYY-MM format'),
        amountInCents: z.number().describe('Allocation amount in cents'),
      },
      async (args) => {
        try {
          if (!categoryExists(db, args.categoryId)) return errorResult(new Error(`Category ${args.categoryId} not found`));
          if (args.amountInCents < 0) return errorResult(new Error('Amount must be non-negative'));
          setAllocation(db, args.categoryId, args.period, args.amountInCents);
          return jsonResult({ success: true, categoryId: args.categoryId, period: args.period, amountInCents: args.amountInCents });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'set_default_allocation',
      'Set default budget allocation for a category (applies to all future periods). Amount in cents. Requires user confirmation before calling.',
      {
        categoryId: z.number().describe('Category ID'),
        amountInCents: z.number().describe('Default allocation amount in cents'),
      },
      async (args) => {
        try {
          if (!categoryExists(db, args.categoryId)) return errorResult(new Error(`Category ${args.categoryId} not found`));
          if (args.amountInCents < 0) return errorResult(new Error('Amount must be non-negative'));
          setDefaultAllocation(db, args.categoryId, args.amountInCents);
          return jsonResult({ success: true, categoryId: args.categoryId, amountInCents: args.amountInCents });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'confirm_transfer',
      'Confirm a pending transfer suggestion between accounts.',
      {
        linkId: z.number().describe('Transfer link ID to confirm'),
      },
      async (args) => {
        try {
          confirmTransfer(db, args.linkId);
          return jsonResult({ success: true, linkId: args.linkId });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'dismiss_transfer',
      'Dismiss a pending transfer suggestion between accounts.',
      {
        linkId: z.number().describe('Transfer link ID to dismiss'),
      },
      async (args) => {
        try {
          dismissTransfer(db, args.linkId);
          return jsonResult({ success: true, linkId: args.linkId });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'trigger_sync',
      'Trigger a manual SimpleFIN sync to fetch latest account and transaction data.',
      {},
      async () => {
        try {
          const accounts = db.prepare('SELECT id, name FROM accounts').all() as { id: string; name: string }[];
          if (accounts.length > 0) {
            const blocked = accounts.filter(a => !ctx.rateLimiter.canManualSync(a.id));
            if (blocked.length > 0) {
              return errorResult(new Error(`Rate limit: insufficient quota for accounts: ${blocked.map(a => a.name).join(', ')}`));
            }
          }
          const result = await runSync(db, ctx.client, ctx.rateLimiter);
          return jsonResult(result);
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'batch_categorize_transactions',
      'Categorize multiple transactions at once. Each item maps a transaction to a category. All updates are applied atomically.',
      {
        items: z.array(z.object({
          transactionId: z.string().describe('Transaction ID'),
          categoryId: z.number().describe('Category ID to assign'),
        })).min(1).max(200).describe('Array of transaction-category assignments'),
      },
      async (args) => {
        try {
          const errors: string[] = [];
          const categoryCache = new Map<number, boolean>();
          for (const item of args.items) {
            const txn = db.prepare('SELECT id FROM transactions WHERE id = ?').get(item.transactionId);
            if (!txn) errors.push(`Transaction ${item.transactionId} not found`);
            if (!categoryCache.has(item.categoryId)) {
              categoryCache.set(item.categoryId, categoryExists(db, item.categoryId));
            }
            if (!categoryCache.get(item.categoryId)) {
              errors.push(`Category ${item.categoryId} not found`);
            }
          }
          if (errors.length > 0) return errorResult(new Error(errors.join('; ')));
          db.transaction(() => {
            for (const item of args.items) {
              updateTransactionCategory(db, item.transactionId, item.categoryId);
            }
          })();
          return jsonResult({ success: true, count: args.items.length });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'batch_set_budget_allocations',
      'Set budget allocations for multiple categories in a period. All updates are applied atomically. Requires user confirmation before calling.',
      {
        period: z.string().describe('Budget period in YYYY-MM format'),
        items: z.array(z.object({
          categoryId: z.number().describe('Category ID'),
          amountInCents: z.number().min(0).describe('Allocation amount in cents'),
        })).min(1).max(100).describe('Array of category-amount pairs'),
      },
      async (args) => {
        try {
          const errors: string[] = [];
          for (const item of args.items) {
            if (!categoryExists(db, item.categoryId)) errors.push(`Category ${item.categoryId} not found`);
          }
          if (errors.length > 0) return errorResult(new Error(errors.join('; ')));
          db.transaction(() => {
            for (const item of args.items) {
              setAllocation(db, item.categoryId, args.period, item.amountInCents);
            }
          })();
          return jsonResult({ success: true, period: args.period, count: args.items.length });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'batch_set_default_allocations',
      'Set default budget allocations for multiple categories. All updates are applied atomically. Requires user confirmation before calling.',
      {
        items: z.array(z.object({
          categoryId: z.number().describe('Category ID'),
          amountInCents: z.number().min(0).describe('Default allocation amount in cents'),
        })).min(1).max(100).describe('Array of category-amount pairs'),
      },
      async (args) => {
        try {
          const errors: string[] = [];
          for (const item of args.items) {
            if (!categoryExists(db, item.categoryId)) errors.push(`Category ${item.categoryId} not found`);
          }
          if (errors.length > 0) return errorResult(new Error(errors.join('; ')));
          db.transaction(() => {
            for (const item of args.items) {
              setDefaultAllocation(db, item.categoryId, item.amountInCents);
            }
          })();
          return jsonResult({ success: true, count: args.items.length });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'batch_resolve_transfers',
      'Confirm or dismiss multiple transfer suggestions at once. All updates are applied atomically.',
      {
        items: z.array(z.object({
          linkId: z.number().describe('Transfer link ID'),
          action: z.enum(['confirm', 'dismiss']).describe('Whether to confirm or dismiss this transfer'),
        })).min(1).max(100).describe('Array of transfer resolutions'),
      },
      async (args) => {
        try {
          db.transaction(() => {
            for (const item of args.items) {
              if (item.action === 'confirm') {
                confirmTransfer(db, item.linkId);
              } else {
                dismissTransfer(db, item.linkId);
              }
            }
          })();
          const confirmed = args.items.filter(i => i.action === 'confirm').length;
          const dismissed = args.items.filter(i => i.action === 'dismiss').length;
          return jsonResult({ success: true, confirmed, dismissed });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'create_category_group',
      'Create a new category group. Requires user confirmation before calling.',
      {
        name: z.string().describe('Name for the new category group'),
      },
      async (args) => {
        try {
          const existing = duplicateGroupName(db, args.name);
          if (existing) return errorResult(new Error(`Category group "${existing.name}" already exists (id: ${existing.id})`));
          const group = createGroup(db, args.name);
          return jsonResult({ success: true, id: group.id, name: group.name });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'create_category',
      'Create a new category in an existing group. Requires user confirmation before calling.',
      {
        groupId: z.number().describe('ID of the category group'),
        name: z.string().describe('Name for the new category'),
      },
      async (args) => {
        try {
          if (!groupExists(db, args.groupId)) return errorResult(new Error(`Category group ${args.groupId} not found`));
          const existing = duplicateCategoryName(db, args.groupId, args.name);
          if (existing) return errorResult(new Error(`Category "${existing.name}" already exists in this group (id: ${existing.id})`));
          const category = createCategory(db, args.groupId, args.name);
          return jsonResult({ success: true, id: category.id, name: category.name });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'create_account',
      'Create a new manual account for institutions not available through SimpleFIN. Creates with zero balance — populate via CSV import. Requires user confirmation before calling.',
      {
        name: z.string().describe('Account name'),
        institution: z.string().describe('Financial institution name'),
        type: z.enum(['banking', 'credit']).default('banking').describe('Account type (banking or credit)'),
      },
      async (args) => {
        try {
          const existing = duplicateAccountName(db, args.name);
          if (existing) return errorResult(new Error(`Account "${existing.name}" already exists (id: ${existing.id})`));
          const account = createAccount(db, { name: args.name, institution: args.institution, type: args.type });
          return jsonResult({ success: true, id: account.id, name: account.name, institution: account.institution, type: account.type, source: account.source });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),
  ];
}
