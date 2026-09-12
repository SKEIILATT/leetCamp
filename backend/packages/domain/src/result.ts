import type { DomainError } from './errors.js';

/**
 * Explicit Result type. Use cases return `Result<T>` instead of throwing, so
 * every failure path is visible in the signature and the HTTP layer can map
 * errors without a single `try/catch`.
 *
 * Exceptions stay reserved for what is genuinely exceptional: a programming
 * error, or an unrecoverable infrastructure failure. A record that does not
 * exist, a deadline that has passed, a role without permission — none of those
 * are exceptional. They are expected business outcomes and they travel as
 * `err(...)`.
 *
 * The discriminant is `ok`, so `if (!result.ok) return err(result.error)`
 * narrows correctly and TypeScript guarantees nobody reads `.value` off a
 * failed result.
 *
 * ── WHY THERE ARE NO COMBINATORS HERE ────────────────────────────────────────
 * No `map`, no `flatMap`, no `andThen`. It is a deliberate omission, not an
 * unfinished file. Plain `if (!result.ok) return err(result.error)` reads the
 * same in every use case, shows up correctly in a stack trace and needs no
 * documentation. A chain of combinators reads like a different language in each
 * file and hides where a failure actually came from. Adding them is easy and
 * always feels like an improvement — resist it until you have a concrete case
 * that the plain form cannot express.
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

/**
 * `T = never` by default so `err(...)` fits wherever a `Result<T>` is expected
 * without having to restate the success type at the call site.
 */
export const err = <T = never>(error: DomainError): Result<T> => ({ ok: false, error });

/**
 * Type guard for the places where a plain `if (result.ok)` is not enough —
 * `Array.prototype.filter` being the common one, since it cannot narrow through
 * a property access on its own.
 */
export function isOk<T>(result: Result<T>): result is { ok: true; value: T } {
  return result.ok;
}
