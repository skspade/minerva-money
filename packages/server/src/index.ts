import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import * as trpcExpress from '@trpc/server/adapters/express';
import { createDatabase } from './db/connection.js';
import { appRouter } from './sync/trpc-router.js';
import { getSimpleFINClient } from './sync/simplefin-client.js';
import { createRateLimiter } from './sync/rate-limiter.js';
import { startSyncScheduler, stopSyncScheduler } from './sync/sync-scheduler.js';
import { startBudgetScheduler, stopBudgetScheduler } from './budget/budget-scheduler.js';
import type { Context } from './sync/trpc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3001;

app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (process.env.NODE_ENV !== 'test') {
  const db = createDatabase();
  const rateLimiter = createRateLimiter();
  const client = getSimpleFINClient();

  app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext: (): Context => ({ db, rateLimiter, client }),
    }),
  );

  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  startSyncScheduler(db);
  startBudgetScheduler(db);

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  process.on('SIGTERM', () => {
    stopSyncScheduler();
    stopBudgetScheduler();
    const forceExit = setTimeout(() => process.exit(0), 5000);
    forceExit.unref();
    server.close(() => process.exit(0));
  });
}

export { app };
export type { AppRouter } from './sync/trpc-router.js';
