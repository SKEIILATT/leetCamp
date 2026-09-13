import {
  err,
  ok,
  repository,
  type DailyChallenge,
  type DailyChallengeRepository,
  type NewDailyChallenge,
  type Result,
} from '@leetcamp/domain';

import type { PrismaClient } from './prisma-client.js';

/**
 * `date` is a pure calendar date in the domain ('YYYY-MM-DD', no time, no
 * zone), but Postgres/Prisma still represent a `@db.Date` column as a JS
 * `Date` object. THE ROUND-TRIP THROUGH `Date` IS WHERE A ONE-DAY-OFF BUG
 * LIVES if it is done with local-timezone methods:
 *
 *   `new Date(2026, 2, 15)`        → midnight in the SERVER's local zone.
 *   `someDate.getDate()`           → the day number in the SERVER's local zone.
 *
 * Both of those depend on wherever this process happens to be deployed, which
 * is exactly the kind of bug that is invisible in development (server and
 * developer machine share a zone) and shows up only in a specific production
 * region. Every conversion here goes through the UTC-explicit form instead —
 * `T00:00:00.000Z` on the way in, `toISOString().slice(0, 10)` on the way out
 * — so the calendar date is never at the mercy of the process's local zone.
 */
function toDateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function fromDateColumn(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toDomain(row: { date: Date; challengeId: string; publishedAt: Date }): DailyChallenge {
  return {
    date: fromDateColumn(row.date),
    challengeId: row.challengeId,
    publishedAt: row.publishedAt,
  };
}

export function createPrismaDailyChallengeRepository(
  prisma: PrismaClient,
  logger?: { error: (obj: unknown, msg: string) => void },
): DailyChallengeRepository {
  return {
    async findByDate(date: string): Promise<Result<DailyChallenge | null>> {
      try {
        const row = await prisma.dailyChallenge.findUnique({ where: { date: toDateColumn(date) } });
        return ok(row ? toDomain(row) : null);
      } catch (error) {
        logger?.error({ err: error }, 'failed to read the daily challenge by date');
        return err(repository('Could not read the daily challenge'));
      }
    },

    async list(): Promise<Result<readonly DailyChallenge[]>> {
      try {
        const rows = await prisma.dailyChallenge.findMany({ orderBy: { date: 'desc' } });
        return ok(rows.map(toDomain));
      } catch (error) {
        logger?.error({ err: error }, 'failed to list daily challenges');
        return err(repository('Could not list daily challenges'));
      }
    },

    async create(
      entry: NewDailyChallenge & { publishedAt: Date },
    ): Promise<Result<DailyChallenge>> {
      try {
        const row = await prisma.dailyChallenge.create({
          data: {
            date: toDateColumn(entry.date),
            challengeId: entry.challengeId,
            publishedAt: entry.publishedAt,
          },
        });
        return ok(toDomain(row));
      } catch (error) {
        logger?.error({ err: error }, 'failed to create the daily challenge');
        return err(repository('Could not create the daily challenge'));
      }
    },
  };
}
