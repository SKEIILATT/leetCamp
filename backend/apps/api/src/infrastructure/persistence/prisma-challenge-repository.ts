import {
  err,
  ok,
  repository,
  type Challenge,
  type ChallengeRepository,
  type ChallengeStatus,
  type NewChallenge,
  type Result,
} from '@leetcamp/domain';

import type { PrismaClient } from './prisma-client.js';

/**
 * Fase 1 flattening happens HERE: the domain's `Challenge` has the prediction
 * fields directly on it, the database keeps them on the `challenges` table
 * too (no separate `prediction_challenges` join needed while `type` can only
 * ever be `'prediction'` — see the entity's header comment). `toDomain` is
 * where that flattening would stop being trivial, the day it needs to be one.
 */
function toDomain(row: {
  id: string;
  categoryId: string;
  difficultyId: string;
  title: string;
  promptMarkdown: string;
  codeSnippet: string;
  expectedAnswer: string;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): Challenge {
  return {
    id: row.id,
    categoryId: row.categoryId,
    difficultyId: row.difficultyId,
    type: 'prediction',
    title: row.title,
    promptMarkdown: row.promptMarkdown,
    codeSnippet: row.codeSnippet,
    expectedAnswer: row.expectedAnswer,
    // Cast, not re-validated: this column is only ever written through
    // `create` (always `draft`) or `updateStatus` (a `ChallengeStatus`), never
    // by hand — a third value would mean the column was written outside this
    // adapter, which is a bug this cast cannot and should not paper over.
    status: row.status as ChallengeStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createPrismaChallengeRepository(
  prisma: PrismaClient,
  logger?: { error: (obj: unknown, msg: string) => void },
): ChallengeRepository {
  return {
    async findById(id: string): Promise<Result<Challenge | null>> {
      try {
        const row = await prisma.challenge.findUnique({ where: { id } });
        return ok(row ? toDomain(row) : null);
      } catch (error) {
        logger?.error({ err: error }, 'failed to read the challenge by id');
        return err(repository('Could not read the challenge'));
      }
    },

    async list(filter): Promise<Result<readonly Challenge[]>> {
      try {
        // Conditional spread, not `where: filter?.status !== undefined ? ... :
        // undefined`: under `exactOptionalPropertyTypes`, Prisma's optional
        // `where?:` accepts the key being ABSENT, not present with `undefined`.
        const rows = await prisma.challenge.findMany({
          ...(filter?.status !== undefined ? { where: { status: filter.status } } : {}),
          orderBy: { createdAt: 'desc' },
        });
        return ok(rows.map(toDomain));
      } catch (error) {
        logger?.error({ err: error }, 'failed to list challenges');
        return err(repository('Could not list challenges'));
      }
    },

    async create(
      challenge: NewChallenge & { id: string; createdAt: Date; updatedAt: Date },
    ): Promise<Result<Challenge>> {
      try {
        const row = await prisma.challenge.create({ data: challenge });
        return ok(toDomain(row));
      } catch (error) {
        logger?.error({ err: error }, 'failed to create the challenge');
        return err(repository('Could not create the challenge'));
      }
    },

    async updateStatus(
      id: string,
      status: ChallengeStatus,
      updatedAt: Date,
    ): Promise<Result<Challenge>> {
      try {
        const row = await prisma.challenge.update({ where: { id }, data: { status, updatedAt } });
        return ok(toDomain(row));
      } catch (error) {
        logger?.error({ err: error }, 'failed to update the challenge status');
        return err(repository('Could not update the challenge'));
      }
    },
  };
}
