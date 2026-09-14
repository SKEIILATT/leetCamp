import {
  err,
  notFound,
  ok,
  type Clock,
  type PasswordHasher,
  type PasswordResetTokenRepository,
  type Result,
  type UserRepository,
} from '@leetcamp/domain';

export interface ResetPasswordDeps {
  readonly passwordResetTokenRepository: PasswordResetTokenRepository;
  readonly userRepository: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly clock: Clock;
}

export interface ResetPasswordInput {
  readonly token: string;
  readonly newPassword: string;
}

export function makeResetPassword(
  deps: ResetPasswordDeps,
): (input: ResetPasswordInput) => Promise<Result<void>> {
  return async (input) => {
    const found = await deps.passwordResetTokenRepository.findValidByToken(input.token);
    if (!found.ok) return err(found.error);
    if (found.value === null) {
      // Covers "does not exist", "expired" and "already used" alike — see
      // `PasswordResetTokenRepository.findValidByToken`'s doc comment for why
      // those three collapse into the same answer here.
      return err(notFound('This password reset link is invalid or has expired'));
    }

    const passwordHash = await deps.passwordHasher.hash(input.newPassword);

    const updated = await deps.userRepository.updatePasswordHash(found.value.userId, passwordHash);
    if (!updated.ok) return err(updated.error);

    // Marked used AFTER the password write succeeds, not before: if the
    // password write failed, the student should be able to try the same
    // link again rather than being locked out by a token that "used itself"
    // on a failed attempt.
    const marked = await deps.passwordResetTokenRepository.markUsed(found.value.id, deps.clock.now());
    if (!marked.ok) return err(marked.error);

    return ok(undefined);
  };
}
