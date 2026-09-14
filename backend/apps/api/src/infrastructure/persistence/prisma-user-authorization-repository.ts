import {
  err,
  ok,
  repository,
  type AuthorizationProfile,
  type Result,
  type UserAuthorizationRepository,
} from '@leetcamp/domain';

import type { PrismaClient } from './prisma-client.js';

/**
 * ORM-backed implementation of the authorization port.
 *
 * ⚠ SKELETON: it matches the `User` model in `prisma/schema.prisma`, which is
 * itself a starting point. Adjust the query to your real schema; do NOT adjust
 * the port to match your schema.
 *
 * ── THE THREE THINGS THIS ADAPTER IS RESPONSIBLE FOR ─────────────────────────
 *
 *  1. QUERYING BY THE RIGHT COLUMN. `where: { subject }`, never `where: { id }`.
 *     The token's `sub` is the identity provider's id and lives in its own
 *     column. Using `id` throws no error — it just finds nothing, and every user
 *     stops resolving their role while their token stays valid.
 *
 *  2. KEEPING "not found" AND "database failed" APART. `ok(null)` and `err(...)`
 *     are different answers on purpose, because upstream they become a 401 and a
 *     500 respectively. Collapsing a connection failure into `null` would sign
 *     every user out during a database incident.
 *
 *  3. TRANSLATING, NOT FORWARDING. The caught error is logged, never embedded in
 *     the `DomainError` message. A raw driver error carries the host, the user
 *     and sometimes the connection string, and domain messages are sent to the
 *     client verbatim.
 */
export function createPrismaUserAuthorizationRepository(
  prisma: PrismaClient,
  logger?: { error: (obj: unknown, msg: string) => void },
): UserAuthorizationRepository {
  return {
    async findActiveProfileBySubject(
      subject: string,
    ): Promise<Result<AuthorizationProfile | null>> {
      try {
        const row = await prisma.user.findFirst({
          where: {
            subject,
            // Both conditions belong in the QUERY and not in a post-filter: an
            // inactive user must never be loaded in the first place, and a
            // forgotten `if` after the fact is how a deactivated account keeps
            // working.
            status: 'active',
            deletedAt: null,
          },
          select: { id: true, displayName: true, roleId: true, scopeIds: true },
        });

        if (!row) return ok(null);

        return ok({
          userId: row.id,
          displayName: row.displayName,
          roleId: row.roleId,
          scopeIds: row.scopeIds,
        });
      } catch (error) {
        logger?.error({ err: error }, 'failed to read the authorization profile');
        // Generic message: it reaches the client through the error envelope.
        return err(repository('Could not read the authorization profile'));
      }
    },
  };
}
