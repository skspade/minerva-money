import { z } from 'zod';
import type { Request, Response, RequestHandler } from 'express';
import type Database from 'better-sqlite3';
import type { Context } from '../sync/trpc.js';
import type { ChatJobManager } from './chat-job-manager.js';
import { isValidModelId, MODELS, DEFAULT_MODEL_ID } from './models.js';
import {
  createConversation,
  getConversation,
  appendMessage,
} from '../chat-history/chat-history-service.js';

const chatStreamSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().uuid().optional(),
  model: z.string().optional(),
});

export function createChatStreamHandler(
  db: Database.Database,
  ctx: Context,
  jobManager: ChatJobManager,
): RequestHandler {
  return async (req: Request, res: Response) => {
    const parseResult = chatStreamSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.message });
      return;
    }

    const { message, conversationId: requestConversationId, model } = parseResult.data;

    if (model && !isValidModelId(model)) {
      res.status(400).json({
        error: `Invalid model: ${model}. Valid models: ${MODELS.map(m => m.id).join(', ')}`,
      });
      return;
    }

    const active = jobManager.hasActiveJob();
    if (active && active.conversationId !== requestConversationId) {
      res.status(409).json({
        error: 'Another chat job is already running',
        activeConversationId: active.conversationId,
      });
      return;
    }

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

    appendMessage(db, { conversationId, role: 'user', content: message });

    try {
      jobManager.startJob({
        db,
        ctx,
        conversationId,
        message,
        sdkSessionId,
        model: model as Parameters<ChatJobManager['startJob']>[0]['model'],
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to start chat job';
      res.status(409).json({ error: errMsg });
      return;
    }

    res.json({ conversationId });
  };
}
