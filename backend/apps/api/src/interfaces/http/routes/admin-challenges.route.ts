import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ROLE_ID } from '@leetcamp/domain';
import type { ChallengesUseCases } from '@leetcamp/application';

import { errorBody, ErrorResponseSchema, statusForError } from '../result-to-http.js';

/**
 * The admin surface of the `challenges` vertical: create/list categories and
 * difficulties, create/publish/list challenges. EVERY route here requires
 * `ROLE_ID.ADMIN` — this is where that requirement is actually enforced (the
 * use case bundle itself has no notion of who is calling it, see the note on
 * `buildChallengesUseCases`).
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

const ChallengeSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  difficultyId: z.string(),
  type: z.literal('prediction'),
  title: z.string(),
  promptMarkdown: z.string(),
  codeSnippet: z.string(),
  expectedAnswer: z.string(),
  status: z.enum(['draft', 'published']),
  createdBy: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

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
        summary: 'Create a draft prediction challenge',
        security: [{ bearerAuth: [] }],
        body: z.object({
          categoryId: z.uuid(),
          difficultyId: z.uuid(),
          title: z.string().trim().min(1).max(200),
          promptMarkdown: z.string().trim().min(1),
          codeSnippet: z.string().min(1),
          expectedAnswer: z.string().trim().min(1),
        }),
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
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await challengesUseCases.publishChallenge({ challengeId: request.params.id });
      if (!result.ok) {
        return reply
          .status(statusForError(result.error) as 404 | 409 | 500)
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

function toChallengeResponse(challenge: {
  id: string;
  categoryId: string;
  difficultyId: string;
  type: 'prediction';
  title: string;
  promptMarkdown: string;
  codeSnippet: string;
  expectedAnswer: string;
  status: 'draft' | 'published';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...challenge,
    createdAt: challenge.createdAt.toISOString(),
    updatedAt: challenge.updatedAt.toISOString(),
  };
}
