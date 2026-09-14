import {
  err,
  ok,
  repository,
  type NewUser,
  type Result,
  type User,
  type UserRepository,
} from '@leetcamp/domain';

import type { PrismaClient } from './prisma-client.js';

/**
 * ORM-backed implementation of the `UserRepository` port (the `auth`
 * vertical's own port — see `packages/domain/src/entities/user-repository.ts`).
 *
 * NOT the same repository as `prisma-user-authorization-repository.ts`, which
 * the auth plugin reads on every request. Two ports over the same table, two
 * different reasons to change.
 */
export function createPrismaUserRepository(
  prisma: PrismaClient,
  logger?: { error: (obj: unknown, msg: string) => void },
): UserRepository {
  return {
    async findByEmail(email: string): Promise<Result<User | null>> {
      try {
        const row = await prisma.user.findFirst({ where: { email, deletedAt: null } });
        if (!row) return ok(null);
        return ok(toDomainUser(row));
      } catch (error) {
        logger?.error({ err: error }, 'failed to read the user by email');
        return err(repository('Could not read the user'));
      }
    },

    async findById(id: string): Promise<Result<User | null>> {
      try {
        const row = await prisma.user.findFirst({ where: { id, deletedAt: null } });
        if (!row) return ok(null);
        return ok(toDomainUser(row));
      } catch (error) {
        logger?.error({ err: error }, 'failed to read the user by id');
        return err(repository('Could not read the user'));
      }
    },

    async list(): Promise<Result<readonly User[]>> {
      try {
        const rows = await prisma.user.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        });
        return ok(rows.map(toDomainUser));
      } catch (error) {
        logger?.error({ err: error }, 'failed to list users');
        return err(repository('Could not list users'));
      }
    },

    async setActive(id: string, isActive: boolean): Promise<Result<User>> {
      try {
        const row = await prisma.user.update({
          where: { id },
          data: { status: isActive ? 'active' : 'inactive' },
        });
        return ok(toDomainUser(row));
      } catch (error) {
        logger?.error({ err: error }, 'failed to update the user status');
        return err(repository('Could not update the user'));
      }
    },

    async updatePasswordHash(id: string, passwordHash: string): Promise<Result<User>> {
      try {
        const row = await prisma.user.update({ where: { id }, data: { passwordHash } });
        return ok(toDomainUser(row));
      } catch (error) {
        logger?.error({ err: error }, 'failed to update the password hash');
        return err(repository('Could not update the password'));
      }
    },

    async create(user: NewUser & { id: string; createdAt: Date }): Promise<Result<User>> {
      try {
        const row = await prisma.user.create({
          data: {
            id: user.id,
            // Self-issued tokens: `sub` IS the application user id. See the
            // note on the `subject` column in schema.prisma.
            subject: user.id,
            email: user.email,
            passwordHash: user.passwordHash,
            displayName: user.displayName,
            roleId: user.roleId,
            timezone: user.timezone,
            scopeIds: [],
            createdAt: user.createdAt,
          },
        });
        return ok(toDomainUser(row));
      } catch (error) {
        // Race with another registration for the same email: `registerUser`
        // already checked `findByEmail` before calling this, so reaching the
        // database's unique constraint here means two requests landed at
        // once. Treated the same as any other repository failure rather than
        // narrowed to the ORM's specific error shape — see the note on
        // `no-restricted-imports` for why this file does not import
        // `@prisma/client` directly to inspect it.
        logger?.error({ err: error }, 'failed to create the user');
        return err(repository('Could not create the user'));
      }
    },
  };
}

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  roleId: number;
  timezone: string;
  status: string;
  deletedAt: Date | null;
  createdAt: Date;
}

function toDomainUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    displayName: row.displayName,
    roleId: row.roleId,
    timezone: row.timezone,
    isActive: row.status === 'active' && row.deletedAt === null,
    createdAt: row.createdAt,
  };
}
