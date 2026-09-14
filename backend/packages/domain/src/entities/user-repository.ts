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

  /** Added for the `adminUsers` vertical. All accounts, no pagination — fine
   * at this project's scale (30-100 students, see docs/DECISIONS.md);
   * revisit before this matters at a bootcamp ten times the size. */
  list(): Promise<Result<readonly User[]>>;

  /** Flips `status` between `active`/`inactive`. Deactivating someone with a
   * live session does not revoke their JWT (self-issued tokens cannot be
   * revoked before they expire) — it takes effect on their NEXT
   * authenticated request, where `UserAuthorizationRepository` finds no
   * active profile and `resolveIdentity` answers 401. That is a real, if
   * short, window — acceptable for this project's threat model, not
   * something this port silently promises to close. */
  setActive(id: string, isActive: boolean): Promise<Result<User>>;

  /** Added for the `passwordReset` vertical: `resetPassword` overwrites the
   * hash directly — there is no "old password" check here, because knowing
   * the reset token (proven by whoever calls this) already established the
   * caller's right to set a new one. */
  updatePasswordHash(id: string, passwordHash: string): Promise<Result<User>>;
}
