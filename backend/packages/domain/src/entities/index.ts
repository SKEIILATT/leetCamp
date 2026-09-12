/**
 * Business entities and value objects.
 *
 * One file per aggregate, each exporting its type plus the invariants that
 * define it. Entities never carry persistence concerns: no `createdAt` you do
 * not use, no ORM decorators, no `id` typed as the database's `bigint`. The
 * row → entity translation is the adapter's job (see the type mappers in
 * `apps/api/src/infrastructure/persistence/type-mappers.ts`).
 *
 * Per-aggregate error factories go next to the entity, in
 * `<aggregate>-errors.ts`, and they build `DomainError`s from the CLOSED
 * catalogue in `../errors.ts`. They never define a new code.
 *
 * A vertical-specific repository port also lives next to its entity (e.g.
 * `user-repository.ts`) rather than in the cross-cutting `../ports/` folder —
 * see the header note in `../index.ts`.
 *
 * Add the re-export here as each aggregate lands. Keeping this file as the only
 * entry point is what lets `index.ts` stay a flat, greppable list.
 */
export * from './catalog.js';
export * from './catalog-errors.js';
export * from './challenge.js';
export * from './challenge-errors.js';
export * from './challenge-repository.js';
export * from './user.js';
export * from './user-errors.js';
export * from './user-repository.js';
