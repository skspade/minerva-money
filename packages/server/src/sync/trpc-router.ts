import { router, publicProcedure } from './trpc.js';
import { agentRouter } from '../agent/agent-router.js';
import { importRouter } from '../import/import-router.js';
import { chatHistoryRouter } from '../chat-history/chat-history-router.js';
import { runSync } from './sync-service.js';
import { createAccount, updateAccount, deleteAccount } from '../accounts/accounts-service.js';
import { resolveBackupDir } from '../backup/backup.js';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import {
  listGroupsWithCategories,
  createGroup,
  renameGroup,
  reorderGroups,
  deleteGroup,
  createCategory,
  renameCategory,
  reorderCategories,
  deleteCategory,
  updateTransactionCategory,
  createSplits,
  deleteSplits,
  createManualTransaction,
} from '../categories/category-service.js';
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  previewRule,
  applyRule,
} from '../rules/rules-service.js';
import {
  listTransferCandidates,
  listConfirmedTransfers,
  confirmTransfer,
  dismissTransfer,
  unlinkTransfer,
  manuallyLinkTransfer,
} from '../transfers/transfer-service.js';
import {
  setDefaultAllocation,
  getDefaults,
  deleteDefault,
  setAllocation,
  getBudgetSummary,
  getAvailableToBudget,
} from '../budget/budget-service.js';
import {
  getSpendingByCategory,
  getSpendingOverTime,
  getDailySpending,
  getNetWorth,
  type SpendingByCategory,
  type SpendingOverTime,
  type DailySpending,
  type NetWorthPoint,
} from '../reports/reports-service.js';

export type { SpendingByCategory, SpendingOverTime, DailySpending, NetWorthPoint };

const syncRouter = router({
  trigger: publicProcedure.mutation(async ({ ctx }) => {
    // Check rate limit for all known accounts before proceeding
    const accounts = ctx.db.prepare("SELECT id, name FROM accounts WHERE source = 'simplefin'").all() as { id: string; name: string }[];

    if (accounts.length > 0) {
      const blocked = accounts.filter(a => !ctx.rateLimiter.canManualSync(a.id));
      if (blocked.length > 0) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Rate limit: insufficient quota for accounts: ${blocked.map(a => a.name).join(', ')}`,
        });
      }
    }

    const result = await runSync(ctx.db, ctx.client, ctx.rateLimiter);
    return result;
  }),

  status: publicProcedure.query(({ ctx }) => {
    const lastSync = ctx.db.prepare(
      'SELECT * FROM sync_log ORDER BY id DESC LIMIT 1',
    ).get() as {
      id: number;
      started_at: string;
      completed_at: string | null;
      status: string;
      error_message: string | null;
      accounts_synced: number;
      transactions_added: number;
    } | undefined;

    const errorCount = (ctx.db.prepare(
      "SELECT COUNT(*) as count FROM sync_log WHERE status = 'error'",
    ).get() as { count: number }).count;

    const accounts = ctx.db.prepare(
      'SELECT id, name, balance, last_synced, source FROM accounts',
    ).all() as {
      id: string;
      name: string;
      balance: number;
      last_synced: string | null;
      source: string;
    }[];

    const warnings = ctx.db.prepare(
      'SELECT account_id, account_name, error_code, message, last_seen FROM sync_warnings ORDER BY last_seen DESC',
    ).all() as {
      account_id: string;
      account_name: string;
      error_code: string;
      message: string;
      last_seen: string;
    }[];

    let lastSuccessAt: string | null = null;
    if (lastSync && lastSync.status !== 'success') {
      const row = ctx.db.prepare(
        "SELECT completed_at FROM sync_log WHERE status = 'success' ORDER BY id DESC LIMIT 1",
      ).get() as { completed_at: string } | undefined;
      lastSuccessAt = row?.completed_at ?? null;
    }

    return {
      lastSync: lastSync ? {
        startedAt: lastSync.started_at,
        completedAt: lastSync.completed_at,
        status: lastSync.status,
        errorMessage: lastSync.error_message,
        accountsSynced: lastSync.accounts_synced,
        transactionsAdded: lastSync.transactions_added,
      } : null,
      lastSuccessAt,
      errorCount,
      accounts,
      warnings: warnings.map(w => ({
        accountId: w.account_id,
        accountName: w.account_name,
        errorCode: w.error_code,
        message: w.message,
        lastSeen: w.last_seen,
      })),
    };
  }),
});

const backupRouter = router({
  status: publicProcedure.query(() => {
    const { dir, isCloud } = resolveBackupDir();

    if (!fs.existsSync(dir)) {
      return { lastBackup: null };
    }

    const files = fs.readdirSync(dir)
      .filter(f => f.startsWith('minerva_') && f.endsWith('.db') && f !== 'minerva_latest.db')
      .sort()
      .reverse();

    if (files.length === 0) {
      return { lastBackup: null };
    }

    const latest = files[0];
    const filePath = path.join(dir, latest);
    const stat = fs.statSync(filePath);

    return {
      lastBackup: {
        filename: latest,
        timestamp: stat.mtime.toISOString(),
        sizeBytes: stat.size,
        isCloud,
      },
    };
  }),
});

const accountsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    const accounts = ctx.db.prepare(
      'SELECT id, name, institution, type, balance, last_synced, source FROM accounts ORDER BY type ASC, name ASC',
    ).all() as {
      id: string; name: string; institution: string; type: string;
      balance: number; last_synced: string | null; source: string;
    }[];

    return accounts.map(a => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      type: a.type,
      balance: a.balance,
      lastSynced: a.last_synced,
      source: a.source,
    }));
  }),

  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      institution: z.string().min(1),
      type: z.enum(['banking', 'credit']).default('banking'),
    }))
    .mutation(({ ctx, input }) => {
      return createAccount(ctx.db, input);
    }),

  update: publicProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      institution: z.string().min(1).optional(),
      type: z.enum(['banking', 'credit']).optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...fields } = input;
      return updateAccount(ctx.db, id, fields);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      deleteAccount(ctx.db, input.id);
    }),
});

const categoriesGroupsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    return listGroupsWithCategories(ctx.db);
  }),

  create: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return createGroup(ctx.db, input.name);
    }),

  rename: publicProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      renameGroup(ctx.db, input.id, input.name);
    }),

  reorder: publicProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(({ ctx, input }) => {
      reorderGroups(ctx.db, input.ids);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => {
      deleteGroup(ctx.db, input.id);
    }),
});

const categoriesRouter = router({
  groups: categoriesGroupsRouter,

  create: publicProcedure
    .input(z.object({ groupId: z.number(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return createCategory(ctx.db, input.groupId, input.name);
    }),

  rename: publicProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      renameCategory(ctx.db, input.id, input.name);
    }),

  reorder: publicProcedure
    .input(z.object({ groupId: z.number(), ids: z.array(z.number()) }))
    .mutation(({ ctx, input }) => {
      reorderCategories(ctx.db, input.groupId, input.ids);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => {
      deleteCategory(ctx.db, input.id);
    }),
});

const transactionsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.prepare(`
      SELECT t.id, t.date, t.payee, t.memo, t.amount, t.account_id,
        a.name AS account_name, t.category_id, t.rule_id,
        c.name AS category_name, cg.name AS group_name,
        cr.name AS rule_name,
        (SELECT COUNT(*) FROM transaction_splits ts WHERE ts.transaction_id = t.id) AS split_count,
        CASE WHEN EXISTS (
          SELECT 1 FROM transfer_links tl
          WHERE (tl.transaction_a_id = t.id OR tl.transaction_b_id = t.id)
          AND tl.confirmed = 1
        ) THEN 1 ELSE 0 END AS is_transfer
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN category_groups cg ON c.group_id = cg.id
      LEFT JOIN categorization_rules cr ON t.rule_id = cr.id
      ORDER BY t.date DESC, t.created_at DESC
    `).all() as {
      id: string; date: string; payee: string; memo: string | null;
      amount: number; account_id: string; account_name: string;
      category_id: number | null; category_name: string | null;
      group_name: string | null; rule_id: number | null;
      rule_name: string | null; split_count: number;
      is_transfer: number;
    }[];

    return rows.map(r => ({
      id: r.id,
      date: r.date,
      payee: r.payee,
      memo: r.memo,
      amount: r.amount,
      accountId: r.account_id,
      accountName: r.account_name,
      categoryId: r.category_id,
      categoryName: r.category_name,
      groupName: r.group_name,
      ruleId: r.rule_id,
      ruleName: r.rule_name,
      splitCount: r.split_count,
      isTransfer: r.is_transfer === 1,
    }));
  }),

  updateCategory: publicProcedure
    .input(z.object({ transactionId: z.string(), categoryId: z.number().nullable() }))
    .mutation(({ ctx, input }) => {
      updateTransactionCategory(ctx.db, input.transactionId, input.categoryId);
    }),

  createSplits: publicProcedure
    .input(z.object({
      transactionId: z.string(),
      splits: z.array(z.object({ categoryId: z.number(), amount: z.number() })),
    }))
    .mutation(({ ctx, input }) => {
      createSplits(ctx.db, input.transactionId, input.splits);
    }),

  deleteSplits: publicProcedure
    .input(z.object({ transactionId: z.string() }))
    .mutation(({ ctx, input }) => {
      deleteSplits(ctx.db, input.transactionId);
    }),

  create: publicProcedure
    .input(z.object({
      accountId: z.string(),
      date: z.string(),
      amount: z.number(),
      payee: z.string().min(1),
      memo: z.string().optional(),
      categoryId: z.number().optional(),
    }))
    .mutation(({ ctx, input }) => {
      return createManualTransaction(ctx.db, input);
    }),
});

const rulesRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    return listRules(ctx.db);
  }),

  create: publicProcedure
    .input(z.object({
      name: z.string().min(1),
      merchantPattern: z.string().nullable(),
      matchType: z.enum(['exact', 'contains']).default('contains'),
      amountMin: z.number().nullable(),
      amountMax: z.number().nullable(),
      memoPattern: z.string().nullable(),
      categoryId: z.number(),
    }))
    .mutation(({ ctx, input }) => {
      return createRule(ctx.db, input);
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1),
      merchantPattern: z.string().nullable(),
      matchType: z.enum(['exact', 'contains']).default('contains'),
      amountMin: z.number().nullable(),
      amountMax: z.number().nullable(),
      memoPattern: z.string().nullable(),
      categoryId: z.number(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      updateRule(ctx.db, id, data);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => {
      deleteRule(ctx.db, input.id);
    }),

  preview: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => {
      return previewRule(ctx.db, input.id);
    }),

  applyRetroactive: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => {
      return { updatedCount: applyRule(ctx.db, input.id) };
    }),
});

const transferCandidatesRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    return listTransferCandidates(ctx.db);
  }),
});

const transferConfirmedRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    return listConfirmedTransfers(ctx.db);
  }),
});

const transfersRouter = router({
  candidates: transferCandidatesRouter,
  confirmed: transferConfirmedRouter,

  confirm: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => {
      confirmTransfer(ctx.db, input.id);
    }),

  dismiss: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => {
      dismissTransfer(ctx.db, input.id);
    }),

  unlink: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => {
      unlinkTransfer(ctx.db, input.id);
    }),

  manualLink: publicProcedure
    .input(z.object({ transactionAId: z.string(), transactionBId: z.string() }))
    .mutation(({ ctx, input }) => {
      return manuallyLinkTransfer(ctx.db, input.transactionAId, input.transactionBId);
    }),
});

const budgetDefaultsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    return getDefaults(ctx.db);
  }),

  set: publicProcedure
    .input(z.object({ categoryId: z.number(), amount: z.number() }))
    .mutation(({ ctx, input }) => {
      setDefaultAllocation(ctx.db, input.categoryId, input.amount);
    }),

  delete: publicProcedure
    .input(z.object({ categoryId: z.number() }))
    .mutation(({ ctx, input }) => {
      deleteDefault(ctx.db, input.categoryId);
    }),
});

const budgetAllocationsRouter = router({
  byMonth: publicProcedure
    .input(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(({ ctx, input }) => {
      const rows = ctx.db.prepare(`
        SELECT category_id, amount FROM budget_allocations
        WHERE period = ? AND is_default = 0
      `).all(input.period) as { category_id: number; amount: number }[];
      return rows.map(r => ({ categoryId: r.category_id, amount: r.amount }));
    }),

  set: publicProcedure
    .input(z.object({
      categoryId: z.number(),
      period: z.string().regex(/^\d{4}-\d{2}$/),
      amount: z.number(),
    }))
    .mutation(({ ctx, input }) => {
      setAllocation(ctx.db, input.categoryId, input.period, input.amount);
    }),
});

const budgetRouter = router({
  defaults: budgetDefaultsRouter,
  allocations: budgetAllocationsRouter,
  summary: publicProcedure
    .input(z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(({ ctx, input }) => {
      return {
        categories: getBudgetSummary(ctx.db, input.period),
        availableToBudget: getAvailableToBudget(ctx.db, input.period),
      };
    }),
});

const reportsRouter = router({
  spendingByCategory: publicProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(({ ctx, input }) => {
      return getSpendingByCategory(ctx.db, input.startDate, input.endDate);
    }),

  spendingOverTime: publicProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(({ ctx, input }) => {
      return getSpendingOverTime(ctx.db, input.startDate, input.endDate);
    }),

  netWorth: publicProcedure
    .input(z.object({ startDate: z.string().optional(), endDate: z.string().optional() }))
    .query(({ ctx, input }) => {
      return getNetWorth(ctx.db, input.startDate, input.endDate);
    }),

  dailySpending: publicProcedure
    .input(z.object({ startDate: z.string(), endDate: z.string() }))
    .query(({ ctx, input }) => {
      return getDailySpending(ctx.db, input.startDate, input.endDate);
    }),
});

export const appRouter = router({
  sync: syncRouter,
  backup: backupRouter,
  accounts: accountsRouter,
  transactions: transactionsRouter,
  categories: categoriesRouter,
  rules: rulesRouter,
  transfers: transfersRouter,
  budget: budgetRouter,
  reports: reportsRouter,
  agent: agentRouter,
  import: importRouter,
  chatHistory: chatHistoryRouter,
});

export type AppRouter = typeof appRouter;
