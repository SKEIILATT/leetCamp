import type {
  Clock,
  IdGenerator,
  PasswordHasher,
  PasswordResetMailer,
  PasswordResetTokenRepository,
  UserRepository,
} from '@leetcamp/domain';

import { makeRequestPasswordReset } from './request-password-reset.js';
import { makeResetPassword } from './reset-password.js';

/**
 * The BUNDLE of the `passwordReset` vertical. Both use cases are PUBLIC
 * (unauthenticated) — see `auth`'s bundle for the same shape and reasoning:
 * a student who forgot their password, by definition, cannot present a
 * bearer token yet.
 */
export interface PasswordResetDeps {
  readonly userRepository: UserRepository;
  readonly passwordResetTokenRepository: PasswordResetTokenRepository;
  readonly passwordHasher: PasswordHasher;
  readonly mailer: PasswordResetMailer;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly frontendBaseUrl: string;
  readonly tokenTtlMinutes: number;
}

export function buildPasswordResetUseCases(deps: PasswordResetDeps) {
  return {
    requestPasswordReset: makeRequestPasswordReset(deps),
    resetPassword: makeResetPassword(deps),
  };
}

export type PasswordResetUseCases = ReturnType<typeof buildPasswordResetUseCases>;
