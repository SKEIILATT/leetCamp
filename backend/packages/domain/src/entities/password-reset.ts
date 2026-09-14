import type { Result } from '../result.js';

/**
 * One issued "forgot your password" link. The RAW token never lives here or
 * anywhere in the database — see `PasswordResetTokenRepository`'s note — this
 * type is what the use cases reason about once a raw token has already been
 * matched to a row.
 */
export interface PasswordResetToken {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  /** `null` until `markUsed` — a token is single-use, checked by
   * `findValidByToken` alongside expiry. */
  readonly usedAt: Date | null;
  readonly createdAt: Date;
}

export interface NewPasswordResetToken {
  readonly userId: string;
  /** The RAW token, exactly as it will be emailed to the student. The
   * repository is responsible for hashing it before it ever touches storage
   * — see the interface's header note. */
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * ⚠ THE RAW TOKEN IS NEVER STORED, ONLY ITS HASH. A reset token is a bearer
 * credential exactly like a session token: whoever holds it can set a new
 * password for that account without knowing the old one. A database leak
 * (a backup, a misconfigured replica) must not hand out currently-valid
 * "log in as anyone" links — hashing it the same way a password would be
 * hashed removes that risk. Unlike a password, brute-forcing a
 * high-entropy random token is infeasible regardless of hash speed, so the
 * adapter is free to use a fast cryptographic hash rather than something
 * memory-hard like `PasswordHasher` — that choice belongs entirely to the
 * adapter, not to this port or to the use cases that call it.
 */
export interface PasswordResetTokenRepository {
  create(
    entry: NewPasswordResetToken & { id: string; createdAt: Date },
  ): Promise<Result<PasswordResetToken>>;

  /** Looks up by the RAW token. Returns `ok(null)` — not an error — for a
   * token that does not exist, has expired, or was already used: all three
   * are "this link no longer works", not a repository failure. */
  findValidByToken(token: string): Promise<Result<PasswordResetToken | null>>;

  /** Marks the token consumed so it cannot be replayed even if the email
   * that carried it is later compromised. */
  markUsed(id: string, usedAt: Date): Promise<Result<void>>;
}
