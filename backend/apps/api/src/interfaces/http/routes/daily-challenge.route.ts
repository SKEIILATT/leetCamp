import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ROLE_ID } from '@leetcamp/domain';
import type { DailyChallengesUseCases } from '@leetcamp/application';

import { errorBody, ErrorResponseSchema, statusForError } from '../result-to-http.js';

const adminPreHandler = (app: FastifyInstance) => [app.authenticate, app.requireRole(ROLE_ID.ADMIN)];

const DailyChallengeSchema = z.object({
  date: z.iso.date(),
  challengeId: z.string(),
  publishedAt: z.iso.datetime(),
});

const PublicChallengeCommonFields = {
  challengeId: z.string(),
  date: z.iso.date(),
  categoryId: z.string(),
  categoryName: z.string(),
  difficultyId: z.string(),
  difficultyName: z.string(),
  title: z.string(),
  promptMarkdown: z.string(),
  publishedAt: z.iso.datetime(),
};

/**
 * ⚠ NO `expectedAnswer` FIELD, and no HIDDEN test case content, ON PURPOSE.
 * See `PublicChallenge` in @leetcamp/application for why neither can even
 * reach this schema — this is not the only thing keeping them out, but it is
 * the last line of defence: even if a future edit accidentally attached one
 * to the use case's return value, Zod's response serialisation strips
 * whatever is not declared here.
 */
const PublicChallengeSchema = z.discriminatedUnion('type', [
  z.object({ ...PublicChallengeCommonFields, type: z.literal('prediction'), codeSnippet: z.string() }),
  z.object({
    ...PublicChallengeCommonFields,
    type: z.literal('code'),
    starterCode: z.string(),
    language: z.enum(['javascript', 'python', 'sql']),
    visibleTestCases: z.array(z.object({ input: z.string(), expectedOutput: z.string() })),
  }),
]);

export function registerDailyChallengeRoutes(
  app: FastifyInstance,
  dailyChallengesUseCases: DailyChallengesUseCases,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ── Admin: scheduling ────────────────────────────────────────────────────
  typed.post(
    '/api/v1/admin/daily-challenges',
    {
      preHandler: adminPreHandler(app),
      schema: {
        operationId: 'scheduleDailyChallenge',
        tags: ['admin', 'daily-challenges'],
        summary: 'Schedule the reto del día for a date',
        security: [{ bearerAuth: [] }],
        body: z.object({ date: z.iso.date(), challengeId: z.uuid() }),
        response: {
          201: z.object({ date: z.iso.date(), challengeId: z.string() }),
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await dailyChallengesUseCases.scheduleDailyChallenge(request.body);
      if (!result.ok) {
        return reply
          .status(statusForError(result.error) as 400 | 404 | 409 | 500)
          .send(errorBody(result.error));
      }
      return reply.status(201).send(request.body);
    },
  );

  typed.get(
    '/api/v1/admin/daily-challenges',
    {
      preHandler: adminPreHandler(app),
      schema: {
        operationId: 'listDailyChallenges',
        tags: ['admin', 'daily-challenges'],
        summary: 'List scheduled daily challenges',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(DailyChallengeSchema), 500: ErrorResponseSchema },
      },
    },
    async (_request, reply) => {
      const result = await dailyChallengesUseCases.listDailyChallenges();
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 500).send(errorBody(result.error));
      }
      return reply.status(200).send(
        result.value.map((entry) => ({
          date: entry.date,
          challengeId: entry.challengeId,
          publishedAt: entry.publishedAt.toISOString(),
        })),
      );
    },
  );

  // ── Student: today's challenge ───────────────────────────────────────────
  typed.get(
    '/api/v1/daily-challenge',
    {
      // Any authenticated user — not role-gated. There is nothing here a
      // student should not see; `PublicChallenge`'s own shape is what keeps
      // the answer out, not the role check.
      preHandler: [app.authenticate],
      schema: {
        operationId: 'getTodayChallenge',
        tags: ['daily-challenge'],
        summary: "Today's challenge",
        security: [{ bearerAuth: [] }],
        response: { 200: PublicChallengeSchema, 404: ErrorResponseSchema, 500: ErrorResponseSchema },
      },
    },
    async (_request, reply) => {
      const result = await dailyChallengesUseCases.getTodayChallenge();
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 404 | 500).send(errorBody(result.error));
      }
      if (result.value.type === 'code') {
        // `visibleTestCases` destructured OUT before spreading `rest` — same
        // reasoning as `toChallengeResponse` in admin-challenges.route.ts.
        const { visibleTestCases, ...rest } = result.value;
        return reply.status(200).send({
          ...rest,
          publishedAt: result.value.publishedAt.toISOString(),
          visibleTestCases: [...visibleTestCases],
        });
      }
      return reply
        .status(200)
        .send({ ...result.value, publishedAt: result.value.publishedAt.toISOString() });
    },
  );
}
