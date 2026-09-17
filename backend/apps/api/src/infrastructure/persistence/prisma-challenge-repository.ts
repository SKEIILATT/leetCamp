import {
  err,
  ok,
  repository,
  type Challenge,
  type ChallengeRepository,
  type ChallengeStatus,
  type CodeLanguage,
  type DraftChallengeEdit,
  type NewChallenge,
  type Result,
} from '@leetcamp/domain';

import type { Prisma, PrismaClient } from './prisma-client.js';

/** Shared `include` for every read of a `Challenge` row — the nested
 * `codeChallenge`/`testCases` are what `toDomain` needs to build the `'code'`
 * branch of the union. Test cases are ordered by their stored `order`, not
 * insertion order (which Postgres does not guarantee). */
const CHALLENGE_INCLUDE = {
  codeChallenge: { include: { testCases: { orderBy: { order: 'asc' as const } } } },
} satisfies Prisma.ChallengeInclude;

type ChallengeRow = Prisma.ChallengeGetPayload<{ include: typeof CHALLENGE_INCLUDE }>;

/**
 * Fase 2: `Challenge` is a real discriminated union now (`type: 'prediction'
 * | 'code'`) — this is where that split is bridged back into one domain
 * shape. A `'code'` row is expected to always carry its `codeChallenge`
 * relation (enforced by `create` below, which always writes both together in
 * the same call) — if it does not, that is a data-integrity bug, not a
 * normal "missing" case, hence the `repository(...)` error rather than a
 * silent fallback.
 */
function toDomain(row: ChallengeRow): Challenge {
  const base = {
    id: row.id,
    categoryId: row.categoryId,
    difficultyId: row.difficultyId,
    title: row.title,
    promptMarkdown: row.promptMarkdown,
    // Cast, not re-validated: same reasoning as `status` below — this column
    // is only ever written by `create`, never by hand.
    status: row.status as ChallengeStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  if (row.type === 'code') {
    if (row.codeChallenge === null) {
      throw new Error(`Challenge ${row.id} has type='code' but no code_challenges row`);
    }
    return {
      ...base,
      type: 'code',
      starterCode: row.codeChallenge.starterCode,
      language: row.codeChallenge.language as CodeLanguage,
      testCases: row.codeChallenge.testCases.map((tc) => ({
        id: tc.id,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        isHidden: tc.isHidden,
      })),
    };
  }

  return {
    ...base,
    type: 'prediction',
    // Non-null assertion: a `type='prediction'` row always has these two
    // columns populated — only `create` writes them, and only alongside
    // `type: 'prediction'`.
    codeSnippet: row.codeSnippet!,
    expectedAnswer: row.expectedAnswer!,
  };
}

export function createPrismaChallengeRepository(
  prisma: PrismaClient,
  logger?: { error: (obj: unknown, msg: string) => void },
): ChallengeRepository {
  return {
    async findById(id: string): Promise<Result<Challenge | null>> {
      try {
        const row = await prisma.challenge.findUnique({ where: { id }, include: CHALLENGE_INCLUDE });
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
          include: CHALLENGE_INCLUDE,
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
        const base = {
          id: challenge.id,
          categoryId: challenge.categoryId,
          difficultyId: challenge.difficultyId,
          type: challenge.type,
          title: challenge.title,
          promptMarkdown: challenge.promptMarkdown,
          createdBy: challenge.createdBy,
          createdAt: challenge.createdAt,
          updatedAt: challenge.updatedAt,
        };

        const row =
          challenge.type === 'prediction'
            ? await prisma.challenge.create({
                data: {
                  ...base,
                  codeSnippet: challenge.codeSnippet,
                  expectedAnswer: challenge.expectedAnswer,
                },
                include: CHALLENGE_INCLUDE,
              })
            : await prisma.challenge.create({
                data: {
                  ...base,
                  // Nested write: the `CodeChallenge` row and every `TestCase`
                  // row are created in the SAME insert as the `Challenge` row
                  // (Prisma wraps this in one implicit transaction) — a
                  // 'code' challenge can never exist half-written.
                  codeChallenge: {
                    create: {
                      starterCode: challenge.starterCode,
                      language: challenge.language,
                      testCases: {
                        create: challenge.testCases.map((testCase, index) => ({
                          input: testCase.input,
                          expectedOutput: testCase.expectedOutput,
                          isHidden: testCase.isHidden,
                          order: index,
                        })),
                      },
                    },
                  },
                },
                include: CHALLENGE_INCLUDE,
              });
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
        const row = await prisma.challenge.update({
          where: { id },
          data: { status, updatedAt },
          include: CHALLENGE_INCLUDE,
        });
        return ok(toDomain(row));
      } catch (error) {
        logger?.error({ err: error }, 'failed to update the challenge status');
        return err(repository('Could not update the challenge'));
      }
    },

    async updateDraft(
      id: string,
      edit: DraftChallengeEdit,
      updatedAt: Date,
    ): Promise<Result<Challenge>> {
      try {
        const base = {
          categoryId: edit.categoryId,
          difficultyId: edit.difficultyId,
          title: edit.title,
          promptMarkdown: edit.promptMarkdown,
          updatedAt,
        };

        const row =
          edit.type === 'prediction'
            ? await prisma.challenge.update({
                where: { id },
                data: { ...base, codeSnippet: edit.codeSnippet, expectedAnswer: edit.expectedAnswer },
                include: CHALLENGE_INCLUDE,
              })
            : await prisma.challenge.update({
                where: { id },
                data: {
                  ...base,
                  codeChallenge: {
                    update: {
                      starterCode: edit.starterCode,
                      language: edit.language,
                      testCases: {
                        // Replace the whole set — an edit sends the complete
                        // list, not a diff, so deleting every existing test
                        // case before recreating is simpler and cannot drift
                        // from what the admin submitted.
                        deleteMany: {},
                        create: edit.testCases.map((testCase, index) => ({
                          input: testCase.input,
                          expectedOutput: testCase.expectedOutput,
                          isHidden: testCase.isHidden,
                          order: index,
                        })),
                      },
                    },
                  },
                },
                include: CHALLENGE_INCLUDE,
              });
        return ok(toDomain(row));
      } catch (error) {
        logger?.error({ err: error }, 'failed to update the draft challenge');
        return err(repository('Could not update the challenge'));
      }
    },
  };
}
