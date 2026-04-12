import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type Database from 'better-sqlite3';
import type { SSEEvent } from '@minerva/shared';
import type { Context } from '../sync/trpc.js';
import { getConversation } from '../chat-history/chat-history-service.js';
import { createMcpServer } from './mcp-server.js';
import { getSystemPrompt } from './system-prompt.js';
import { DEFAULT_MODEL_ID, TIMEOUT_MS, type ModelId } from './models.js';

/**
 * Shared state object between the chatStream generator and its caller (the handler).
 * The generator populates these fields during iteration; the handler reads them after.
 */
export interface StreamState {
  sessionId: string;
  fullText: string;
  toolCalls: Array<{ tool: string; result?: unknown }>;
  conversationId?: string;
}

export interface ChatResult {
  response: string;
  sessionId: string;
  conversationId?: string;
}

export async function chat(
  db: Database.Database,
  ctx: Context,
  message: string,
  sessionId?: string,
  model: ModelId = DEFAULT_MODEL_ID,
  conversationId?: string,
): Promise<ChatResult> {
  const mcpServer = createMcpServer(db, ctx);
  const systemPrompt = getSystemPrompt();

  const options: Record<string, unknown> = {
    model,
    systemPrompt,
    mcpServers: { minerva: mcpServer },
    allowedTools: ['mcp__minerva__*', 'WebSearch'],
    tools: ['WebSearch'],
    maxTurns: 15,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    // Isolate the spawned `claude` CLI subprocess from the operator's
    // ~/.claude config. By default the CLI inherits user-level MCP servers
    // (Linear, Gmail, Calendar, etc.), which is undesirable for a headless
    // production service. `settingSources: []` prevents loading any
    // filesystem settings (user/project/local), and `strictMcpConfig`
    // additionally restricts MCP servers to only those in our explicit
    // mcpServers config.
    settingSources: [],
    strictMcpConfig: true,
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
      conversationId,
    };
  }

  return {
    response: resultText || 'I was unable to generate a response. Please try again.',
    sessionId: resultSessionId,
    conversationId,
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
 * Build a fallback prompt that includes recent conversation history when
 * SDK session resume fails and we need to start a new session.
 * Limits to last 20 messages and truncates individual messages at 500 chars.
 */
export function buildFallbackPrompt(
  messages: Array<{ role: string; content: string }>,
  userMessage: string,
): string {
  const recent = messages.slice(-20);
  if (recent.length === 0) return userMessage;

  const contextLines = recent.map(m => {
    const truncated = m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content;
    return `${m.role === 'user' ? 'User' : 'Assistant'}: ${truncated}`;
  });
  return `[Previous conversation context - last ${recent.length} messages]\n${contextLines.join('\n')}\n[End of context]\n\n${userMessage}`;
}

/**
 * Stream chat responses as a sequence of typed SSE events.
 *
 * Iterates the Agent SDK Query with `includePartialMessages: true`,
 * yielding SSEEvent objects for session init, text deltas, tool calls,
 * completion, and errors. Handles abort signals and idle timeouts.
 *
 * Uses a shared StreamState object so the caller can read accumulated
 * sessionId, fullText, and toolCalls after the generator completes.
 *
 * When state.sessionId is set on entry (resume case), passes it as
 * options.resume to the SDK. If resume fails, gracefully falls back
 * to a new session and injects conversation context if available.
 */
export async function* chatStream(
  db: Database.Database,
  ctx: Context,
  message: string,
  signal: AbortSignal,
  state: StreamState = { sessionId: '', fullText: '', toolCalls: [] },
  model: ModelId = DEFAULT_MODEL_ID,
): AsyncGenerator<SSEEvent> {
  const mcpServer = createMcpServer(db, ctx);
  const systemPrompt = getSystemPrompt();

  const options: Record<string, unknown> = {
    model,
    systemPrompt,
    mcpServers: { minerva: mcpServer },
    allowedTools: ['mcp__minerva__*', 'WebSearch'],
    tools: ['WebSearch'],
    maxTurns: 15,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
    // Isolate from operator's ~/.claude config — prevent inherited MCP servers.
    settingSources: [],
    strictMcpConfig: true,
  };

  let queryStream: AsyncIterable<SDKMessage> & { close(): void };

  // Attempt resume if session ID is set; fall back to new session on failure
  if (state.sessionId) {
    try {
      queryStream = query({ prompt: message, options: { ...options, resume: state.sessionId } }) as AsyncIterable<SDKMessage> & { close(): void };
    } catch (error) {
      console.warn('SDK resume failed, falling back to new session:', error instanceof Error ? error.message : error);
      state.sessionId = '';

      // Inject conversation context on fallback
      let fallbackMessage = message;
      if (state.conversationId) {
        try {
          const conv = getConversation(db, state.conversationId);
          if (conv?.messages?.length) {
            fallbackMessage = buildFallbackPrompt(conv.messages, message);
          }
        } catch (err) {
          console.warn('Failed to load conversation context for fallback prompt:', err);
        }
      }

      queryStream = query({ prompt: fallbackMessage, options }) as AsyncIterable<SDKMessage> & { close(): void };
    }
  } else {
    queryStream = query({ prompt: message, options }) as AsyncIterable<SDKMessage> & { close(): void };
  }

  // Track state
  const activeTools = new Set<string>();
  let idleTimedOut = false;

  // Set up idle timeout
  const timeoutMs = TIMEOUT_MS[model];
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  let streamClosed = false;
  const closeStream = () => {
    if (!streamClosed) {
      streamClosed = true;
      queryStream.close();
    }
  };

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimedOut = true;
      closeStream();
    }, timeoutMs);
  };

  // Set up abort handler
  const onAbort = () => closeStream();
  signal.addEventListener('abort', onAbort);

  try {
    resetIdleTimer();

    for await (const msg of queryStream) {
      if (signal.aborted) break;

      resetIdleTimer();

      // Session init
      if (msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init') {
        state.sessionId = (msg as { session_id: string }).session_id;
        yield { type: 'session', sessionId: state.sessionId };
        continue;
      }

      // Stream events (text deltas and tool starts)
      if (msg.type === 'stream_event') {
        const event = (msg as unknown as { event: Record<string, unknown> }).event;

        // Text delta
        if (event.type === 'content_block_delta') {
          const delta = event.delta as { type: string; text?: string } | undefined;
          if (delta && delta.type === 'text_delta' && delta.text) {
            state.fullText += delta.text;
            yield { type: 'text-delta', text: delta.text };
          }
        }

        // Tool start
        if (event.type === 'content_block_start') {
          const contentBlock = event.content_block as { type: string; name?: string } | undefined;
          if (contentBlock && contentBlock.type === 'tool_use' && contentBlock.name) {
            if (!activeTools.has(contentBlock.name)) {
              activeTools.add(contentBlock.name);
              state.toolCalls.push({ tool: contentBlock.name });
              yield { type: 'tool-start', tool: contentBlock.name };
            }
          }
          if (contentBlock && contentBlock.type === 'thinking') {
            yield { type: 'thinking' };
          }
        }

        continue;
      }

      // Tool end (user message with tool result)
      if (msg.type === 'user' && 'tool_use_result' in msg && msg.tool_use_result !== undefined) {
        // Update tool call results
        for (const toolName of activeTools) {
          const toolCall = state.toolCalls.find(tc => tc.tool === toolName && tc.result === undefined);
          if (toolCall) {
            toolCall.result = (msg as { tool_use_result: unknown }).tool_use_result;
          }
          yield { type: 'tool-end', tool: toolName };
        }
        activeTools.clear();
        yield { type: 'thinking' };
        continue;
      }

      // Result success
      if (msg.type === 'result' && 'subtype' in msg && msg.subtype === 'success') {
        yield { type: 'done', text: state.fullText || (msg as { result: string }).result };
        continue;
      }

      // Result error
      if (msg.type === 'result' && 'subtype' in msg && (msg.subtype as string).startsWith('error')) {
        const errors = (msg as { errors?: string[] }).errors;
        yield {
          type: 'error',
          message: errors?.join('; ') || 'Agent error',
          partialText: state.fullText || undefined,
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
        partialText: state.fullText || undefined,
      };
    }
  } catch (error) {
    // Yield error event for unexpected exceptions — never re-throw
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    yield {
      type: 'error',
      message: errMsg,
      partialText: state.fullText || undefined,
    };
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    signal.removeEventListener('abort', onAbort);
  }
}
