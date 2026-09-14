import { createHash } from 'node:crypto';

import {
  err,
  ok,
  repository,
  type NewPasswordResetToken,
  type PasswordResetToken,
  type PasswordResetTokenRepository,
  type Result,
} from '@leetcamp/domain';

import type { PrismaClient } from './prisma-client.js';

/**
 * Fast cryptographic hash, NOT `PasswordHasher` (scrypt) — a reset token is
 * high-entropy random data, not a human-chosen password, so brute-forcing it
 * is infeasible regardless of hash speed. See the port's header comment for
 * the full reasoning. SHA-256 over the raw token is enough; this function is
 * the ONLY place in the codebase that needs to know that.
 */
function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

function toDomain(row: {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}): PasswordResetToken {
  return {
    id: row.id,
    userId: row.userId,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

export function createPrismaPasswordResetRepository(
  prisma: PrismaClient,
  logger?: { error: (obj: unknown, msg: string) => void },
): PasswordResetTokenRepository {
  return {
    async create(
      entry: NewPasswordResetToken & { id: string; createdAt: Date },
    ): Promise<Result<PasswordResetToken>> {
      try {
        const row = await prisma.passwordResetToken.create({
          data: {
            id: entry.id,
            userId: entry.userId,
            tokenHash: hashToken(entry.token),
            expiresAt: entry.expiresAt,
            createdAt: entry.createdAt,
          },
        });
        return ok(toDomain(row));
      } catch (error) {
        logger?.error({ err: error }, 'failed to create the password reset token');
        return err(repository('Could not create the password reset token'));
      }
    },

    async findValidByToken(token: string): Promise<Result<PasswordResetToken | null>> {
      try {
        const row = await prisma.passwordResetToken.findUnique({
          where: { tokenHash: hashToken(token) },
        });
        // Expired or already-used are answered the SAME way as "does not
        // exist" — `ok(null)`, not a distinct error — because from the
        // caller's side all three mean the same thing: this link no longer
        // works. Distinguishing them in the response would only help an
        // attacker probe which case applies.
        if (!row || row.usedAt !== null || row.expiresAt.getTime() <= Date.now()) {
          return ok(null);
        }
        return ok(toDomain(row));
      } catch (error) {
        logger?.error({ err: error }, 'failed to look up the password reset token');
        return err(repository('Could not read the password reset token'));
      }
    },

    async markUsed(id: string, usedAt: Date): Promise<Result<void>> {
      try {
        await prisma.passwordResetToken.update({ where: { id }, data: { usedAt } });
        return ok(undefined);
      } catch (error) {
        logger?.error({ err: error }, 'failed to mark the password reset token used');
        return err(repository('Could not update the password reset token'));
      }
    },
  };
}
