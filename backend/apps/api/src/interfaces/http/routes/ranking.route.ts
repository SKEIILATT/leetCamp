import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { RankingUseCases } from '@leetcamp/application';

import { errorBody, ErrorResponseSchema, statusForError } from '../result-to-http.js';

const RankingEntrySchema = z.object({
  position: z.number().int(),
  userId: z.string(),
  displayName: z.string(),
  totalPoints: z.number().int(),
  currentStreak: z.number().int(),
});

/** Public to every authenticated student — no role gate, same reasoning as
 * `dailyChallenge.route.ts`'s student endpoint. */
export function registerRankingRoutes(app: FastifyInstance, rankingUseCases: RankingUseCases): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/v1/ranking',
    {
      preHandler: [app.authenticate],
      schema: {
        operationId: 'getRanking',
        tags: ['ranking'],
        summary: 'The leaderboard, ranked by accumulated points',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(RankingEntrySchema), 500: ErrorResponseSchema },
      },
    },
    async (_request, reply) => {
      const result = await rankingUseCases.getRanking();
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 500).send(errorBody(result.error));
      }
      return reply.status(200).send([...result.value]);
    },
  );
}
