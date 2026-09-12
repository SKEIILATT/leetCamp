/**
 * The registered account. This is the aggregate `register-user` creates and
 * `login-user` reads — NOT the same thing as `AuthorizationProfile`
 * (`../ports/user-authorization-repository.ts`), which is the thin, per-request
 * projection the auth plugin reads on every call. Two different readers, two
 * different shapes: the plugin has no business loading `passwordHash` on every
 * authenticated request.
 */
export interface User {
  readonly id: string;
  readonly email: string;
  /** Never a plaintext password — see `../ports/password-hasher.ts`. */
  readonly passwordHash: string;
  /** Public name shown on the ranking, deliberately separate from `email`. */
  readonly displayName: string;
  readonly roleId: number;
  /** IANA time zone, e.g. `America/Guayaquil` — where THIS user's day starts,
   * for streak cut-off. Per-user, not global: see docs/DECISIONS.md. */
  readonly timezone: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

/** Fields `registerUser` needs to create one. `id` and `createdAt` are
 * assigned by the use case (via `IdGenerator` / `Clock`), never by the caller. */
export interface NewUser {
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly roleId: number;
  readonly timezone: string;
}
