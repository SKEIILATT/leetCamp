import { describe, expect, it } from 'vitest';

import { fromBigInt, fromBigIntToString, fromDecimal, toBigInt, toDecimal } from './type-mappers.js';

describe('fromBigInt', () => {
  it('converts a value inside the safe range', () => {
    expect(fromBigInt(42n)).toBe(42);
  });

  /**
   * The assertion that earns this file its place. Silently returning a wrong
   * number here means two distinct database ids collapse into one in the API
   * response — a data bug that looks like a plausible value.
   */
  it('throws instead of silently losing precision above MAX_SAFE_INTEGER', () => {
    expect(() => fromBigInt(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(RangeError);
  });

  it('offers a lossless string escape hatch', () => {
    expect(fromBigIntToString(9007199254740993n)).toBe('9007199254740993');
  });
});

describe('toBigInt', () => {
  it('rejects a non-integer rather than truncating it', () => {
    expect(() => toBigInt(1.5)).toThrow(TypeError);
  });
});

describe('decimals', () => {
  it('reads a decimal as a lossless string', () => {
    expect(fromDecimal({ toString: () => '10.05' })).toBe('10.05');
  });

  it('accepts valid decimal literals', () => {
    expect(toDecimal('10.05')).toBe('10.05');
    expect(toDecimal(-3)).toBe('-3');
    expect(toDecimal('.5')).toBe('.5');
  });

  it('rejects anything that is not a decimal literal', () => {
    expect(() => toDecimal('10,05')).toThrow(TypeError);
    expect(() => toDecimal('1e5')).toThrow(TypeError);
  });
});
