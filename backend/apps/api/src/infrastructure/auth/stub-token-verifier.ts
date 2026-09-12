import { err, ok, unauthenticated, type Result, type TokenVerifier, type VerifiedIdentity } from '@leetcamp/domain';

/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ ⚠⚠ EXAMPLE ADAPTER. IT VERIFIES NOTHING. REPLACE IT BEFORE SHIPPING. ⚠⚠   │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * The scaffold does NOT pick your identity provider — Auth0, Supabase, Clerk,
 * Cognito, Keycloak and a self-issued JWT all satisfy the same port, and
 * choosing one for you would be the scaffold making a product decision.
 *
 * What the scaffold DOES give you is the seam: everything upstream of this file
 * (`resolveIdentity`, the auth plugin, every route) depends on the
 * `TokenVerifier` port and nothing else. Swapping this stub for a real verifier
 * touches this file and the composition root. Nothing else, and no test.
 *
 * ── HOW TO REPLACE IT ────────────────────────────────────────────────────────
 *
 * Write `jwks-token-verifier.ts` next to this file and wire it in
 * `composition-root.ts`. A JWKS-based implementation is roughly:
 *
 * ```ts
 * import { createRemoteJWKSet, jwtVerify } from 'jose';
 *
 * export function createJwksTokenVerifier(opts: {
 *   jwksUrl: string; issuer: string; audience: string;
 * }): TokenVerifier {
 *   // Created ONCE, outside verifyToken: the set caches keys and rotates them
 *   // on its own. Building it per request means an HTTP round trip per API
 *   // call and a thundering herd on key rotation.
 *   const jwks = createRemoteJWKSet(new URL(opts.jwksUrl));
 *
 *   return {
 *     async verifyToken(token) {
 *       try {
 *         const { payload } = await jwtVerify(token, jwks, {
 *           issuer: opts.issuer,
 *           audience: opts.audience,
 *         });
 *         if (typeof payload.sub !== 'string') {
 *           return err(unauthenticated('Token has no subject'));
 *         }
 *         return ok({
 *           subject: payload.sub,
 *           ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
 *         });
 *       } catch {
 *         // The library's message is NOT forwarded. It distinguishes "expired"
 *         // from "bad signature" from "wrong audience", and handing that
 *         // distinction to an unauthenticated caller is a probing oracle.
 *         return err(unauthenticated('Invalid or expired token'));
 *       }
 *     },
 *   };
 * }
 * ```
 *
 * ⚠ FOUR THINGS THAT ARE NOT OPTIONAL IN A REAL IMPLEMENTATION:
 *   1. `issuer` and `audience` are always verified. A signature check alone
 *      accepts a valid token minted for a different application.
 *   2. The algorithm is pinned by the JWKS. Never accept `alg: none`, and never
 *      let the token choose its own algorithm.
 *   3. NEVER trust a `role` claim from the token. Roles are read from the
 *      database — see the note on the port.
 *   4. Never leak the library's failure reason to the caller.
 */
export interface StubTokenVerifierOptions {
  /**
   * Tokens accepted by the stub, mapped to the identity they resolve to.
   * Anything else is rejected.
   */
  readonly tokens: Readonly<Record<string, VerifiedIdentity>>;
}

export function createStubTokenVerifier(options: StubTokenVerifierOptions): TokenVerifier {
  return {
    async verifyToken(token: string): Promise<Result<VerifiedIdentity>> {
      const identity = options.tokens[token];
      if (!identity) return err(unauthenticated('Invalid or expired token'));
      return ok(identity);
    },
  };
}
