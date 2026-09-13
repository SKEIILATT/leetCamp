/**
 * Use cases — the orchestration layer.
 *
 * Depends ONLY on the domain package. It cannot import fastify, the ORM, an
 * auth SDK, react or zod: `boundaries/dependencies` in the root
 * `eslint.config.js` prevents it mechanically.
 *
 * Organised BY BUSINESS VERTICAL, not by artefact type. There is no
 * `use-cases/`, `services/`, `dto/` triple that forces a three-directory jump
 * to read one feature. Each folder exports its own bundle of use cases; see
 * `system/index.ts` for the exact pattern.
 *
 * Add one re-export line per vertical. Keeping this file a flat list is what
 * makes the set of verticals readable at a glance.
 */
export * from './admin-users/index.js';
export * from './attempts/index.js';
export * from './auth/index.js';
export * from './challenges/index.js';
export * from './daily-challenges/index.js';
export * from './ranking/index.js';
export * from './system/index.js';
