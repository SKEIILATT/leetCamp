import { describe, expect, it } from 'vitest';

import { createScryptPasswordHasher } from './scrypt-password-hasher.js';

describe('createScryptPasswordHasher', () => {
  it('verifies a password against its own hash', async () => {
    const hasher = createScryptPasswordHasher();
    const hash = await hasher.hash('correct horse battery staple');

    expect(await hasher.verify('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hasher = createScryptPasswordHasher();
    const hash = await hasher.hash('correct horse battery staple');

    expect(await hasher.verify('wrong password', hash)).toBe(false);
  });

  it('salts every hash — the same password hashes differently each time', async () => {
    const hasher = createScryptPasswordHasher();
    const first = await hasher.hash('same password');
    const second = await hasher.hash('same password');

    expect(first).not.toBe(second);
    expect(await hasher.verify('same password', first)).toBe(true);
    expect(await hasher.verify('same password', second)).toBe(true);
  });

  /**
   * A corrupt or foreign-format stored hash must fail closed (`false`), never
   * throw — a thrown error out of `verify` would turn a bad row into a 500
   * instead of a failed login. See the note in the implementation.
   */
  it('returns false, rather than throwing, for a malformed stored hash', async () => {
    const hasher = createScryptPasswordHasher();

    await expect(hasher.verify('anything', 'not-a-valid-hash')).resolves.toBe(false);
    await expect(hasher.verify('anything', 'bcrypt:not:our:format')).resolves.toBe(false);
  });
});
