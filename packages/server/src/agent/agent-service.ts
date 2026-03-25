import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type Database from 'better-sqlite3';
import type { SSEEvent } from '@minerva/shared';
import type { Context } from '../sync/trpc.js';
import { createMcpServer } from './mcp-server.js';
import { getSystemPrompt } from './system-prompt.js';
import { DEFAULT_MODEL_ID, TIMEOUT_MS, type ModelId } from './models.js';

export interface ChatResult {
  response: string;
  sessionId: string;
}

export async function chat(
  db: Database.Database,
  ctx: Context,
  message: string,
  sessionId?: string,
  model: ModelId = DEFAULT_MODEL_ID,
): Promise<ChatResult> {
  const mcpServer = createMcpServer(db, ctx);
  const systemPrompt = getSystemPrompt();

  const options: Record<string, unknown> = {
    model,
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
    const timeoutMs = TIMEOUT_MS[model];
    const result = await Promise.race([
      collectResponse(query({ prompt: message, options })),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Agent query timed out after ${timeoutMs / 1000} seconds (model: ${model})`)), timeoutMs),
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

/**
 * Stream chat responses as a sequence of typed SSE events.
 *
 * Iterates the Agent SDK Query with `includePartialMessages: true`,
 * yielding SSEEvent objects for session init, text deltas, tool calls,
 * completion, and errors. Handles abort signals and idle timeouts.
 */
export async function* chatStream(
  db: Database.Database,
  ctx: Context,
  message: string,
  signal: AbortSignal,
  sessionId?: string,
  model: ModelId = DEFAULT_MODEL_ID,
): AsyncGenerator<SSEEvent> {
  const mcpServer = createMcpServer(db, ctx);
  const systemPrompt = getSystemPrompt();

  const options: Record<string, unknown> = {
    model,
    systemPrompt,
    mcpServers: { minerva: mcpServer },
    allowedTools: ['mcp__minerva__*'],
    tools: [],
    maxTurns: 10,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
  };

  if (sessionId) {
    options.resume = sessionId;
  }

  const queryStream = query({ prompt: message, options }) as AsyncIterable<SDKMessage> & { close(): void };

  // Track state
  let fullText = '';
  const activeTools = new Set<string>();
  let idleTimedOut = false;

  // Set up idle timeout
  const timeoutMs = TIMEOUT_MS[model];
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimedOut = true;
      queryStream.close();
    }, timeoutMs);
  };

  // Set up abort handler
  const onAbort = () => queryStream.close();
  signal.addEventListener('abort', onAbort);

  try {
    resetIdleTimer();

    for await (const msg of queryStream) {
      if (signal.aborted) break;

      resetIdleTimer();

      // Session init
      if (msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init') {
        yield { type: 'session', sessionId: (msg as { session_id: string }).session_id };
        continue;
      }

      // Stream events (text deltas and tool starts)
      if (msg.type === 'stream_event') {
        const event = (msg as { event: Record<string, unknown> }).event;

        // Text delta
        if (event.type === 'content_block_delta') {
          const delta = event.delta as { type: string; text?: string } | undefined;
          if (delta && delta.type === 'text_delta' && delta.text) {
            fullText += delta.text;
            yield { type: 'text-delta', text: delta.text };
          }
        }

        // Tool start
        if (event.type === 'content_block_start') {
          const contentBlock = event.content_block as { type: string; name?: string } | undefined;
          if (contentBlock && contentBlock.type === 'tool_use' && contentBlock.name) {
            if (!activeTools.has(contentBlock.name)) {
              activeTools.add(contentBlock.name);
              yield { type: 'tool-start', tool: contentBlock.name };
            }
          }
        }

        continue;
      }

      // Tool end (user message with tool result)
      if (msg.type === 'user' && 'tool_use_result' in msg && msg.tool_use_result !== undefined) {
        for (const toolName of activeTools) {
          yield { type: 'tool-end', tool: toolName };
        }
        activeTools.clear();
        continue;
      }

      // Result success
      if (msg.type === 'result' && 'subtype' in msg && msg.subtype === 'success') {
        yield { type: 'done', text: fullText || (msg as { result: string }).result };
        continue;
      }

      // Result error
      if (msg.type === 'result' && 'subtype' in msg && (msg.subtype as string).startsWith('error')) {
        const errors = (msg as { errors?: string[] }).errors;
        yield {
          type: 'error',
          message: errors?.join('; ') || 'Agent error',
          partialText: fullText || undefined,
        };
        continue;
      }

      // All other message types are ignored
    }

    // After loop: check if idle timeout caused the exit
    if (idleTimedOut) {
      yield {
        type: 'error',
        message: `Agent query idle timeout after ${timeoutMs / 1000} seconds (model: ${model})`,
        partialText: fullText || undefined,
      };
    }
  } catch (error) {
    // Yield error event for unexpected exceptions — never re-throw
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    yield {
      type: 'error',
      message: errMsg,
      partialText: fullText || undefined,
    };
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    signal.removeEventListener('abort', onAbort);
  }
}
