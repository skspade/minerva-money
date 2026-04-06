import { z } from 'zod';
import type { Request, Response, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import type { Context } from '../sync/trpc.js';
import { chatStream } from './agent-service.js';
import type { StreamState } from './agent-service.js';
import { isValidModelId, MODELS, DEFAULT_MODEL_ID, type ModelId } from './models.js';
import {
  createConversation,
  getConversation,
  appendMessage,
  updateSdkSessionId,
} from '../chat-history/chat-history-service.js';

const chatStreamSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().uuid().optional(),
  model: z.string().optional(),
});

/**
 * Creates an Express request handler for POST /api/chat/stream.
 *
 * Validates JSON input with Zod, creates or loads a conversation,
 * persists user and assistant messages, and streams SSE events
 * from the chatStream async generator.
 */
export function createChatStreamHandler(db: Database.Database, ctx: Context): RequestHandler {
  return async (req: Request, res: Response) => {
    // Validate input with Zod
    const parseResult = chatStreamSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.message });
      return;
    }

    const { message, conversationId: requestConversationId, model } = parseResult.data;

    // Validate model if provided
    if (model && !isValidModelId(model)) {
      res.status(400).json({
        error: `Invalid model: ${model}. Valid models: ${MODELS.map(m => m.id).join(', ')}`,
      });
      return;
    }

    // Create or load conversation (before SSE headers so we can return 400 on invalid ID)
    let conversationId: string;
    let sdkSessionId = '';

    if (requestConversationId) {
      const existing = getConversation(db, requestConversationId);
      if (!existing) {
        res.status(400).json({ error: `Conversation not found: ${requestConversationId}` });
        return;
      }
      conversationId = existing.id;
      sdkSessionId = existing.sdk_session_id || '';
    } else {
      const validModel = (model as string) || DEFAULT_MODEL_ID;
      const created = createConversation(db, { model: validModel, firstMessage: message });
      conversationId = created.id;
    }

    // Persist user message before stream
    appendMessage(db, { conversationId, role: 'user', content: message });

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Emit conversation event first
    res.write(`data: ${JSON.stringify({ type: 'conversation', conversationId })}\n\n`);

    // Set up abort handling for client disconnect.
    //
    // CRITICAL: we listen on `res.on('close')`, NOT `req.on('close')`. In
    // Node 16+, `req` (IncomingMessage) emits `close` as soon as the request
    // body has been fully consumed — which for a small POST JSON body
    // happens ~milliseconds after the handler starts, long before the
    // client has actually disconnected. Aborting on `req.close` was
    // causing the SDK's ProcessTransport to shut down mid-request, which
    // then crashed the server via an unhandled
    // `ProcessTransport is not ready for writing` rejection inside the
    // SDK's handleControlRequest. The `res` object, by contrast, only
    // closes when the underlying response stream is torn down — i.e., a
    // real client disconnect or our own `res.end()`.
    const abortController = new AbortController();
    res.on('close', () => abortController.abort());

    // Initialize StreamState
    const state: StreamState = {
      sessionId: sdkSessionId,
      fullText: '',
      toolCalls: [],
      conversationId,
    };

    try {
      const stream = chatStream(db, ctx, message, abortController.signal, state, model as ModelId | undefined);

      for await (const event of stream) {
        if (res.destroyed) break;
        if (event.type === 'done') {
          // Persist assistant message BEFORE emitting done
          try {
            const toolCallsForStorage = state.toolCalls.length > 0 ? state.toolCalls : undefined;
            appendMessage(db, {
              conversationId,
              role: 'assistant',
              content: state.fullText,
              toolCalls: toolCallsForStorage,
            });
          } catch (err) {
            console.warn('Failed to persist assistant message:', err);
          }

          // Update SDK session ID if changed
          if (state.sessionId && state.sessionId !== sdkSessionId) {
            try {
              updateSdkSessionId(db, conversationId, state.sessionId);
            } catch (err) {
              console.warn('Failed to update SDK session ID:', err);
            }
          }

          res.write(`data: ${JSON.stringify(event)}\n\n`);
          continue;
        }
        // On error events, do NOT persist the assistant message
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: errMsg })}\n\n`);
      }
    }

    if (!res.destroyed) {
      res.end();
    }
  };
}
