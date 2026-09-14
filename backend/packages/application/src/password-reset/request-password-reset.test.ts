import { describe, expect, it } from 'vitest';
import {
  err,
  ok,
  repository,
  ROLE_ID,
  type Clock,
  type PasswordResetMailer,
  type PasswordResetTokenRepository,
  type User,
  type UserRepository,
} from '@leetcamp/domain';

import { makeRequestPasswordReset } from './request-password-reset.js';

const clock: Clock = { now: () => new Date('2026-03-15T08:00:00Z'), timeZone: 'UTC' };

const student: User = {
  id: 'user-1',
  email: 'student@example.com',
  passwordHash: 'hash',
  displayName: 'Student',
  roleId: ROLE_ID.STUDENT,
  timezone: 'America/Guayaquil',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function deps(overrides: {
  userRepository?: Partial<UserRepository>;
  passwordResetTokenRepository?: Partial<PasswordResetTokenRepository>;
  mailer?: Partial<PasswordResetMailer>;
} = {}) {
  const userRepository: UserRepository = {
    findByEmail: async () => ok(student),
    findById: async () => ok(student),
    list: async () => ok([student]),
    setActive: async () => ok(student),
    updatePasswordHash: async () => ok(student),
    create: async () => ok(student),
    ...overrides.userRepository,
  };

  const passwordResetTokenRepository: PasswordResetTokenRepository = {
    create: async (entry) =>
      ok({
        id: entry.id,
        userId: entry.userId,
        expiresAt: entry.expiresAt,
        usedAt: null,
        createdAt: entry.createdAt,
      }),
    findValidByToken: async () => ok(null),
    markUsed: async () => ok(undefined),
    ...overrides.passwordResetTokenRepository,
  };

  const mailer: PasswordResetMailer = {
    sendResetLink: async () => ok(undefined),
    ...overrides.mailer,
  };

  return {
    userRepository,
    passwordResetTokenRepository,
    mailer,
    idGenerator: { generate: () => 'token-raw-1' },
    clock,
    frontendBaseUrl: 'http://localhost:4200',
    tokenTtlMinutes: 30,
  };
}

describe('requestPasswordReset', () => {
  it('creates a token and emails a reset link when the email is registered', async () => {
    let sentTo: string | undefined;
    let sentUrl: string | undefined;
    let createdExpiresAt: Date | undefined;

    const requestPasswordReset = makeRequestPasswordReset(
      deps({
        passwordResetTokenRepository: {
          create: async (entry) => {
            createdExpiresAt = entry.expiresAt;
            return ok({
              id: entry.id,
              userId: entry.userId,
              expiresAt: entry.expiresAt,
              usedAt: null,
              createdAt: entry.createdAt,
            });
          },
        },
        mailer: {
          sendResetLink: async (input) => {
            sentTo = input.email;
            sentUrl = input.resetUrl;
            return ok(undefined);
          },
        },
      }),
    );

    const result = await requestPasswordReset({ email: student.email });

    expect(result.ok).toBe(true);
    expect(sentTo).toBe(student.email);
    expect(sentUrl).toBe('http://localhost:4200/restablecer?token=token-raw-1');
    // 30 minutes after the clock's `now()`.
    expect(createdExpiresAt?.toISOString()).toBe('2026-03-15T08:30:00.000Z');
  });

  it('answers ok WITHOUT creating a token or sending mail when the email is not registered', async () => {
    let tokenCreated = false;
    let mailSent = false;

    const requestPasswordReset = makeRequestPasswordReset(
      deps({
        userRepository: { findByEmail: async () => ok(null) },
        passwordResetTokenRepository: {
          create: async (entry) => {
            tokenCreated = true;
            return ok({
              id: entry.id,
              userId: entry.userId,
              expiresAt: entry.expiresAt,
              usedAt: null,
              createdAt: entry.createdAt,
            });
          },
        },
        mailer: {
          sendResetLink: async () => {
            mailSent = true;
            return ok(undefined);
          },
        },
      }),
    );

    const result = await requestPasswordReset({ email: 'nobody@example.com' });

    // Same outcome as a registered email — an account-enumeration oracle is
    // worse than a less specific response. See the use case's doc comment.
    expect(result.ok).toBe(true);
    expect(tokenCreated).toBe(false);
    expect(mailSent).toBe(false);
  });

  it('propagates a repository failure from the email lookup', async () => {
    const requestPasswordReset = makeRequestPasswordReset(
      deps({ userRepository: { findByEmail: async () => err(repository('connection refused')) } }),
    );

    const result = await requestPasswordReset({ email: student.email });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });
});
