import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type Database from 'better-sqlite3';
import { createQueryTools } from './tools/query-tools.js';

export function createMcpServer(db: Database.Database) {
  return createSdkMcpServer({
    name: 'minerva',
    version: '1.0.0',
    tools: [...createQueryTools(db)],
  });
}
