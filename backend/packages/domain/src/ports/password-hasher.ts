/**
 * Port for hashing and verifying passwords.
 *
 * Declared as a port, not called directly with a library, for the same reason
 * as `Clock`: the concrete algorithm is an infrastructure detail, and the
 * application layer must stay testable without pulling in whatever hashing
 * library the adapter happens to use.
 *
 * The domain never sees a plaintext password outside of these two calls —
 * hashing happens at registration, verification at login, and the hash is the
 * only form of the password that ever reaches a repository.
 */
export interface PasswordHasher {
  /** Hash a plaintext password. The result is what gets stored. */
  hash(plainPassword: string): Promise<string>;

  /**
   * Compare a plaintext password against a stored hash.
   *
   * Returns a boolean, not a `Result`: a password that does not match is not a
   * failure of this operation, it is the answer. The caller (the `loginUser`
   * use case) is what turns `false` into `invalidCredentials()`.
   */
  verify(plainPassword: string, passwordHash: string): Promise<boolean>;
}
