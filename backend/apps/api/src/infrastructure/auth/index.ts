/**
 * Authentication adapters: concrete implementations of the `TokenVerifier`,
 * `TokenIssuer` and `PasswordHasher` ports.
 *
 * Only the composition root imports from here. Anything upstream — the auth
 * plugin, the routes, the use cases — sees the ports and nothing else, which
 * is what makes the identity provider swappable without a single test
 * changing.
 */
export * from './jwt-token-service.js';
export * from './scrypt-password-hasher.js';
