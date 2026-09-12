import { z } from 'zod';
import type { DomainError, DomainErrorCode } from '@leetcamp/domain';

/**
 * THE ONLY place where a domain failure becomes an HTTP concern. Controllers
 * stay thin: they call a use case and hand the error here.
 *
 * Centralising the mapping is what makes IMPOSSIBLE the class of bug where two
 * equivalent endpoints return different statuses for the same condition (a 500
 * where a 404 belongs) because each handler mapped it by hand.
 *
 * The table is not invented here: it is documented as intent in the header of
 * the domain's `errors.ts`, and this file reproduces it exactly. If a mapping
 * ever has to change, it changes in both places at once or the domain comment
 * starts lying.
 */
export function statusForError(error: DomainError): number {
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'VALIDATION':
      return 400;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'EXTERNAL_SERVICE':
      return 502;
    case 'REPOSITORY':
      return 500;
    // Unreachable while the switch covers all seven codes — `DomainErrorCode`
    // is a closed union and TypeScript already verifies exhaustiveness. It is
    // here for the day the catalogue grows and someone deploys before updating
    // this table: a 500 beats `undefined` as a status.
    default:
      return 500;
  }
}

/**
 * The uniform error envelope: FLAT `{ message, code }`.
 *
 * Flat, not nested (`{ error: { code, message } }`). Pick one and never
 * introduce a second: a client that has to handle two envelope shapes will
 * handle one of them wrong. `code` is the stable discriminant the client can
 * branch on without parsing prose.
 *
 * ⚠ This is for DOMAIN errors — messages we wrote and that are safe to show. It
 * is NOT the path for unexpected errors: `setErrorHandler` in `app.ts` never
 * routes a 5xx through here, precisely so an internal exception message cannot
 * leak.
 */
export function errorBody(error: DomainError): { message: string; code: DomainErrorCode } {
  return { message: error.message, code: error.code };
}

/**
 * The one error schema every route references.
 *
 * `.meta({ id: 'Error' })` is what makes @fastify/swagger emit it ONCE under
 * `#/components/schemas/Error` and `$ref` it from every route, instead of
 * inlining N copies that drift apart. It requires `transformObject:
 * jsonSchemaTransformObject` in the swagger registration — see step 5 of
 * `app.ts`. Without that option the `.meta({ id })` is silently ignored and the
 * schema is inlined everywhere.
 *
 * Enumerating the codes here rather than deriving them from the domain type is
 * deliberate: this list is the WIRE contract, and it should not change just
 * because someone widened an internal union.
 */
export const ErrorResponseSchema = z
  .object({
    message: z.string().describe('Human-readable error message.'),
    code: z
      .enum([
        'UNAUTHENTICATED',
        'FORBIDDEN',
        'VALIDATION',
        'NOT_FOUND',
        'CONFLICT',
        'EXTERNAL_SERVICE',
        'REPOSITORY',
      ])
      .describe('Stable, machine-readable error code.'),
  })
  .meta({ id: 'Error', description: 'Uniform error envelope returned by every endpoint.' });
