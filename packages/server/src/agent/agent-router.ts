import { z } from 'zod';
import { publicProcedure, router } from '../sync/trpc.js';
import { chat } from './agent-service.js';

export const agentRouter = router({
  chat: publicProcedure
    .input(z.object({
      message: z.string(),
      sessionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return chat(ctx.db, ctx, input.message, input.sessionId);
    }),
});
