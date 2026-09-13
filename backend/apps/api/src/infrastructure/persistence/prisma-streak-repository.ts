import { err, ok, repository, type Result, type Streak, type StreakRepository } from '@leetcamp/domain';

import { fromDateColumn, toDateColumn } from './calendar-date-column.js';
import type { PrismaClient } from './prisma-client.js';

function toDomain(row: {
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastAttemptDate: Date;
}): Streak {
  return {
    userId: row.userId,
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    lastAttemptDate: fromDateColumn(row.lastAttemptDate),
  };
}

export function createPrismaStreakRepository(
  prisma: PrismaClient,
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
  };
}
