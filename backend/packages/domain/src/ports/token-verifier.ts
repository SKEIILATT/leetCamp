import type { Result } from '../result.js';

/**
 * The authenticated caller, as it comes out of verifying the credential.
 */
export interface VerifiedIdentity {
  /**
   * The `sub` claim: the identity provider's id for this principal.
   *
   * ⚠ This is usually NOT the application's user id. See the note on
   * `RequestIdentity.subject` in `../identity.ts` — conflating the two is a bug
   * that fails silently and takes hours to find.
   */
  readonly subject: string;
  readonly email?: string;
}

/**
 * Port for verifying a bearer credential. The domain declares the capability;
 * the concrete implementation lives in `apps/api/src/infrastructure/auth/`.
 * The domain never imports an auth SDK — `boundaries/dependencies` in the root
 * `eslint.config.js` enforces that mechanically, not by good intentions.
 *
 * ⚠ DELIBERATE NOTE ON RBAC: `VerifiedIdentity` carries no role. Verifying the
 * token answers "who are you", not "what may you do". The role is resolved
 * against the database, because a role claim inside a token goes stale the
 * moment someone changes that user's role and stays valid until the token
 * expires. Permission failures are expressed with `forbidden(...)`, not here.
 *
 * Returns `Result` and does not throw: an expired or malformed token is an
 * expected outcome of this operation, not an exceptional condition.
 */
export interface TokenVerifier {
  verifyToken(token: string): Promise<Result<VerifiedIdentity>>;
}
