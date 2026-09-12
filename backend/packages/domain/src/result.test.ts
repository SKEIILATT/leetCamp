import { describe, expect, it } from 'vitest';

import { err, isOk, ok, type Result } from './result.js';
import { notFound, repository } from './errors.js';

/**
 * These tests pin the SHAPE of `Result`, not clever behaviour — there is no
 * behaviour to speak of. They exist so the domain package has a real `test`
 * script from day one, which is what keeps it out of the exemption list in
 * `health.sh` step 2. A workspace with no test script is skipped in silence by
 * `pnpm -r test`.
 */
describe('Result', () => {
  it('narrows to the success branch through the `ok` discriminant', () => {
    const result: Result<number> = ok(42);

    if (!result.ok) {
      throw new Error('unreachable');
    }

    // If the discriminant did not narrow, this line would not compile.
    expect(result.value).toBe(42);
  });

  it('carries the domain error untouched on the failure branch', () => {
    const error = notFound('Order 7 not found');
    const result: Result<number> = err(error);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toStrictEqual({ code: 'NOT_FOUND', message: 'Order 7 not found' });
  });

  it('isOk filters a mixed list without a manual type assertion', () => {
    const results: Array<Result<string>> = [ok('a'), err(repository('boom')), ok('b')];

    const values = results.filter(isOk).map((result) => result.value);

    expect(values).toStrictEqual(['a', 'b']);
  });
});
