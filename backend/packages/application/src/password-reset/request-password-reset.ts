import {
  err,
  ok,
  type Clock,
  type IdGenerator,
  type PasswordResetMailer,
  type PasswordResetTokenRepository,
  type Result,
  type UserRepository,
} from '@leetcamp/domain';

export interface RequestPasswordResetDeps {
  readonly userRepository: UserRepository;
  readonly passwordResetTokenRepository: PasswordResetTokenRepository;
  readonly mailer: PasswordResetMailer;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** No trailing slash — see the env schema's `FRONTEND_BASE_URL`. */
  readonly frontendBaseUrl: string;
  readonly tokenTtlMinutes: number;
}

export interface RequestPasswordResetInput {
  /** Already normalised (trimmed, lower-cased) by the HTTP layer's Zod schema
   * — same convention `loginUser`/`registerUser` already follow. */
  readonly email: string;
}

/**
 * Issues a reset link for the given email, IF an account with that email
 * exists.
 *
 * ⚠ ALWAYS SUCCEEDS, even when the email matches no account. Answering
 * differently ("no account with that email") turns this endpoint into an
 * account-enumeration oracle — the same reasoning `loginUser` already
 * applies with its one generic "invalid credentials" message, applied here to
 * a request that has no legitimate reason to reveal whether an email is
 * registered.
 */
export function makeRequestPasswordReset(
  deps: RequestPasswordResetDeps,
): (input: RequestPasswordResetInput) => Promise<Result<void>> {
  return async (input) => {
    const user = await deps.userRepository.findByEmail(input.email);
    if (!user.ok) return err(user.error);

    if (user.value === null) {
      return ok(undefined);
    }

    // A UUID has 122 bits of randomness — plenty for a bearer token that
    // also expires shortly and is single-use. Reusing `IdGenerator` avoids
    // introducing a second "generate me some randomness" port for the same
    // underlying guarantee.
    const rawToken = deps.idGenerator.generate();
    const now = deps.clock.now();
    const expiresAt = new Date(now.getTime() + deps.tokenTtlMinutes * 60_000);

    const created = await deps.passwordResetTokenRepository.create({
      id: deps.idGenerator.generate(),
      userId: user.value.id,
      token: rawToken,
      expiresAt,
      createdAt: now,
    });
    if (!created.ok) return err(created.error);

    const resetUrl = `${deps.frontendBaseUrl}/restablecer?token=${rawToken}`;

    const sent = await deps.mailer.sendResetLink({ email: user.value.email, resetUrl });
    if (!sent.ok) return err(sent.error);

    return ok(undefined);
  };
}
