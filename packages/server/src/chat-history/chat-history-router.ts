import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from '../sync/trpc.js';
import {
  listConversations,
  getConversation,
  deleteConversation,
  renameConversation,
} from './chat-history-service.js';

export const chatHistoryRouter = router({
  list: publicProcedure
    .query(({ ctx }) => {
      return listConversations(ctx.db);
    }),

  get: publicProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(({ ctx, input }) => {
      const conversation = getConversation(ctx.db, input.conversationId);
      if (!conversation) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Conversation not found: ${input.conversationId}`,
        });
      }
      return conversation;
    }),

  delete: publicProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(({ ctx, input }) => {
      const deleted = deleteConversation(ctx.db, input.conversationId);
      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Conversation not found: ${input.conversationId}`,
        });
      }
      return { success: true };
    }),

  updateTitle: publicProcedure
    .input(z.object({ conversationId: z.string(), title: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      const updated = renameConversation(ctx.db, input.conversationId, input.title);
      if (!updated) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Conversation not found: ${input.conversationId}`,
        });
      }
      return { success: true };
    }),
});
