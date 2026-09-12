import type { Clock, IdGenerator, PasswordHasher, TokenIssuer, UserRepository } from '@leetcamp/domain';

import { makeLoginUser } from './login-user.js';
import { makeRegisterUser } from './register-user.js';

/**
 * The BUNDLE of the `auth` vertical.
 *
 * ⚠ THE BUNDLE'S SURFACE IS A SECURITY DECISION. `registerUser` only ever
 * assigns `ROLE_ID.STUDENT` (see `register-user.ts`) — there is no use case
 * here that can mint an admin. Promoting a user to admin is a separate,
 * deliberately unexported operation (an admin-only route, once one exists),
 * not a parameter on registration.
 */
export interface AuthDeps {
  readonly userRepository: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly tokenIssuer: TokenIssuer;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export function buildAuthUseCases(deps: AuthDeps) {
  return {
    registerUser: makeRegisterUser(deps),
    loginUser: makeLoginUser(deps),
  };
}

export type AuthUseCases = ReturnType<typeof buildAuthUseCases>;
