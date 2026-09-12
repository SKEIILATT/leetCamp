import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from '@leetcamp/domain';

/**
 * `promisify(scryptCallback)` is deliberately NOT used here: `crypto.scrypt`
 * has multiple overloads (with and without the options object) and
 * `promisify`'s typings collapse them to the narrowest one, rejecting the
 * 4-argument call this file actually needs. A hand-written wrapper sidesteps
 * the overload-resolution problem entirely.
 */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/**
 * `PasswordHasher` built on Node's built-in `crypto.scrypt` — no new
 * dependency, no native addon to keep alive through the multi-stage Docker
 * build. `argon2`/`bcrypt` ship a compiled binding, which this project already
 * has scar tissue over (`unrs-resolver`'s postinstall — see
 * `pnpm-workspace.yaml`); scrypt is a memory-hard KDF too and the standard
 * library's implementation is enough for this project's threat model.
 *
 * Encoded as `scrypt:N:r:p:<salt-hex>:<hash-hex>`, with the cost parameters
 * embedded in every stored hash. That is what lets `N`/`r`/`p` be RAISED later
 * (as hardware gets faster) without invalidating passwords hashed under the
 * old, weaker parameters — `verify` reads them back out of the string instead
 * of assuming today's constants.
 */

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export function createScryptPasswordHasher(): PasswordHasher {
  return {
    async hash(plainPassword: string): Promise<string> {
      const salt = randomBytes(16);
      const derivedKey = await scrypt(plainPassword, salt, SCRYPT_PARAMS.keylen, {
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
      });

      return `scrypt:${SCRYPT_PARAMS.N}:${SCRYPT_PARAMS.r}:${SCRYPT_PARAMS.p}:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
    },

    async verify(plainPassword: string, passwordHash: string): Promise<boolean> {
      const parts = passwordHash.split(':');
      if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

      // `noUncheckedIndexedAccess` types every destructured element as
      // possibly `undefined` regardless of the length check above — narrowed
      // explicitly rather than asserted away.
      const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
      if (
        nStr === undefined ||
        rStr === undefined ||
        pStr === undefined ||
        saltHex === undefined ||
        hashHex === undefined
      ) {
        return false;
      }

      const N = Number(nStr);
      const r = Number(rStr);
      const p = Number(pStr);
      if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

      const salt = Buffer.from(saltHex, 'hex');
      const expected = Buffer.from(hashHex, 'hex');

      const actual = await scrypt(plainPassword, salt, expected.length, { N, r, p });

      // `timingSafeEqual` throws if the buffers differ in length — checked
      // first so a malformed or truncated stored hash returns `false` instead
      // of throwing out of `verify`, which would turn a corrupt row into a 500
      // instead of a failed login.
      if (actual.length !== expected.length) return false;
      return timingSafeEqual(actual, expected);
    },
  };
}
