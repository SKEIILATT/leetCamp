import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ROLE_ID, type Challenge } from '@leetcamp/domain';
import type { ChallengesUseCases } from '@leetcamp/application';

import { errorBody, ErrorResponseSchema, statusForError } from '../result-to-http.js';

/**
 * The admin surface of the `challenges` vertical: create/list categories and
 * difficulties, create/publish/edit/list challenges. EVERY route here
 * requires `ROLE_ID.ADMIN` — this is where that requirement is actually
 * enforced (the use case bundle itself has no notion of who is calling it,
 * see the note on `buildChallengesUseCases`).
 */
const adminPreHandler = (app: FastifyInstance) => [app.authenticate, app.requireRole(ROLE_ID.ADMIN)];

const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});

const DifficultySchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number().int(),
  createdAt: z.iso.datetime(),
});

/** Fase 2: keep in sync with `CodeLanguage` in `@leetcamp/domain` — this is
 * the HTTP-boundary copy of that closed set (the use case re-validates it
 * independently, this schema only spares a round trip for an obviously bad
 * value). */
const CodeLanguageSchema = z.enum(['javascript', 'python', 'sql']);

const TestCaseSchema = z.object({
  id: z.string(),
  input: z.string(),
  expectedOutput: z.string(),
  isHidden: z.boolean(),
});

const NewTestCaseSchema = z.object({
  input: z.string().min(1),
  expectedOutput: z.string().min(1),
  isHidden: z.boolean(),
});

const ChallengeCommonFields = {
  id: z.string(),
  categoryId: z.string(),
  difficultyId: z.string(),
  title: z.string(),
  promptMarkdown: z.string(),
  status: z.enum(['draft', 'published']),
  createdBy: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

const PredictionChallengeSchema = z.object({
  ...ChallengeCommonFields,
  type: z.literal('prediction'),
  codeSnippet: z.string(),
  expectedAnswer: z.string(),
});

const CodeChallengeSchema = z.object({
  ...ChallengeCommonFields,
  type: z.literal('code'),
  starterCode: z.string(),
  language: CodeLanguageSchema,
  testCases: z.array(TestCaseSchema),
});

const ChallengeSchema = z.discriminatedUnion('type', [PredictionChallengeSchema, CodeChallengeSchema]);

const NewChallengeCommonFields = {
  categoryId: z.uuid(),
  difficultyId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  promptMarkdown: z.string().trim().min(1),
};

/** Shared by `POST /admin/challenges` (create) and `PATCH
 * /admin/challenges/:id` (edit a draft) — an edit sends the exact same shape
 * a create does, just against an existing id. */
const ChallengeBodySchema = z.discriminatedUnion('type', [
  z.object({
    ...NewChallengeCommonFields,
    type: z.literal('prediction'),
    codeSnippet: z.string().min(1),
    expectedAnswer: z.string().trim().min(1),
  }),
  z.object({
    ...NewChallengeCommonFields,
    type: z.literal('code'),
    starterCode: z.string().min(1),
    language: CodeLanguageSchema,
    // At least one — a code challenge with zero test cases can never be
    // judged (the use case re-checks this too, see `createChallenge`).
    testCases: z.array(NewTestCaseSchema).min(1),
  }),
]);

export function registerAdminChallengeRoutes(
  app: FastifyInstance,
  challengesUseCases: ChallengesUseCases,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ── Categories ────────────────────────────────────────────────────────────
  typed.post(
    '/api/v1/admin/categories',
    {
      preHandler: adminPreHandler(app),
      schema: {
        operationId: 'createCategory',
        tags: ['admin', 'challenges'],
        summary: 'Create a challenge category',
        security: [{ bearerAuth: [] }],
        body: z.object({ name: z.string().trim().min(1).max(80) }),
        response: {
          201: z.object({ categoryId: z.string() }),
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await challengesUseCases.createCategory(request.body);
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 409 | 500).send(errorBody(result.error));
      }
      return reply.status(201).send(result.value);
    },
  );

  typed.get(
    '/api/v1/admin/categories',
    {
      preHandler: adminPreHandler(app),
      schema: {
        operationId: 'listCategories',
        tags: ['admin', 'challenges'],
        summary: 'List challenge categories',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(CategorySchema), 500: ErrorResponseSchema },
      },
    },
    async (_request, reply) => {
      const result = await challengesUseCases.listCategories();
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 500).send(errorBody(result.error));
      }
      return reply.status(200).send(result.value.map(toCategoryResponse));
    },
  );

  // ── Difficulties ──────────────────────────────────────────────────────────
  typed.post(
    '/api/v1/admin/difficulties',
    {
      preHandler: adminPreHandler(app),
      schema: {
        operationId: 'createDifficulty',
        tags: ['admin', 'challenges'],
        summary: 'Create a challenge difficulty level',
        security: [{ bearerAuth: [] }],
        body: z.object({ name: z.string().trim().min(1).max(40), level: z.number().int().min(1) }),
        response: {
          201: z.object({ difficultyId: z.string() }),
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await challengesUseCases.createDifficulty(request.body);
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 409 | 500).send(errorBody(result.error));
      }
      return reply.status(201).send(result.value);
    },
  );

  typed.get(
    '/api/v1/admin/difficulties',
    {
      preHandler: adminPreHandler(app),
      schema: {
        operationId: 'listDifficulties',
        tags: ['admin', 'challenges'],
        summary: 'List challenge difficulty levels',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(DifficultySchema), 500: ErrorResponseSchema },
      },
    },
    async (_request, reply) => {
      const result = await challengesUseCases.listDifficulties();
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 500).send(errorBody(result.error));
      }
      return reply.status(200).send(result.value.map(toDifficultyResponse));
    },
  );

  // ── Challenges ────────────────────────────────────────────────────────────
  typed.post(
    '/api/v1/admin/challenges',
    {
      preHandler: adminPreHandler(app),
      schema: {
        operationId: 'createChallenge',
        tags: ['admin', 'challenges'],
        summary: 'Create a draft challenge (prediction or code)',
        security: [{ bearerAuth: [] }],
        body: ChallengeBodySchema,
        response: {
          201: z.object({ challengeId: z.string() }),
          400: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      // `createdBy` is identity, never client input — see the note on
      // `NewChallenge`.
      const result = await challengesUseCases.createChallenge({
        ...request.body,
        createdBy: request.identity!.userId,
      });
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 400 | 500).send(errorBody(result.error));
      }
      return reply.status(201).send(result.value);
    },
  );

  typed.patch(
    '/api/v1/admin/challenges/:id',
    {
      preHandler: adminPreHandler(app),
      schema: {
        operationId: 'updateDraftChallenge',
        tags: ['admin', 'challenges'],
        summary: 'Edit a challenge that is still a draft',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.uuid() }),
        body: ChallengeBodySchema,
        response: {
          200: z.object({ challengeId: z.string() }),
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await challengesUseCases.updateDraftChallenge({
        challengeId: request.params.id,
        ...request.body,
      });
      if (!result.ok) {
        return reply
          .status(statusForError(result.error) as 400 | 404 | 409 | 500)
          .send(errorBody(result.error));
      }
      return reply.status(200).send({ challengeId: request.params.id });
    },
  );

  typed.post(
    '/api/v1/admin/challenges/:id/publish',
    {
      preHandler: adminPreHandler(app),
      schema: {
        operationId: 'publishChallenge',
        tags: ['admin', 'challenges'],
        summary: 'Publish a draft challenge',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.uuid() }),
        response: {
          200: z.object({ challengeId: z.string(), status: z.literal('published') }),
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await challengesUseCases.publishChallenge({ challengeId: request.params.id });
      if (!result.ok) {
        // 400 is new in Fase 2: publishing a `type: 'code'` challenge when
        // Judge0 is not configured — see `codeExecutionNotConfigured`.
        return reply
          .status(statusForError(result.error) as 400 | 404 | 409 | 500)
          .send(errorBody(result.error));
      }
      return reply.status(200).send({ challengeId: request.params.id, status: 'published' as const });
    },
  );

  typed.get(
    '/api/v1/admin/challenges',
    {
      preHandler: adminPreHandler(app),
      schema: {
        operationId: 'listChallenges',
        tags: ['admin', 'challenges'],
        summary: 'List challenges, drafts included',
        security: [{ bearerAuth: [] }],
        querystring: z.object({ status: z.enum(['draft', 'published']).optional() }),
        response: { 200: z.array(ChallengeSchema), 500: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await challengesUseCases.listChallenges(
        request.query.status !== undefined ? { status: request.query.status } : undefined,
      );
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 500).send(errorBody(result.error));
      }
      return reply.status(200).send(result.value.map(toChallengeResponse));
    },
  );
}

function toCategoryResponse(category: { id: string; name: string; createdAt: Date }) {
  return { id: category.id, name: category.name, createdAt: category.createdAt.toISOString() };
}

function toDifficultyResponse(difficulty: {
  id: string;
  name: string;
  level: number;
  createdAt: Date;
}) {
  return {
    id: difficulty.id,
    name: difficulty.name,
    level: difficulty.level,
    createdAt: difficulty.createdAt.toISOString(),
  };
}

function toChallengeResponse(challenge: Challenge) {
  const dates = { createdAt: challenge.createdAt.toISOString(), updatedAt: challenge.updatedAt.toISOString() };
  if (challenge.type === 'code') {
    // `testCases` destructured OUT before spreading `rest` — otherwise the
    // object literal's inferred type still carries the domain's `readonly
    // TestCase[]`, which Zod's mutable array type rejects, even though the
    // value is overridden right after.
    const { testCases, ...rest } = challenge;
    return { ...rest, ...dates, testCases: [...testCases] };
  }
  return { ...challenge, ...dates };
}
