import {
  err,
  ok,
  repository,
  type RankingEntry,
  type Result,
  type Streak,
  type StreakRepository,
} from '@leetcamp/domain';

import { fromDateColumn, toDateColumn } from './calendar-date-column.js';
import type { PrismaClient, PrismaTransactionClient } from './prisma-client.js';

function toDomain(row: {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastAttemptDate: Date;
  totalPoints: number;
}): Streak {
  return {
    userId: row.userId,
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    lastAttemptDate: fromDateColumn(row.lastAttemptDate),
    totalPoints: row.totalPoints,
  };
}

export function createPrismaStreakRepository(
  // Also accepts a transaction client — see `PrismaTransactionClient`'s doc
  // comment. Every call below is a plain `prisma.streak.*`, present
  // identically on both types.
  prisma: PrismaClient | PrismaTransactionClient,
  logger?: { error: (obj: unknown, msg: string) => void },
): StreakRepository {
  return {
    async findByUserId(userId: string): Promise<Result<Streak | null>> {
      try {
        const row = await prisma.streak.findUnique({ where: { userId } });
        return ok(row ? toDomain(row) : null);
      } catch (error) {
        logger?.error({ err: error }, 'failed to read the streak');
        return err(repository('Could not read the streak'));
      }
    },

    async save(streak: Streak): Promise<Result<Streak>> {
      try {
        const data = {
          currentStreak: streak.currentStreak,
          longestStreak: streak.longestStreak,
          lastAttemptDate: toDateColumn(streak.lastAttemptDate),
          totalPoints: streak.totalPoints,
        };
        // Upsert: the first attempt a user ever makes has no prior row —
        // `applyAttempt` in @leetcamp/domain already computed the full next
        // state, this just persists it either way.
        const row = await prisma.streak.upsert({
          where: { userId: streak.userId },
          create: { userId: streak.userId, ...data },
          update: data,
        });
        return ok(toDomain(row));
      } catch (error) {
        logger?.error({ err: error }, 'failed to save the streak');
        return err(repository('Could not save the streak'));
      }
    },

    async listRanked(): Promise<Result<readonly RankingEntry[]>> {
      try {
        // The join lives HERE, not in the domain — `RankingEntry` needs
        // `displayName`, which is on `User`, not `Streak`. Only students with
        // an attempt (a `Streak` row exists) appear at all; someone who has
        // never attempted has nothing to rank.
        const rows = await prisma.streak.findMany({
          orderBy: { totalPoints: 'desc' },
          select: {
            userId: true,
            totalPoints: true,
            currentStreak: true,
            user: { select: { displayName: true } },
          },
        });
        return ok(
          rows.map((row) => ({
            userId: row.userId,
            displayName: row.user.displayName,
            totalPoints: row.totalPoints,
            currentStreak: row.currentStreak,
          })),
        );
      } catch (error) {
        logger?.error({ err: error }, 'failed to list the ranking');
        return err(repository('Could not list the ranking'));
      }
    },
  };
}
