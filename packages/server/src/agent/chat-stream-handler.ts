import { z } from 'zod';
import type { Request, Response, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import type { Context } from '../sync/trpc.js';
import { chatStream } from './agent-service.js';
import { isValidModelId, MODELS, type ModelId } from './models.js';

const chatStreamSchema = z.object({
  message: z.string().min(1),
  sessionId: z.string().optional(),
  model: z.string().optional(),
});

/**
 * Creates an Express request handler for POST /api/chat/stream.
 *
 * Validates JSON input with Zod, returns 400 JSON errors before SSE headers,
 * then streams SSE events from the chatStream async generator.
 */
export function createChatStreamHandler(db: Database.Database, ctx: Context): RequestHandler {
  return async (req: Request, res: Response) => {
    // Validate input with Zod
    const parseResult = chatStreamSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.message });
      return;
    }

    const { message, sessionId, model } = parseResult.data;

    // Validate model if provided
    if (model && !isValidModelId(model)) {
      res.status(400).json({
        error: `Invalid model: ${model}. Valid models: ${MODELS.map(m => m.id).join(', ')}`,
      });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Set up abort handling for client disconnect
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    try {
      const stream = chatStream(db, ctx, message, abortController.signal, sessionId, model as ModelId | undefined);

      for await (const event of stream) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      // Defense-in-depth: chatStream should never throw, but handle it safely
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      res.write(`data: ${JSON.stringify({ type: 'error', message: errMsg })}\n\n`);
    }

    res.end();
  };
}
