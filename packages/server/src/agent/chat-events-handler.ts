import type { Request, Response, RequestHandler } from 'express';
import type { ChatJobManager } from './chat-job-manager.js';

export function createChatEventsHandler(jobManager: ChatJobManager): RequestHandler {
  return (req: Request, res: Response) => {
    const { conversationId } = req.params;
    const job = jobManager.getJob(conversationId);

    if (!job) {
      res.status(404).json({ error: 'No active job for this conversation' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    for (const event of job.events) {
      if (res.destroyed) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    if (job.done) {
      if (!res.destroyed) res.end();
      return;
    }

    const unsubscribe = jobManager.subscribe(conversationId, (event) => {
      if (res.destroyed) {
        unsubscribe?.();
        return;
      }
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'done' || event.type === 'error') {
        unsubscribe?.();
        if (!res.destroyed) res.end();
      }
    });

    res.on('close', () => {
      unsubscribe?.();
    });
  };
}

export function createActiveJobHandler(jobManager: ChatJobManager): RequestHandler {
  return (_req: Request, res: Response) => {
    res.json(jobManager.hasActiveJob());
  };
}
