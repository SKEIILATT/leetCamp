import { describe, expect, it } from 'vitest';
import {
  err,
  ok,
  repository,
  ROLE_ID,
  type Clock,
  type IdGenerator,
  type NewUser,
  type PasswordHasher,
  type Result,
  type User,
  type UserRepository,
} from '@leetcamp/domain';

import { makeRegisterUser } from './register-user.js';

/**
 * Plain object-literal fakes, same style as `authenticate.test.ts` — no
 * mocking library, so nothing here can assert on a call the port does not
 * actually promise.
 */

const fixedClock: Clock = { now: () => new Date('2026-03-15T08:00:00Z'), timeZone: 'UTC' };
const sequentialIds = (): IdGenerator => {
  let n = 0;
  return { generate: () => `id-${++n}` };
};

const existingUser: User = {
  id: 'user-1',
  email: 'taken@example.com',
  passwordHash: 'irrelevant',
  displayName: 'Taken',
  roleId: ROLE_ID.STUDENT,
  timezone: 'UTC',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function fakeRepository(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    findByEmail: async () => ok(null),
    findById: async () => ok(null),
    create: async (user: NewUser & { id: string; createdAt: Date }) =>
      ok({ ...user, isActive: true }),
    ...overrides,
  };
}

const hasher: PasswordHasher = {
  hash: async (plain) => `hashed(${plain})`,
  verify: async () => {
    throw new Error('registerUser must never verify a password');
  },
};

describe('registerUser', () => {
  it('creates a student account and returns its id', async () => {
    const registerUser = makeRegisterUser({
      userRepository: fakeRepository(),
      passwordHasher: hasher,
      idGenerator: sequentialIds(),
      clock: fixedClock,
    });

    const result = await registerUser({
      email: 'new@example.com',
      password: 'correct horse battery staple',
      displayName: 'New Student',
      timezone: 'America/Guayaquil',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.userId).toBe('id-1');
  });

  /**
   * THE bundle-surface property this use case is responsible for: nothing a
   * caller sends can make this create an admin. See the note on
   * `buildAuthUseCases`.
   */
  it('always assigns ROLE_ID.STUDENT, regardless of input', async () => {
    let createdRoleId: number | undefined;

    const registerUser = makeRegisterUser({
      userRepository: fakeRepository({
        create: async (user) => {
          createdRoleId = user.roleId;
          return ok({ ...user, isActive: true });
        },
      }),
      passwordHasher: hasher,
      idGenerator: sequentialIds(),
      clock: fixedClock,
    });

    await registerUser({
      email: 'new@example.com',
      password: 'correct horse battery staple',
      displayName: 'New Student',
      timezone: 'UTC',
    });

    expect(createdRoleId).toBe(ROLE_ID.STUDENT);
  });

  it('rejects a duplicate email with CONFLICT, without hashing or creating', async () => {
    let createCalled = false;

    const registerUser = makeRegisterUser({
      userRepository: fakeRepository({
        findByEmail: async () => ok(existingUser),
        create: async () => {
          createCalled = true;
          return ok(existingUser);
        },
      }),
      passwordHasher: {
        hash: async () => {
          throw new Error('a duplicate email must short-circuit before hashing');
        },
        verify: hasher.verify,
      },
      idGenerator: sequentialIds(),
      clock: fixedClock,
    });

    const result = await registerUser({
      email: existingUser.email,
      password: 'whatever',
      displayName: 'Someone',
      timezone: 'UTC',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('CONFLICT');
    expect(createCalled).toBe(false);
  });

  it('propagates a repository failure from the email lookup', async () => {
    const registerUser = makeRegisterUser({
      userRepository: fakeRepository({
        findByEmail: async (): Promise<Result<User | null>> => err(repository('connection refused')),
      }),
      passwordHasher: hasher,
      idGenerator: sequentialIds(),
      clock: fixedClock,
    });

    const result = await registerUser({
      email: 'new@example.com',
      password: 'whatever',
      displayName: 'Someone',
      timezone: 'UTC',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });
});
