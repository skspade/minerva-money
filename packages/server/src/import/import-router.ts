import { z } from 'zod';
import { router, publicProcedure } from '../sync/trpc.js';
import { previewImport, executeImport } from './import-service.js';

export const importRouter = router({
  preview: publicProcedure
    .input(z.object({ csvText: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return previewImport(ctx.db, input.csvText);
    }),

  execute: publicProcedure
    .input(z.object({
      csvText: z.string().min(1),
      accountMappings: z.record(z.string(), z.string()),
      categoryMappings: z.record(z.string(), z.number()),
    }))
    .mutation(({ ctx, input }) => {
      return executeImport(ctx.db, input.csvText, input.accountMappings, input.categoryMappings);
    }),
});
