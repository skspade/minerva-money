import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { getBudgetSummary, getAvailableToBudget } from '../../budget/budget-service.js';
import { getSpendingByCategory, getSpendingOverTime, getNetWorth } from '../../reports/reports-service.js';

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

function errorResult(error: unknown) {
  const msg = error instanceof Error ? error.message : 'Unknown error';
  return { isError: true as const, content: [{ type: 'text' as const, text: `Error: ${msg}` }] };
}

export function createQueryTools(db: Database.Database) {
  return [
    tool(
      'get_account_balances',
      'List all accounts with current balances. Use to answer questions about account balances. Amounts in cents (integer). Account types: checking, savings, credit, investment.',
      {},
      async () => {
        try {
          const rows = db.prepare(
            'SELECT id, name, institution, type, balance, available_balance FROM accounts ORDER BY institution, name',
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
  ];
}
