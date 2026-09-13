import { describe, expect, it } from 'vitest';
import { err, ok, repository, ROLE_ID, type User, type UserRepository } from '@leetcamp/domain';

import { makeSetUserActive } from './set-user-active.js';

const admin: User = {
  id: 'admin-1',
  email: 'admin@example.com',
  passwordHash: 'hash',
  displayName: 'Admin',
  roleId: ROLE_ID.ADMIN,
  timezone: 'UTC',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const target: User = { ...admin, id: 'user-2', roleId: ROLE_ID.STUDENT, email: 'student@example.com' };

function fakeRepository(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    findByEmail: async () => ok(null),
    findById: async () => ok(target),
    list: async () => ok([target]),
    setActive: async (id, isActive) => ok({ ...target, id, isActive }),
    create: async () => ok(target),
    ...overrides,
  };
}

describe('setUserActive', () => {
  it('deactivates another user', async () => {
    const setUserActive = makeSetUserActive({ userRepository: fakeRepository() });

    const result = await setUserActive({
      actingAdminId: admin.id,
      targetUserId: target.id,
      isActive: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.isActive).toBe(false);
    // Never leaked, structurally — see AdminUserView.
    expect(result.value).not.toHaveProperty('passwordHash');
  });

  it('rejects an admin deactivating their own account, without writing', async () => {
    let setActiveCalled = false;

    const setUserActive = makeSetUserActive({
      userRepository: fakeRepository({
        findById: async () => ok(admin),
        setActive: async (id, isActive) => {
          setActiveCalled = true;
          return ok({ ...admin, id, isActive });
        },
      }),
    });

    const result = await setUserActive({
      actingAdminId: admin.id,
      targetUserId: admin.id,
      isActive: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('FORBIDDEN');
    expect(setActiveCalled).toBe(false);
  });

  it('allows an admin to REactivate their own account (only deactivation is blocked)', async () => {
    const setUserActive = makeSetUserActive({
      userRepository: fakeRepository({ findById: async () => ok({ ...admin, isActive: false }) }),
    });

    const result = await setUserActive({
      actingAdminId: admin.id,
      targetUserId: admin.id,
      isActive: true,
    });

    expect(result.ok).toBe(true);
  });

  it('rejects an unknown target with NOT_FOUND', async () => {
    const setUserActive = makeSetUserActive({
      userRepository: fakeRepository({ findById: async () => ok(null) }),
    });

    const result = await setUserActive({
      actingAdminId: admin.id,
      targetUserId: 'missing',
      isActive: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('propagates a repository failure from the lookup', async () => {
    const setUserActive = makeSetUserActive({
      userRepository: fakeRepository({ findById: async () => err(repository('connection refused')) }),
    });

    const result = await setUserActive({
      actingAdminId: admin.id,
      targetUserId: target.id,
      isActive: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });
});
