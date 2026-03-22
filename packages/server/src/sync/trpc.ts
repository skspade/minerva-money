import { initTRPC } from '@trpc/server';
import type Database from 'better-sqlite3';
import type { SimpleFINClient } from './simplefin-types.js';
import type { RateLimiter } from './rate-limiter.js';

export interface Context {
  db: Database.Database;
  rateLimiter: RateLimiter;
  client: SimpleFINClient;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
