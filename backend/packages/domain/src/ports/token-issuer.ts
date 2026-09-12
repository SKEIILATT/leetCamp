/**
 * Port for issuing a bearer credential after a successful login.
 *
 * The counterpart to `TokenVerifier` (`./token-verifier.ts`): that port checks
 * a credential someone already has, this one mints a new one. Both are
 * satisfied by the SAME adapter when tokens are self-issued (see
 * `apps/api/src/infrastructure/auth/jwt-token-service.ts`) — the two
 * interfaces stay separate anyway because a route that only needs to verify
 * (`app.authenticate`) must not be able to mint tokens, and vice versa.
 */
export interface IssuedToken {
  readonly token: string;
  /** When the token stops being valid. Handed back so the client can decide
   * when to prompt for login again, without decoding the token itself. */
  readonly expiresAt: Date;
}

export interface TokenIssuer {
  /**
   * `subject` becomes the token's `sub` claim. For a self-issued token this
   * IS the application's user id — there is no external identity provider
   * introducing a second id to keep separate from it.
   */
  issueToken(identity: { subject: string; email?: string }): Promise<IssuedToken>;
}
