import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from '../sync/trpc.js';
import { chat } from './agent-service.js';
import { MODELS, isValidModelId, type ModelId } from './models.js';

export const agentRouter = router({
  models: publicProcedure.query(() => {
    return MODELS;
  }),

  chat: publicProcedure
    .input(z.object({
      message: z.string(),
      sessionId: z.string().optional(),
      model: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.model && !isValidModelId(input.model)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid model: ${input.model}. Valid models: ${MODELS.map(m => m.id).join(', ')}`,
        });
      }
      return chat(ctx.db, ctx, input.message, input.sessionId, input.model as ModelId | undefined);
    }),
});
