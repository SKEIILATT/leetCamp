import { SignJWT, jwtVerify } from 'jose';
import {
  err,
  ok,
  unauthenticated,
  type IssuedToken,
  type Result,
  type TokenIssuer,
  type TokenVerifier,
  type VerifiedIdentity,
} from '@leetcamp/domain';

/**
 * Self-issued JWT: this API signs its own tokens and verifies them with the
 * same secret (HS256), instead of delegating to an external identity
 * provider. Satisfies BOTH `TokenIssuer` and `TokenVerifier` on purpose — see
 * the note on `TokenIssuer` for why the two stay separate interfaces even
 * though one adapter implements both.
 *
 * `jose` chosen over `jsonwebtoken`: pure JS/WebCrypto, no native binding to
 * carry through the Docker build (see the same reasoning on
 * `scrypt-password-hasher.ts`), and it is what the scaffold's own
 * JWKS-verifier example already used.
 */
export interface JwtTokenServiceOptions {
  /** Shared HMAC secret. `env.ts` enforces a minimum length. */
  readonly secret: string;
  /** `iss`/`aud` are still verified even though we mint our own tokens: a
   * signature check alone accepts a valid token minted for a DIFFERENT
   * deployment sharing a leaked or default secret. */
  readonly issuer: string;
  readonly audience: string;
  readonly ttlSeconds: number;
}

export function createJwtTokenService(
  options: JwtTokenServiceOptions,
): TokenIssuer & TokenVerifier {
  const secretKey = new TextEncoder().encode(options.secret);

  return {
    async issueToken(identity: { subject: string; email?: string }): Promise<IssuedToken> {
      const expiresAt = new Date(Date.now() + options.ttlSeconds * 1000);

      const token = await new SignJWT({
        ...(identity.email !== undefined ? { email: identity.email } : {}),
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(identity.subject)
        .setIssuer(options.issuer)
        .setAudience(options.audience)
        .setIssuedAt()
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(secretKey);

      return { token, expiresAt };
    },

    async verifyToken(token: string): Promise<Result<VerifiedIdentity>> {
      try {
        // `algorithms: ['HS256']` pins the algorithm — never let the token's
        // own header choose it (that is how `alg: none` attacks work).
        const { payload } = await jwtVerify(token, secretKey, {
          issuer: options.issuer,
          audience: options.audience,
          algorithms: ['HS256'],
        });

        if (typeof payload.sub !== 'string') {
          return err(unauthenticated('Token has no subject'));
        }

        // NEVER a `role` claim read from here — see the note on `VerifiedIdentity`.
        return ok({
          subject: payload.sub,
          ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
        });
      } catch {
        // The library's message is NOT forwarded — it distinguishes "expired"
        // from "bad signature", and handing that to an unauthenticated caller
        // is a probing oracle.
        return err(unauthenticated('Invalid or expired token'));
      }
    },
  };
}
