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

/** A single test case's outcome as the STUDENT sees it — for `hidden: true`,
 * `input`/`expectedOutput`/`actualOutput` are absent entirely (never sent as
 * `null` or empty strings), same guarantee as `PublicChallenge`'s
 * `visibleTestCases`. */
const TestCaseResultSchema = z.object({
  passed: z.boolean(),
  hidden: z.boolean(),
  input: z.string().optional(),
  expectedOutput: z.string().optional(),
  actualOutput: z.string().optional(),
});

/** Only present for a `type: 'code'` challenge's attempt — see
 * `SubmitAttemptOutput`/`JudgeDetails` in @leetcamp/domain. */
const JudgeResultFields = {
  testResults: z.array(TestCaseResultSchema).optional(),
  compileError: z.string().optional(),
  runtimeError: z.string().optional(),
};

const AttemptSchema = z.object({
  id: z.string(),
  dailyChallengeDate: z.iso.date(),
  challengeTitle: z.string(),
  answer: z.string(),
  isCorrect: z.boolean(),
  submittedAt: z.iso.datetime(),
  timeTakenSeconds: z.number().int(),
  points: z.number().int(),
  ...JudgeResultFields,
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
        // 20000, not 2000: this field carries either a short prediction
        // answer OR a full source-code submission (Fase 2) — the cap exists
        // to stop an abusive payload, not to constrain a real solution.
        body: z.object({ answer: z.string().trim().min(1).max(20_000) }),
        response: {
          201: z.object({
            attemptId: z.string(),
            isCorrect: z.boolean(),
            pointsEarned: z.number().int(),
            currentStreak: z.number().int(),
            longestStreak: z.number().int(),
            totalPoints: z.number().int(),
            ...JudgeResultFields,
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
      // `testResults` destructured OUT before spreading `rest` — otherwise
      // the object literal's inferred type still carries the original
      // `readonly TestCaseResult[]` from the un-destructured spread, even
      // though the value is overridden right after. Zod's inferred array
      // type is mutable, so the domain's readonly array has to become a
      // plain one to satisfy it.
      const { testResults, ...rest } = result.value;
      return reply
        .status(201)
        .send({ ...rest, ...(testResults !== undefined ? { testResults: [...testResults] } : {}) });
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
        result.value.map((attempt) => {
          // Same reasoning as the submit handler above: destructure
          // `testResults` out of `judgeDetails` before spreading, so the
          // readonly array never enters the object literal's inferred type.
          const { testResults, ...judgeRest } = attempt.judgeDetails ?? {};
          return {
            id: attempt.id,
            dailyChallengeDate: attempt.dailyChallengeDate,
            challengeTitle: attempt.challengeTitle,
            answer: attempt.answer,
            isCorrect: attempt.isCorrect,
            submittedAt: attempt.submittedAt.toISOString(),
            timeTakenSeconds: attempt.timeTakenSeconds,
            points: attempt.points,
            ...judgeRest,
            ...(testResults !== undefined ? { testResults: [...testResults] } : {}),
          };
        }),
      );
    },
  );
}
