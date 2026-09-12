/**
 * Business entities and value objects.
 *
 * SKELETON ON PURPOSE — the scaffolding does not invent your domain.
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
 * Example of the intended shape:
 *
 * ```ts
 * // order.ts
 * export interface Order {
 *   readonly id: string;
 *   readonly total: number;
 *   readonly placedAt: Date;
 * }
 *
 * // order-errors.ts
 * import { notFound, conflict } from '../errors.js';
 * export const orderNotFound = (id: string) => notFound(`Order ${id} not found`);
 * export const orderAlreadyShipped = () => conflict('Order was already shipped');
 * ```
 *
 * Add the re-export here as each aggregate lands. Keeping this file as the only
 * entry point is what lets `index.ts` stay a flat, greppable list.
 */
export {};
