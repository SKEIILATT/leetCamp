import {
  err,
  invalidCredentials,
  ok,
  type PasswordHasher,
  type Result,
  type TokenIssuer,
  type UserRepository,
} from '@leetcamp/domain';

export interface LoginUserDeps {
  readonly userRepository: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly tokenIssuer: TokenIssuer;
}

export interface LoginUserInput {
  /** Already normalised (trimmed, lower-cased) by the HTTP layer's Zod schema. */
  readonly email: string;
  readonly password: string;
}

export interface LoginUserOutput {
  readonly token: string;
  readonly expiresAt: Date;
}

export function makeLoginUser(
  deps: LoginUserDeps,
): (input: LoginUserInput) => Promise<Result<LoginUserOutput>> {
  return async (input) => {
    const found = await deps.userRepository.findByEmail(input.email);
    if (!found.ok) return err(found.error);

    const user = found.value;

    // ⚠ ONE FAILURE PATH FOR "no such email", "wrong password" AND "account
    // deactivated". Branching earlier for any of the three turns this endpoint
    // into an oracle a client could use to tell which emails have an account —
    // see `invalidCredentials()` for the same reasoning.
    if (user === null || !user.isActive) return err(invalidCredentials());

    const passwordMatches = await deps.passwordHasher.verify(input.password, user.passwordHash);
    if (!passwordMatches) return err(invalidCredentials());

    const issued = await deps.tokenIssuer.issueToken({ subject: user.id, email: user.email });

    return ok({ token: issued.token, expiresAt: issued.expiresAt });
  };
}
