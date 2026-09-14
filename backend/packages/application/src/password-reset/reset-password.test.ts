import { describe, expect, it } from 'vitest';
import {
  err,
  ok,
  repository,
  ROLE_ID,
  type Clock,
  type PasswordHasher,
  type PasswordResetToken,
  type PasswordResetTokenRepository,
  type User,
  type UserRepository,
} from '@leetcamp/domain';

import { makeResetPassword } from './reset-password.js';

const clock: Clock = { now: () => new Date('2026-03-15T08:00:00Z'), timeZone: 'UTC' };

const student: User = {
  id: 'user-1',
  email: 'student@example.com',
  passwordHash: 'old-hash',
  displayName: 'Student',
  roleId: ROLE_ID.STUDENT,
  timezone: 'America/Guayaquil',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const validToken: PasswordResetToken = {
  id: 'reset-token-1',
  userId: student.id,
  expiresAt: new Date('2026-03-15T08:30:00Z'),
  usedAt: null,
  createdAt: new Date('2026-03-15T08:00:00Z'),
};

function deps(overrides: {
  passwordResetTokenRepository?: Partial<PasswordResetTokenRepository>;
  userRepository?: Partial<UserRepository>;
  passwordHasher?: Partial<PasswordHasher>;
} = {}) {
  const passwordResetTokenRepository: PasswordResetTokenRepository = {
    create: async (entry) =>
      ok({ id: entry.id, userId: entry.userId, expiresAt: entry.expiresAt, usedAt: null, createdAt: entry.createdAt }),
    findValidByToken: async () => ok(validToken),
    markUsed: async () => ok(undefined),
    ...overrides.passwordResetTokenRepository,
  };

  const userRepository: UserRepository = {
    findByEmail: async () => ok(student),
    findById: async () => ok(student),
    list: async () => ok([student]),
    setActive: async () => ok(student),
    updatePasswordHash: async (id, passwordHash) => ok({ ...student, id, passwordHash }),
    create: async () => ok(student),
    ...overrides.userRepository,
  };

  const passwordHasher: PasswordHasher = {
    hash: async (plain) => `hashed(${plain})`,
    verify: async () => true,
    ...overrides.passwordHasher,
  };

  return { passwordResetTokenRepository, userRepository, passwordHasher, clock };
}

describe('resetPassword', () => {
  it('hashes the new password, updates the account, and marks the token used', async () => {
    let updatedUserId: string | undefined;
    let updatedHash: string | undefined;
    let markedUsedId: string | undefined;

    const resetPassword = makeResetPassword(
      deps({
        userRepository: {
          updatePasswordHash: async (id, passwordHash) => {
            updatedUserId = id;
            updatedHash = passwordHash;
            return ok({ ...student, id, passwordHash });
          },
        },
        passwordResetTokenRepository: {
          markUsed: async (id) => {
            markedUsedId = id;
            return ok(undefined);
          },
        },
      }),
    );

    const result = await resetPassword({ token: 'raw-token', newPassword: 'new-strong-password' });

    expect(result.ok).toBe(true);
    expect(updatedUserId).toBe(student.id);
    expect(updatedHash).toBe('hashed(new-strong-password)');
    expect(markedUsedId).toBe(validToken.id);
  });

  it('rejects with NOT_FOUND when the token is invalid, expired, or already used', async () => {
    const resetPassword = makeResetPassword(
      deps({ passwordResetTokenRepository: { findValidByToken: async () => ok(null) } }),
    );

    const result = await resetPassword({ token: 'stale-token', newPassword: 'new-strong-password' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('does not mark the token used if the password write fails', async () => {
    let markedUsed = false;

    const resetPassword = makeResetPassword(
      deps({
        userRepository: { updatePasswordHash: async () => err(repository('connection refused')) },
        passwordResetTokenRepository: {
          markUsed: async () => {
            markedUsed = true;
            return ok(undefined);
          },
        },
      }),
    );

    const result = await resetPassword({ token: 'raw-token', newPassword: 'new-strong-password' });

    expect(result.ok).toBe(false);
    expect(markedUsed).toBe(false);
  });

  it('propagates a repository failure from the token lookup', async () => {
    const resetPassword = makeResetPassword(
      deps({ passwordResetTokenRepository: { findValidByToken: async () => err(repository('connection refused')) } }),
    );

    const result = await resetPassword({ token: 'raw-token', newPassword: 'new-strong-password' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });
});
