import { router, publicProcedure } from './trpc.js';
import { runSync } from './sync-service.js';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
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

const syncRouter = router({
  trigger: publicProcedure.mutation(async ({ ctx }) => {
    // Check rate limit for all known accounts before proceeding
    const accounts = ctx.db.prepare('SELECT id, name FROM accounts').all() as { id: string; name: string }[];

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
      'SELECT id, name, balance, last_synced FROM accounts',
    ).all() as {
      id: string;
      name: string;
      balance: number;
      last_synced: string | null;
    }[];

    return {
      lastSync: lastSync ? {
        startedAt: lastSync.started_at,
        completedAt: lastSync.completed_at,
        status: lastSync.status,
        errorMessage: lastSync.error_message,
        accountsSynced: lastSync.accounts_synced,
        transactionsAdded: lastSync.transactions_added,
      } : null,
      errorCount,
      accounts,
    };
  }),
});

const accountsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    const accounts = ctx.db.prepare(
      'SELECT id, name, institution, type, balance, last_synced FROM accounts ORDER BY type ASC, name ASC',
    ).all() as {
      id: string; name: string; institution: string; type: string;
      balance: number; last_synced: string | null;
    }[];

    return accounts.map(a => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      type: a.type,
      balance: a.balance,
      lastSynced: a.last_synced,
    }));
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
        a.name AS account_name, t.category_id,
        c.name AS category_name, cg.name AS group_name,
        (SELECT COUNT(*) FROM transaction_splits ts WHERE ts.transaction_id = t.id) AS split_count
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN category_groups cg ON c.group_id = cg.id
      ORDER BY t.date DESC, t.created_at DESC
    `).all() as {
      id: string; date: string; payee: string; memo: string | null;
      amount: number; account_id: string; account_name: string;
      category_id: number | null; category_name: string | null;
      group_name: string | null; split_count: number;
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
      splitCount: r.split_count,
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

export const appRouter = router({
  sync: syncRouter,
  accounts: accountsRouter,
  transactions: transactionsRouter,
  categories: categoriesRouter,
});

export type AppRouter = typeof appRouter;
