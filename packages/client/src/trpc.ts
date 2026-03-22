import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../../server/src/sync/trpc-router.js';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
