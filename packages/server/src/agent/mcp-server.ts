import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type Database from 'better-sqlite3';
import type { Context } from '../sync/trpc.js';
import { createQueryTools } from './tools/query-tools.js';
import { createActionTools } from './tools/action-tools.js';

export function createMcpServer(db: Database.Database, ctx: Context) {
  return createSdkMcpServer({
    name: 'minerva',
    version: '1.0.0',
    tools: [...createQueryTools(db), ...createActionTools(db, ctx)],
  });
}
