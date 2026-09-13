import { describe, expect, it } from 'vitest';
import { err, ok, repository, ROLE_ID, type TokenIssuer, type User, type UserRepository } from '@leetcamp/domain';

import { makeLoginUser } from './login-user.js';

const activeUser: User = {
  id: 'user-1',
  email: 'student@example.com',
  passwordHash: 'stored-hash',
  displayName: 'Student',
  roleId: ROLE_ID.STUDENT,
  timezone: 'UTC',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const neverIssues: TokenIssuer = {
  issueToken: async () => {
    throw new Error('a rejected login must never issue a token');
  },
};

/** `findById` is unused by `loginUser` — present only to satisfy the port. */
function fakeUserRepository(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    findByEmail: async () => ok(activeUser),
    findById: async () => ok(activeUser),
    create: async () => ok(activeUser),
    ...overrides,
  };
}

describe('loginUser', () => {
  it('issues a token when the password matches', async () => {
    let issuedFor: string | undefined;

    const loginUser = makeLoginUser({
      userRepository: fakeUserRepository(),
      passwordHasher: { hash: async () => 'x', verify: async () => true },
      tokenIssuer: {
        issueToken: async (identity) => {
          issuedFor = identity.subject;
          return { token: 'signed.jwt.token', expiresAt: new Date('2026-03-16T08:00:00Z') };
        },
      },
    });

    const result = await loginUser({ email: activeUser.email, password: 'correct' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.token).toBe('signed.jwt.token');
    // The token's subject is the APPLICATION user id — self-issued, no
    // external identity provider introducing a second id.
    expect(issuedFor).toBe(activeUser.id);
  });

  it('rejects an unknown email with the SAME message as a wrong password', async () => {
    const loginUser = makeLoginUser({
      userRepository: fakeUserRepository({ findByEmail: async () => ok(null) }),
      passwordHasher: {
        hash: async () => 'x',
        verify: async () => {
          throw new Error('must not verify a password when there is no user to check it against');
        },
      },
      tokenIssuer: neverIssues,
    });

    const result = await loginUser({ email: 'nobody@example.com', password: 'whatever' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('UNAUTHENTICATED');
    expect(result.error.message).toBe('Invalid email or password');
  });

  it('rejects a wrong password without issuing a token', async () => {
    const loginUser = makeLoginUser({
      userRepository: fakeUserRepository(),
      passwordHasher: { hash: async () => 'x', verify: async () => false },
      tokenIssuer: neverIssues,
    });

    const result = await loginUser({ email: activeUser.email, password: 'wrong' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.message).toBe('Invalid email or password');
  });

  it('rejects a deactivated account with the same message, not a distinct one', async () => {
    const inactiveUser: User = { ...activeUser, isActive: false };

    const loginUser = makeLoginUser({
      userRepository: fakeUserRepository({ findByEmail: async () => ok(inactiveUser) }),
      passwordHasher: {
        hash: async () => 'x',
        verify: async () => {
          throw new Error('must not verify a password for an already-rejected account');
        },
      },
      tokenIssuer: neverIssues,
    });

    const result = await loginUser({ email: inactiveUser.email, password: 'correct' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.message).toBe('Invalid email or password');
  });

  it('propagates a repository failure instead of turning it into invalid credentials', async () => {
    const loginUser = makeLoginUser({
      userRepository: fakeUserRepository({
        findByEmail: async () => err(repository('connection refused')),
      }),
      passwordHasher: { hash: async () => 'x', verify: async () => true },
      tokenIssuer: neverIssues,
    });

    const result = await loginUser({ email: activeUser.email, password: 'whatever' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });
});
