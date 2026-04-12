import { z } from 'zod';
import { router, publicProcedure } from '../sync/trpc.js';
import { previewImport, executeImport } from './import-service.js';

export const importRouter = router({
  preview: publicProcedure
    .input(z.object({
      csvText: z.string().min(1),
      negateAmounts: z.boolean().optional(),
      accountMappings: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(({ ctx, input }) => {
      return previewImport(ctx.db, input.csvText, input.negateAmounts ?? false, input.accountMappings);
    }),

  execute: publicProcedure
    .input(z.object({
      csvText: z.string().min(1),
      accountMappings: z.record(z.string(), z.string()),
      categoryMappings: z.record(z.string(), z.number()),
      negateAmounts: z.boolean().optional(),
    }))
    .mutation(({ ctx, input }) => {
      return executeImport(ctx.db, input.csvText, input.accountMappings, input.categoryMappings, input.negateAmounts ?? false);
    }),
});
