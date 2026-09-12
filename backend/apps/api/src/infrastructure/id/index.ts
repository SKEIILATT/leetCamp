import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '@leetcamp/domain';

/**
 * UUID v4 generator. The one place in the process allowed to call
 * `randomUUID()`.
 *
 * Tests never use this: they pass a trivial sequential generator so a use
 * case's output can be asserted exactly.
 */
export function createUuidGenerator(): IdGenerator {
  return {
    generate: () => randomUUID(),
  };
}
