// Defend against unhandled rejections from the Claude Agent SDK's control
// plane. When a chat client disconnects mid-stream, the SDK's
// `handleControlRequest` can throw `ProcessTransport is not ready for
// writing` from a fire-and-forget async handler — which in Node 22+ would
// otherwise kill the entire server process. The server is a long-running
// single-user service; we log the error and keep running.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : reason);
});

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
import { startChatCleanupScheduler, stopChatCleanupScheduler } from './chat-history/chat-cleanup-scheduler.js';
import type { Context } from './sync/trpc.js';
import { createChatStreamHandler } from './agent/chat-stream-handler.js';

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

  const ctx: Context = { db, rateLimiter, client };

  app.post('/api/chat/stream', createChatStreamHandler(db, ctx));

  app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({
      router: appRouter,
      createContext: (): Context => ctx,
    }),
  );

  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  startSyncScheduler(db);
  startBudgetScheduler(db);
  startChatCleanupScheduler(db);

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  process.on('SIGTERM', () => {
    stopSyncScheduler();
    stopBudgetScheduler();
    stopChatCleanupScheduler();
    const forceExit = setTimeout(() => process.exit(0), 5000);
    forceExit.unref();
    server.close(() => process.exit(0));
  });
}

export { app };
export type { AppRouter } from './sync/trpc-router.js';
