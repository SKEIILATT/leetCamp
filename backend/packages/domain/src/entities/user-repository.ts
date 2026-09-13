import type { Result } from '../result.js';
import type { NewUser, User } from './user.js';

/**
 * Write/read port for the `User` aggregate itself — NOT the same port as
 * `../ports/user-authorization-repository.ts`, which the auth plugin reads on
 * every request. This one is consumed only by the `auth` vertical's use cases
 * (`registerUser`, `loginUser`), which is why it lives next to the entity
 * instead of in the cross-cutting `ports/` folder — see the note at the top of
 * `../index.ts` on why repository ports are not all grouped there.
 */
export interface UserRepository {
  /** `null` when no account has this email — a legitimate answer, not a
   * failure. `email` must already be normalised (trimmed, lower-cased) by the
   * caller — the HTTP layer's Zod schema does this, once, at the boundary,
   * instead of every adapter re-implementing the same `.toLowerCase()`. */
  findByEmail(email: string): Promise<Result<User | null>>;

  /** Added for the `attempts` vertical: `submitAttempt` needs the caller's
   * `timezone` to compute their LOCAL calendar date for the streak — that
   * field is never in the JWT or `RequestIdentity`, on purpose (see
   * `RequestIdentity`), so it has to be read from here. */
  findById(id: string): Promise<Result<User | null>>;

  /**
   * Creates the account. Fails with `CONFLICT` if the email is already taken
   * — checked again at the database's unique constraint, not only in the use
   * case, to close the race between two concurrent registrations with the
   * same email.
   */
  create(user: NewUser & { id: string; createdAt: Date }): Promise<Result<User>>;
}
