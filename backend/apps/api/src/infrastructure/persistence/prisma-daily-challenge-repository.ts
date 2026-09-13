import {
  err,
  ok,
  repository,
  type DailyChallenge,
  type DailyChallengeRepository,
  type NewDailyChallenge,
  type Result,
} from '@leetcamp/domain';

import { fromDateColumn, toDateColumn } from './calendar-date-column.js';
import type { PrismaClient } from './prisma-client.js';

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
