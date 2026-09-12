import {
  emailAlreadyRegistered,
  err,
  ok,
  ROLE_ID,
  type Clock,
  type IdGenerator,
  type PasswordHasher,
  type Result,
  type UserRepository,
} from '@leetcamp/domain';

export interface RegisterUserDeps {
  readonly userRepository: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export interface RegisterUserInput {
  /** Already normalised (trimmed, lower-cased) by the HTTP layer's Zod schema. */
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly timezone: string;
}

export interface RegisterUserOutput {
  readonly userId: string;
}

export function makeRegisterUser(
  deps: RegisterUserDeps,
): (input: RegisterUserInput) => Promise<Result<RegisterUserOutput>> {
  return async (input) => {
    // Checked here first so the common case (a duplicate email) never pays for
    // a password hash it will throw away. The database's unique constraint on
    // `email` is still what actually closes the race between two concurrent
    // registrations — this check only makes the ordinary case fast and its
    // error message specific.
    const existing = await deps.userRepository.findByEmail(input.email);
    if (!existing.ok) return err(existing.error);
    if (existing.value !== null) return err(emailAlreadyRegistered(input.email));

    const passwordHash = await deps.passwordHasher.hash(input.password);

    const created = await deps.userRepository.create({
      id: deps.idGenerator.generate(),
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      timezone: input.timezone,
      // Every self-registration is a student. Nothing in this bundle can
      // create an admin — see the note on `buildAuthUseCases` about what a
      // bundle's surface means.
      roleId: ROLE_ID.STUDENT,
      createdAt: deps.clock.now(),
    });
    if (!created.ok) return err(created.error);

    return ok({ userId: created.value.id });
  };
}
