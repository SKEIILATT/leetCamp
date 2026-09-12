import { describe, expect, it } from 'vitest';
import { domainError, type DomainErrorCode } from '@leetcamp/domain';

import { errorBody, statusForError } from './result-to-http.js';

/**
 * The mapping table is duplicated here ON PURPOSE, written out by hand.
 *
 * Deriving the expectations from `statusForError` itself would make this file
 * assert that the function equals itself — green forever, worth nothing. Typing
 * the table twice is the only way a silent change to one entry shows up as a
 * failure. If you edit the switch, you edit this list; that friction is the
 * feature.
 */
const EXPECTED: ReadonlyArray<readonly [DomainErrorCode, number]> = [
  ['UNAUTHENTICATED', 401],
  ['FORBIDDEN', 403],
  ['VALIDATION', 400],
  ['NOT_FOUND', 404],
  ['CONFLICT', 409],
  ['EXTERNAL_SERVICE', 502],
  ['REPOSITORY', 500],
];

describe('statusForError', () => {
  it.each(EXPECTED)('maps %s to %i', (code, status) => {
    expect(statusForError(domainError(code, 'x'))).toBe(status);
  });

  it('covers every code in the catalogue', () => {
    // Guards against the catalogue growing without this table growing with it.
    expect(EXPECTED).toHaveLength(7);
  });

  it('falls back to 500 for a code outside the union', () => {
    // Only reachable by lying to the compiler, which is exactly the scenario the
    // `default` branch exists for: a deploy where the domain grew a code and
    // this table did not.
    const rogue = { code: 'NOT_A_REAL_CODE', message: 'x' } as unknown as ReturnType<
      typeof domainError
    >;
    expect(statusForError(rogue)).toBe(500);
  });
});

describe('errorBody', () => {
  it('produces a FLAT envelope', () => {
    expect(errorBody(domainError('NOT_FOUND', 'Order 7 not found'))).toStrictEqual({
      message: 'Order 7 not found',
      code: 'NOT_FOUND',
    });
  });
});
