import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AttemptsUseCases } from '@leetcamp/application';

import { errorBody, ErrorResponseSchema, statusForError } from '../result-to-http.js';

const StreakSchema = z.object({
  currentStreak: z.number().int(),
  longestStreak: z.number().int(),
  lastAttemptDate: z.iso.date().nullable(),
  totalPoints: z.number().int(),
});

const AttemptSchema = z.object({
  id: z.string(),
  dailyChallengeDate: z.iso.date(),
  challengeTitle: z.string(),
  answer: z.string(),
  isCorrect: z.boolean(),
  submittedAt: z.iso.datetime(),
  timeTakenSeconds: z.number().int(),
  points: z.number().int(),
});

/**
 * The student surface: submit today's answer, read your own streak, read your
 * own history. No role gate anywhere here — see the note on `AttemptsDeps` in
 * @leetcamp/application for why. `app.authenticate` is still required: these
 * read/write ONE person's data, and that person has to be someone.
 */
export function registerAttemptsRoutes(app: FastifyInstance, attemptsUseCases: AttemptsUseCases): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/v1/attempts',
    {
      preHandler: [app.authenticate],
      schema: {
        operationId: 'submitAttempt',
        tags: ['attempts'],
        summary: "Submit an answer to today's challenge",
        security: [{ bearerAuth: [] }],
        body: z.object({ answer: z.string().trim().min(1).max(2000) }),
        response: {
          201: z.object({
            attemptId: z.string(),
            isCorrect: z.boolean(),
            pointsEarned: z.number().int(),
            currentStreak: z.number().int(),
            longestStreak: z.number().int(),
            totalPoints: z.number().int(),
          }),
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await attemptsUseCases.submitAttempt({
        userId: request.identity!.userId,
        answer: request.body.answer,
      });
      if (!result.ok) {
        return reply
          .status(statusForError(result.error) as 404 | 409 | 500)
          .send(errorBody(result.error));
      }
      return reply.status(201).send(result.value);
    },
  );

  typed.get(
    '/api/v1/me/streak',
    {
      preHandler: [app.authenticate],
      schema: {
        operationId: 'getMyStreak',
        tags: ['attempts'],
        summary: 'My current streak',
        security: [{ bearerAuth: [] }],
        response: { 200: StreakSchema, 500: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await attemptsUseCases.getMyStreak({ userId: request.identity!.userId });
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 500).send(errorBody(result.error));
      }
      // `null` means no attempt yet, ever — day one, a real state, not an
      // error. Reported as zeros rather than a 404: there IS a streak
      // resource for every student, it just starts empty.
      if (result.value === null) {
        return reply
          .status(200)
          .send({ currentStreak: 0, longestStreak: 0, lastAttemptDate: null, totalPoints: 0 });
      }
      return reply.status(200).send({
        currentStreak: result.value.currentStreak,
        longestStreak: result.value.longestStreak,
        lastAttemptDate: result.value.lastAttemptDate,
        totalPoints: result.value.totalPoints,
      });
    },
  );

  typed.get(
    '/api/v1/me/attempts',
    {
      preHandler: [app.authenticate],
      schema: {
        operationId: 'getMyHistory',
        tags: ['attempts'],
        summary: 'My attempt history, newest first',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(AttemptSchema), 500: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await attemptsUseCases.getMyHistory({ userId: request.identity!.userId });
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 500).send(errorBody(result.error));
      }
      return reply.status(200).send(
        result.value.map((attempt) => ({
          id: attempt.id,
          dailyChallengeDate: attempt.dailyChallengeDate,
          challengeTitle: attempt.challengeTitle,
          answer: attempt.answer,
          isCorrect: attempt.isCorrect,
          submittedAt: attempt.submittedAt.toISOString(),
          timeTakenSeconds: attempt.timeTakenSeconds,
          points: attempt.points,
        })),
      );
    },
  );
}
