import { router, publicProcedure } from './trpc.js';
import { runSync } from './sync-service.js';
import { TRPCError } from '@trpc/server';

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

const transactionsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    const rows = ctx.db.prepare(`
      SELECT t.id, t.date, t.payee, t.memo, t.amount, t.account_id, a.name as account_name, t.category_id
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      ORDER BY t.date DESC, t.created_at DESC
    `).all() as {
      id: string; date: string; payee: string; memo: string | null;
      amount: number; account_id: string; account_name: string; category_id: string | null;
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
    }));
  }),
});

export const appRouter = router({
  sync: syncRouter,
  accounts: accountsRouter,
  transactions: transactionsRouter,
});

export type AppRouter = typeof appRouter;
