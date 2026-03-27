import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { getBudgetSummary, getAvailableToBudget } from '../../budget/budget-service.js';
import { getSpendingByCategory, getSpendingOverTime, getNetWorth } from '../../reports/reports-service.js';
import { listGroupsWithCategories } from '../../categories/category-service.js';
import { listRules } from '../../rules/rules-service.js';
import { listTransferCandidates } from '../../transfers/transfer-service.js';
import { xmlWrap, jsonResult, errorResult } from './tool-helpers.js';

export function createQueryTools(db: Database.Database) {
  return [
    tool(
      'get_account_balances',
      'List all accounts with current balances. Use to answer questions about account balances. Amounts in cents (integer). Account types: checking, savings, credit, investment. The source field distinguishes manual accounts from SimpleFIN-synced accounts.',
      {},
      async () => {
        try {
          const rows = db.prepare(
            'SELECT id, name, institution, type, balance, source FROM accounts ORDER BY institution, name',
          ).all();
          return jsonResult(rows);
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'get_budget_summary',
      'Get budget status for a month showing allocated, spent, available, and rollover per category. Use for budget questions. Amounts in cents.',
      { period: z.string().describe('Month in YYYY-MM format, e.g. "2026-03"') },
      async (args) => {
        try {
          const categories = getBudgetSummary(db, args.period);
          const availableToBudget = getAvailableToBudget(db, args.period);
          return jsonResult({ categories, availableToBudget });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'get_spending_by_category',
      'Get spending breakdown by category for a date range. Use for "how much did I spend on X?" questions. Amounts in cents (positive = spending). Excludes transfers.',
      {
        startDate: z.string().describe('Start date YYYY-MM-DD'),
        endDate: z.string().describe('End date YYYY-MM-DD'),
      },
      async (args) => {
        try {
          const data = getSpendingByCategory(db, args.startDate, args.endDate);
          return jsonResult(data);
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'get_spending_over_time',
      'Get monthly spending totals over a date range. Use for trend questions like "am I spending more this month?" Amounts in cents.',
      {
        startDate: z.string().describe('Start date YYYY-MM-DD'),
        endDate: z.string().describe('End date YYYY-MM-DD'),
      },
      async (args) => {
        try {
          const data = getSpendingOverTime(db, args.startDate, args.endDate);
          return jsonResult(data);
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'get_net_worth',
      'Get net worth over time with daily data points. Use for net worth and wealth trend questions. Amounts in cents.',
      {
        startDate: z.string().optional().describe('Start date YYYY-MM-DD (optional)'),
        endDate: z.string().optional().describe('End date YYYY-MM-DD (optional)'),
      },
      async (args) => {
        try {
          const data = getNetWorth(db, args.startDate, args.endDate);
          return jsonResult(data);
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'get_available_to_budget',
      'Get the amount available to budget (unallocated income) for a period. Use for "how much can I still budget?" questions. Amount in cents.',
      { period: z.string().describe('Month in YYYY-MM format') },
      async (args) => {
        try {
          const availableToBudget = getAvailableToBudget(db, args.period);
          return jsonResult({ period: args.period, availableToBudget });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'list_transactions',
      'Search and filter transactions. Use for finding specific transactions or merchants. Amounts in cents (negative = expense, positive = income). Returns paginated results with total count.',
      {
        payee: z.string().optional().describe('Filter by payee name (contains match)'),
        categoryId: z.number().optional().describe('Filter by category ID'),
        accountId: z.string().optional().describe('Filter by account ID'),
        startDate: z.string().optional().describe('Start date YYYY-MM-DD'),
        endDate: z.string().optional().describe('End date YYYY-MM-DD'),
        minAmount: z.number().optional().describe('Min amount in cents (use negative for expenses)'),
        maxAmount: z.number().optional().describe('Max amount in cents'),
        limit: z.number().optional().default(20).describe('Max results (default 20, max 100)'),
      },
      async (args) => {
        try {
          const limit = Math.min(args.limit ?? 20, 100);
          const conditions: string[] = [];
          const params: unknown[] = [];

          if (args.payee) {
            conditions.push('t.payee LIKE ? COLLATE NOCASE');
            params.push(`%${args.payee}%`);
          }
          if (args.categoryId !== undefined) {
            conditions.push('t.category_id = ?');
            params.push(args.categoryId);
          }
          if (args.accountId) {
            conditions.push('t.account_id = ?');
            params.push(args.accountId);
          }
          if (args.startDate) {
            conditions.push('t.date >= ?');
            params.push(args.startDate);
          }
          if (args.endDate) {
            conditions.push('t.date <= ?');
            params.push(args.endDate);
          }
          if (args.minAmount !== undefined) {
            conditions.push('t.amount >= ?');
            params.push(args.minAmount);
          }
          if (args.maxAmount !== undefined) {
            conditions.push('t.amount <= ?');
            params.push(args.maxAmount);
          }

          const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

          const countRow = db.prepare(
            `SELECT COUNT(*) as total FROM transactions t ${whereClause}`,
          ).get(...params) as { total: number };

          const rows = db.prepare(
            `SELECT t.id, t.account_id, t.date, t.amount, t.payee, t.memo, t.category_id,
                    c.name as category_name
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             ${whereClause}
             ORDER BY t.date DESC
             LIMIT ?`,
          ).all(...params, limit + 1) as { id: string; account_id: string; date: string; amount: number; payee: string | null; memo: string | null; category_id: number | null; category_name: string | null }[];

          const hasMore = rows.length > limit;
          const transactions = rows.slice(0, limit).map(r => ({
            ...r,
            payee: xmlWrap('merchant', r.payee),
            memo: xmlWrap('memo', r.memo),
          }));

          return jsonResult({ transactions, total: countRow.total, hasMore });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'get_uncategorized_transactions',
      'List transactions without a category. Use to answer "what needs categorizing?" Amounts in cents.',
      {
        limit: z.number().optional().default(20).describe('Max results (default 20, max 100)'),
      },
      async (args) => {
        try {
          const limit = Math.min(args.limit ?? 20, 100);

          const countRow = db.prepare(
            'SELECT COUNT(*) as total FROM transactions WHERE category_id IS NULL',
          ).get() as { total: number };

          const rows = db.prepare(
            'SELECT id, account_id, date, amount, payee, memo FROM transactions WHERE category_id IS NULL ORDER BY date DESC LIMIT ?',
          ).all(limit) as { id: string; account_id: string; date: string; amount: number; payee: string | null; memo: string | null }[];

          const transactions = rows.map(r => ({
            ...r,
            payee: xmlWrap('merchant', r.payee),
            memo: xmlWrap('memo', r.memo),
          }));

          return jsonResult({ transactions, total: countRow.total });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'list_categories',
      'List all category groups and their categories with IDs. Use to resolve category names to IDs for other queries.',
      {},
      async () => {
        try {
          const data = listGroupsWithCategories(db);
          return jsonResult(data);
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'list_rules',
      'List all categorization rules showing conditions and target category. Use for "what rules do I have?" questions.',
      {},
      async () => {
        try {
          const rules = listRules(db);
          const wrapped = rules.map(r => ({
            ...r,
            merchantPattern: xmlWrap('merchant_pattern', r.merchantPattern),
          }));
          return jsonResult(wrapped);
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'get_sync_status',
      'Get sync status: last sync time, result, errors, and active warnings per account. Use for "when did I last sync?", "are there sync errors?", or "which accounts have problems?" questions.',
      {},
      async () => {
        try {
          const syncLog = db.prepare(
            'SELECT started_at, completed_at, status, accounts_synced, transactions_added, error_message FROM sync_log ORDER BY started_at DESC LIMIT 5',
          ).all();
          const warnings = db.prepare(
            'SELECT account_id, account_name, error_code, message, first_seen, last_seen, occurrence_count FROM sync_warnings ORDER BY last_seen DESC',
          ).all();
          return jsonResult({ syncLog, warnings });
        } catch (error) {
          return errorResult(error);
        }
      },
    ),

    tool(
      'get_transfer_suggestions',
      'List pending (unconfirmed) transfer suggestions between accounts. Use for "are there any transfers to review?" questions. Amounts in cents.',
      {},
      async () => {
        try {
          const pairs = listTransferCandidates(db);
          const wrapped = pairs.map(p => ({
            ...p,
            transactionA: {
              ...p.transactionA,
              payee: xmlWrap('merchant', p.transactionA.payee),
            },
            transactionB: {
              ...p.transactionB,
              payee: xmlWrap('merchant', p.transactionB.payee),
            },
          }));
          return jsonResult(wrapped);
        } catch (error) {
          return errorResult(error);
        }
      },
    ),
  ];
}
