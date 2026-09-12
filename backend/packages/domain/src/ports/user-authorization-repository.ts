import type { Result } from '../result.js';

/**
 * What the database knows TODAY about what a user may do. This is layer 2 of
 * the identity model (see `../identity.ts`): the token says who you are, this
 * says what you may do right now.
 */
export interface AuthorizationProfile {
  /** Application user id — NOT the token's `sub`. */
  readonly userId: string;
  /** Raw `role_id`, untranslated. Translation belongs to `roles.ts`. */
  readonly roleId: number;
  /** Tenants / organizations / sites in scope. See `RequestIdentity.scopeIds`. */
  readonly scopeIds: readonly string[];
}

/**
 * Read port for the authorization profile.
 *
 * The domain declares the capability; the concrete implementation lives in
 * `apps/api/src/infrastructure/persistence/`.
 */
export interface UserAuthorizationRepository {
  /**
   * Find the authorization profile of an ACTIVE user by authentication subject
   * (the token's `sub` claim).
   *
   * ⚠ The query is `WHERE subject_column = $1`, NEVER `WHERE id = $1`. See the
   * warning on `RequestIdentity.subject`.
   *
   * THREE distinct outcomes, and the difference is load-bearing:
   *
   *   - `ok(profile)` — exists, not soft-deleted, active.
   *   - `ok(null)`    — does NOT exist, or is soft-deleted, or is not active.
   *                     A legitimate answer, not a failure: the caller turns it
   *                     into a rejection.
   *   - `err(...)`    — the database failed. NOT the same as "does not exist",
   *                     which is why it is not collapsed into `null`: a Postgres
   *                     outage must never end up answering 401, because that
   *                     would make the frontend log everybody out over an
   *                     infrastructure incident.
   */
  findActiveProfileBySubject(subject: string): Promise<Result<AuthorizationProfile | null>>;
}
