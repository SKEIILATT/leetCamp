/**
 * The pure business core.
 *
 * Entities, value objects, domain errors and PORTS (the interfaces the outside
 * world must satisfy). ZERO runtime dependencies. It imports no framework: not
 * fastify, not the ORM, not an auth SDK, not react, not even zod. That
 * restriction is enforced mechanically by `boundaries/dependencies` in the root
 * `eslint.config.js`, not by convention — the lint fails if anyone breaks it.
 *
 * If something here seems to need an external dependency, it belongs in another
 * layer.
 *
 * Repository ports do NOT all live here in a block: each vertical brings its own
 * alongside its entities. The ports that ARE here are cross-cutting — consumed
 * by the HTTP layer itself, not by any single business domain.
 */
export * from './errors.js';
export * from './result.js';

// Identity and authorization. The role catalogue is the project's SINGLE source
// of truth and `RequestIdentity` is the composition of the two identity layers.
// The authorization repository port lives here, and not with a business
// vertical, because authorization is cross-cutting: the HTTP plugin consumes it.
export * from './roles.js';
export * from './identity.js';
export * from './ports/user-authorization-repository.js';

export * from './ports/clock.js';
export * from './ports/id-generator.js';
export * from './ports/token-verifier.js';

// Consumed by the readiness route, which belongs to no domain — same reason as
// the authorization port.
export * from './ports/database-health-probe.js';

export * from './ports/recurring-job-scheduler.js';

export * from './entities/index.js';
