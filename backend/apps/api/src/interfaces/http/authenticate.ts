import type {
  RequestIdentity,
  Result,
  TokenVerifier,
  UserAuthorizationRepository,
} from '@leetcamp/domain';
import { err, forbidden, ok, roleForId, unauthenticated } from '@leetcamp/domain';

/**
 * The composition of the TWO identity layers, isolated from Fastify.
 *
 * This file lives apart from the plugin on purpose: there is no
 * `FastifyRequest` here, no `reply`, no decorators. It is a function from
 * (header, ports) to `Result<RequestIdentity>`, which is why the whole thing
 * can be tested without starting a server. Everything that touches Fastify sits
 * in `plugins/auth.plugin.ts` and is a thin wrapper over these three functions.
 */

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(authorizationHeader: string | undefined): Result<string> {
  if (!authorizationHeader) {
    return err(unauthenticated('Missing Authorization header'));
  }

  const [scheme, token, ...rest] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || rest.length > 0) {
    return err(unauthenticated('Authorization header must be "Bearer <token>"'));
  }

  // JS clients send these literal strings when they interpolate a missing value
  // (`Bearer ${session?.accessToken}`). Treating them as a real token pushes the
  // error down into cryptographic verification, which is far harder to diagnose
  // from the browser than a straight "missing header".
  if (token === 'null' || token === 'undefined') {
    return err(unauthenticated('Missing Authorization header'));
  }

  return ok(token);
}

/**
 * Resolve the FULL identity from an Authorization header.
 *
 * Layer 1 — `tokenVerifier.verifyToken`: checks the signature, returns `sub`.
 * Layer 2 — `userRepository.findActiveProfileBySubject`: reads that subject's
 *           role and scopes from the database, always fresh.
 *
 * ⚠ WHY A MISSING OR INACTIVE USER IS 401 AND NOT 403.
 *
 * This is the least obvious decision in the file, so it is written down rather
 * than re-argued in six months.
 *
 * The token's signature is fine; what no longer exists is the person. A 403
 * would say "I know who you are and you may not do THIS", which invites the
 * client to keep the session and retry elsewhere — where it will fail again,
 * forever, because no route will ever work. The user ends up trapped in a dead
 * session with no way out through the UI.
 *
 * The 401 says the right thing: this credential is no longer usable, discard
 * it. It is also what clients already do with a 401 (refresh-and-retry, then
 * sign out). The desired client behaviour is "log out", and the status code
 * that produces that behaviour is 401.
 *
 * 403 stays reserved for what it actually means: a valid, live identity missing
 * one specific permission. That is emitted by `checkRole`, not here.
 */
export async function resolveIdentity(
  tokenVerifier: TokenVerifier,
  userRepository: UserAuthorizationRepository,
  authorizationHeader: string | undefined,
): Promise<Result<RequestIdentity>> {
  const tokenResult = extractBearerToken(authorizationHeader);
  if (!tokenResult.ok) return err(tokenResult.error);

  // ── Layer 1: who you are (cryptography) ────────────────────────────────────
  const verified = await tokenVerifier.verifyToken(tokenResult.value);
  if (!verified.ok) return err(verified.error);

  const subject = verified.value.subject;

  // ── Layer 2: what you may do RIGHT NOW (database) ──────────────────────────
  const profileResult = await userRepository.findActiveProfileBySubject(subject);

  // A database failure propagates as-is (REPOSITORY -> 500). It is NOT turned
  // into a 401: if Postgres goes down, the frontend would sign out every single
  // user believing their sessions expired.
  if (!profileResult.ok) return err(profileResult.error);

  const profile = profileResult.value;
  if (profile === null) {
    // No active row: deleted, deactivated, or the subject no longer maps to a
    // user. See the long note above on 401 vs 403.
    return err(unauthenticated('This account is no longer active'));
  }

  // A `role_id` the catalogue does not know is NOT downgraded to the
  // least-privileged role. A UI may do that for a label; granting a default
  // authorization on the server is inventing a permission.
  const role = roleForId(profile.roleId);
  if (!role) {
    return err(unauthenticated('The account role is not valid'));
  }

  return ok({
    userId: profile.userId,
    subject,
    // Conditional spread: under `exactOptionalPropertyTypes`, a key present with
    // value `undefined` is NOT the same as an absent key.
    ...(verified.value.email !== undefined ? { email: verified.value.email } : {}),
    roleId: profile.roleId,
    role,
    scopeIds: profile.scopeIds,
  });
}

/**
 * Check that an already-resolved identity holds one of the allowed role ids.
 *
 * Here it IS a 403: the identity is valid and live, and all it lacks is
 * permission for this particular operation. The client should keep its session.
 *
 * Takes the identity, not the request: it is a pure function and tests alone.
 */
export function checkRole(
  identity: RequestIdentity,
  allowedRoleIds: readonly number[],
): Result<RequestIdentity> {
  if (allowedRoleIds.includes(identity.roleId)) return ok(identity);
  // The message deliberately does NOT enumerate the allowed roles: that hands an
  // attacker a map of the permission model, one probe at a time.
  return err(forbidden('You do not have permission for this operation'));
}
