/**
 * Authentication adapters: concrete implementations of the `TokenVerifier`
 * port.
 *
 * Only the composition root imports from here. Anything upstream — the auth
 * plugin, the routes, the use cases — sees the port and nothing else, which is
 * what makes the identity provider swappable without a single test changing.
 */
export * from './stub-token-verifier.js';
