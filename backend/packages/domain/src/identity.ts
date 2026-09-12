import type { Role } from './roles.js';

/**
 * The COMPOSED identity of the caller: who you are (layer 1) PLUS what you may
 * do right now (layer 2). This is what the HTTP layer exposes as
 * `request.identity`.
 *
 * ── TWO-LAYER IDENTITY MODEL — read before touching this type ────────────────
 *
 *   1. `TokenVerifier` (port, `ports/token-verifier.ts`) verifies the
 *      credential and returns `VerifiedIdentity { subject, email? }`.
 *      Cryptography, not business. It carries NO role, and no role gets added:
 *      a role claim baked into a token goes stale the moment someone changes
 *      that user's role, and stays valid until the token expires. That is
 *      authorization with an arbitrary delay.
 *   2. `UserAuthorizationRepository` (port) takes the verified subject and
 *      reads the role and scopes from the database. Always fresh.
 *
 * `RequestIdentity` is the composition of both. No endpoint ever accepts a
 * `userId`, a `roleId` or a scope from the body or the query string: it always
 * comes from here.
 */
export interface RequestIdentity {
  /**
   * The APPLICATION user id — the key every business table joins on.
   */
  readonly userId: string;

  /**
   * The AUTHENTICATION subject: the `sub` claim of the verified token.
   *
   * ⚠ GOTCHA WORTH THE EXTRA FIELD: `sub` is usually NOT the application user
   * id. It is the identity-provider's id, which the application table stores in
   * a separate column. Looking the profile up with `WHERE id = sub` throws no
   * error — it simply finds nothing, and EVERY user stops resolving their role
   * while their token stays cryptographically valid. The two ids live here
   * separately so nobody can conflate them again.
   */
  readonly subject: string;

  readonly email?: string;

  /** Raw `role_id`, untranslated. This is what `requireRole(...)` compares. */
  readonly roleId: number;

  /** The functional role derived from `roleId` through the `roles.ts` catalogue. */
  readonly role: Role;

  /**
   * Ids of the tenants / organizations / sites this user can reach.
   *
   * An array of IDS, not of entities, on purpose: scope checks need a
   * membership test, not a hydrated object. Dragging full entities through the
   * HTTP layer would mean loading them on every authenticated request for
   * nothing.
   *
   * Empty is a legitimate value: it means "no scope assigned", never "all".
   * Code that treats an empty list as a wildcard is an authorization bug.
   */
  readonly scopeIds: readonly string[];
}
