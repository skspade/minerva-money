import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type Database from 'better-sqlite3';
import type { Context } from '../sync/trpc.js';
import { createMcpServer } from './mcp-server.js';
import { getSystemPrompt } from './system-prompt.js';

export interface ChatResult {
  response: string;
  sessionId: string;
}

export async function chat(
  db: Database.Database,
  ctx: Context,
  message: string,
  sessionId?: string,
): Promise<ChatResult> {
  const mcpServer = createMcpServer(db, ctx);
  const systemPrompt = getSystemPrompt();

  const options: Record<string, unknown> = {
    model: 'claude-sonnet-4-20250514',
    systemPrompt,
    mcpServers: { minerva: mcpServer },
    allowedTools: ['mcp__minerva__*'],
    tools: [],
    maxTurns: 10,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
  };

  if (sessionId) {
    options.resume = sessionId;
  }

  let resultSessionId = sessionId || '';
  let resultText = '';

  try {
    const timeoutMs = 30_000;
    const result = await Promise.race([
      collectResponse(query({ prompt: message, options })),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Agent query timed out after 30 seconds')), timeoutMs),
      ),
    ]);

    resultSessionId = result.sessionId || resultSessionId;
    resultText = result.text;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return {
      response: `I encountered an error processing your request: ${errMsg}. Please try again.`,
      sessionId: resultSessionId,
    };
  }

  return {
    response: resultText || 'I was unable to generate a response. Please try again.',
    sessionId: resultSessionId,
  };
}

async function collectResponse(
  queryStream: AsyncIterable<SDKMessage>,
): Promise<{ text: string; sessionId: string }> {
  let sessionId = '';
  let text = '';

  for await (const msg of queryStream) {
    if (msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init') {
      sessionId = (msg as { session_id: string }).session_id;
    }

    if (msg.type === 'result' && 'subtype' in msg && msg.subtype === 'success') {
      text = (msg as { result: string }).result;
    }
  }

  return { text, sessionId };
}
