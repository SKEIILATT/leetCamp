import { describe, expect, it } from 'vitest';

import { ROLE_ID, roleForId, roleIdMap, roleLabel } from './roles.js';

describe('role catalogue', () => {
  /**
   * THE test of this file. `roleForId` returning `undefined` for an unknown id
   * is a security property, not an implementation detail: defaulting to the
   * least-privileged role would still be *granting* a role the database never
   * assigned. If someone "fixes" this with a `?? 'viewer'`, this test is what
   * stops it reaching production.
   */
  it('returns undefined for an unknown role id instead of defaulting', () => {
    expect(roleForId(9999)).toBeUndefined();
  });

  it('maps every catalogued id to a role', () => {
    for (const id of Object.values(ROLE_ID)) {
      expect(roleForId(id)).toBeDefined();
    }
  });

  /**
   * `roleIdMap` and `roleLabel` are two maps over the same key domain. Letting
   * them drift is exactly the failure the single-source-of-truth comment in
   * `roles.ts` warns about, so it is checked rather than trusted.
   */
  it('keeps roleIdMap and roleLabel over the same key domain', () => {
    expect(Object.keys(roleIdMap).sort()).toStrictEqual(Object.keys(roleLabel).sort());
  });
});
