/**
 * Persistence adapters: concrete implementations of the domain's repository
 * ports.
 *
 * ⚠ EVERYTHING EXPORTED FROM HERE OPENS OR USES CONNECTIONS. The only file
 * allowed to import this barrel is `composition-root.ts`. If it appears in an
 * import inside `interfaces/http/`, the HTTP layer has stopped being bootable
 * without a database and every stub-based test is one refactor away from
 * needing Postgres.
 */
export * from './prisma-client.js';
export * from './prisma-user-authorization-repository.js';
export * from './type-mappers.js';
