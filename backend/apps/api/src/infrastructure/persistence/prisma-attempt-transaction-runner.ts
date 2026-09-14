import {
  err,
  repository,
  type AttemptTransactionRepositories,
  type AttemptTransactionRunner,
  type DomainError,
  type Result,
} from '@leetcamp/domain';

import { createPrismaAttemptRepository } from './prisma-attempt-repository.js';
import { createPrismaStreakRepository } from './prisma-streak-repository.js';
import type { PrismaClient } from './prisma-client.js';

/**
 * Signals from inside `prisma.$transaction`'s callback that the work
 * returned `err(...)` rather than throwing. Our repositories follow the
 * `Result` convention (no exceptions for expected failures), but Prisma only
 * rolls a transaction back when the callback THROWS — so a domain failure has
 * to be turned into a throw here, then unwrapped back into `err(...)` outside
 * `$transaction`, which never sees this class.
 */
class AttemptTransactionAborted extends Error {
  constructor(readonly domainError: DomainError) {
    super('attempt transaction aborted');
  }
}

export function createPrismaAttemptTransactionRunner(
  prisma: PrismaClient,
  logger?: { error: (obj: unknown, msg: string) => void },
): AttemptTransactionRunner {
  return {
    async run<T>(
      work: (repos: AttemptTransactionRepositories) => Promise<Result<T>>,
    ): Promise<Result<T>> {
      try {
        return await prisma.$transaction(async (tx) => {
          // Bound to `tx`, NOT `prisma` — every query the two repositories run
          // for the rest of this callback participates in the same
          // transaction. See the widened parameter type on both adapters.
          const repos: AttemptTransactionRepositories = {
            attemptRepository: createPrismaAttemptRepository(tx, logger),
            streakRepository: createPrismaStreakRepository(tx, logger),
          };

          const result = await work(repos);
          if (!result.ok) {
            throw new AttemptTransactionAborted(result.error);
          }
          return result;
        });
      } catch (error) {
        if (error instanceof AttemptTransactionAborted) {
          return err(error.domainError);
        }
        logger?.error({ err: error }, 'attempt transaction failed');
        return err(repository('Could not complete the attempt transaction'));
      }
    },
  };
}
