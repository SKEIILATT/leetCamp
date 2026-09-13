import type { UserRepository } from '@leetcamp/domain';

import { makeListUsers } from './list-users.js';
import { makeSetUserActive } from './set-user-active.js';

/**
 * The BUNDLE of the `adminUsers` vertical — admin-only, same enforcement
 * pattern as `challenges`/`dailyChallenges`: `app.requireRole(ROLE_ID.ADMIN)`
 * at the route, not anything in this bundle.
 */
export interface AdminUsersDeps {
  readonly userRepository: UserRepository;
}

export function buildAdminUsersUseCases(deps: AdminUsersDeps) {
  return {
    listUsers: makeListUsers(deps),
    setUserActive: makeSetUserActive(deps),
  };
}

export type AdminUsersUseCases = ReturnType<typeof buildAdminUsersUseCases>;
