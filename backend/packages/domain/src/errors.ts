/**
 * Domain error codes. These are STABLE identifiers: they are the contract
 * between the domain and the HTTP layer, and they are exactly what
 * `apps/api/src/interfaces/http/result-to-http.ts` switches on to pick a status
 * code.
 *
 * Centralising the mapping in one place removes the class of bug where two
 * equivalent endpoints return different statuses for the same failure (a 500
 * where a 404 belongs) because each handler mapped it by hand. With a single
 * mapping table, that inconsistency cannot come back.
 *
 * HTTP correspondence (fixed by `result-to-http.ts`, documented here as intent):
 *
 *   UNAUTHENTICATED  -> 401  (we do not know who you are)
 *   FORBIDDEN        -> 403  (we know who you are and you may not)
 *   VALIDATION       -> 400
 *   NOT_FOUND        -> 404
 *   CONFLICT         -> 409
 *   EXTERNAL_SERVICE -> 502  (a third party failed, not us)
 *   REPOSITORY       -> 500
 *
 * ── WHY THE CATALOGUE IS CLOSED ──────────────────────────────────────────────
 * Seven codes, one union, no per-feature enums. A `PaymentErrorCode` next to an
 * `OrderErrorCode` means the HTTP layer needs a mapping table per feature, and
 * the day someone forgets one, the response is a 500 with a message that leaks.
 * Distinguishing *which* thing failed is the job of the message, not of a new
 * code.
 *
 * Two of these are worth keeping even when they look redundant on day one:
 *
 * - `FORBIDDEN`: collapsing "not authenticated" and "authenticated but not
 *   allowed" into one code forces the HTTP layer to answer 401 where 403
 *   belongs, which breaks client session handling — a 401 usually triggers
 *   refresh/logout, a 403 must not.
 *
 * - `EXTERNAL_SERVICE`: a third-party failure is not a failure of our
 *   repository. Merging them makes it impossible to tell "our database is down"
 *   from "the provider is not answering", both in the HTTP status and in the
 *   logs and alerts.
 */
export type DomainErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EXTERNAL_SERVICE'
  | 'REPOSITORY';

/**
 * A failure carrying a stable code plus a human-readable message.
 *
 * ⚠ THE MESSAGE IS WIRE CONTRACT. `errorBody()` in the HTTP layer sends it to
 * the client verbatim, because domain messages are written by us and safe to
 * show. Never build one by interpolating a raw driver error, a connection
 * string or a SQL fragment: adapters must translate, not forward.
 */
export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
}

export function domainError(code: DomainErrorCode, message: string): DomainError {
  return { code, message };
}

/**
 * One factory per code. They exist so call sites read as prose
 * (`return err(notFound('Order not found'))`) and so grepping for a code finds
 * every producer of it — which a bare `domainError('NOT_FOUND', …)` scattered
 * around would not.
 */
export const unauthenticated = (message = 'Not authenticated'): DomainError =>
  domainError('UNAUTHENTICATED', message);

export const forbidden = (message = 'Not allowed'): DomainError =>
  domainError('FORBIDDEN', message);

export const validation = (message: string): DomainError => domainError('VALIDATION', message);

export const notFound = (message: string): DomainError => domainError('NOT_FOUND', message);

export const conflict = (message: string): DomainError => domainError('CONFLICT', message);

export const externalService = (message: string): DomainError =>
  domainError('EXTERNAL_SERVICE', message);

export const repository = (message: string): DomainError => domainError('REPOSITORY', message);
