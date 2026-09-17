import {
  err,
  ok,
  repository,
  type Attempt,
  type AttemptRepository,
  type JudgeDetails,
  type NewAttempt,
  type Result,
} from '@leetcamp/domain';

import { fromDateColumn, toDateColumn } from './calendar-date-column.js';
import type { Prisma, PrismaClient, PrismaTransactionClient } from './prisma-client.js';

function toDomain(row: {
  id: string;
  userId: string;
  dailyChallengeDate: Date;
  answer: string;
  isCorrect: boolean;
  submittedAt: Date;
  timeTakenSeconds: number;
  points: number;
  judgeDetails: Prisma.JsonValue | null;
}): Attempt {
  return {
    id: row.id,
    userId: row.userId,
    dailyChallengeDate: fromDateColumn(row.dailyChallengeDate),
    answer: row.answer,
    isCorrect: row.isCorrect,
    submittedAt: row.submittedAt,
    timeTakenSeconds: row.timeTakenSeconds,
    points: row.points,
    // Cast, not re-validated: only ever written by this repository's own
    // `create`, from a `JudgeDetails` value — never edited by hand in the DB.
    ...(row.judgeDetails !== null ? { judgeDetails: row.judgeDetails as unknown as JudgeDetails } : {}),
  };
}

export function createPrismaAttemptRepository(
  // Also accepts a transaction client — see `PrismaTransactionClient`'s doc
  // comment. Every call below is a plain `prisma.attempt.*`, present
  // identically on both types.
  prisma: PrismaClient | PrismaTransactionClient,
  logger?: { error: (obj: unknown, msg: string) => void },
): AttemptRepository {
  return {
    async findByUserAndDate(userId: string, dailyChallengeDate: string): Promise<Result<Attempt | null>> {
      try {
        const row = await prisma.attempt.findUnique({
          where: {
            userId_dailyChallengeDate: { userId, dailyChallengeDate: toDateColumn(dailyChallengeDate) },
          },
        });
        return ok(row ? toDomain(row) : null);
      } catch (error) {
        logger?.error({ err: error }, 'failed to read the attempt by user and date');
        return err(repository('Could not read the attempt'));
      }
    },

    async listByUser(userId: string): Promise<Result<readonly Attempt[]>> {
      try {
        const rows = await prisma.attempt.findMany({
          where: { userId },
          orderBy: { submittedAt: 'desc' },
        });
        return ok(rows.map(toDomain));
      } catch (error) {
        logger?.error({ err: error }, 'failed to list attempts for the user');
        return err(repository('Could not list attempts'));
      }
    },

    async create(attempt: NewAttempt & { id: string }): Promise<Result<Attempt>> {
      try {
        const row = await prisma.attempt.create({
          data: {
            id: attempt.id,
            userId: attempt.userId,
            dailyChallengeDate: toDateColumn(attempt.dailyChallengeDate),
            answer: attempt.answer,
            isCorrect: attempt.isCorrect,
            submittedAt: attempt.submittedAt,
            timeTakenSeconds: attempt.timeTakenSeconds,
            points: attempt.points,
            // Conditional spread, not `judgeDetails: attempt.judgeDetails ?? null`:
            // under `exactOptionalPropertyTypes`, Prisma's optional `data`
            // fields accept the key being ABSENT, not present with
            // `undefined`. `undefined` here (prediction attempts) means
            // "omit the key", leaving the column at its `null` default.
            ...(attempt.judgeDetails !== undefined
              ? { judgeDetails: attempt.judgeDetails as unknown as Prisma.InputJsonValue }
              : {}),
          },
        });
        return ok(toDomain(row));
      } catch (error) {
        // Race with another submission for the same (user, day): the use
        // case already pre-checks `findByUserAndDate`, so reaching the
        // `@@unique` constraint here means two requests landed at once — same
        // "treat as a generic repository failure" reasoning as
        // `prisma-user-repository.ts`'s duplicate-email race.
        logger?.error({ err: error }, 'failed to create the attempt');
        return err(repository('Could not create the attempt'));
      }
    },
  };
}
