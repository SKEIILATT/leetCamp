/**
 * Row → entity primitive conversions. The seam between what the database
 * returns and what the domain is allowed to see.
 *
 * ── THE FAILURE THESE FUNCTIONS PREVENT ──────────────────────────────────────
 *
 * `JSON.stringify` throws on a `BigInt` — `TypeError: Do not know how to
 * serialize a BigInt`. A Prisma `Decimal` does not throw; it serialises as an
 * object with internal fields (`{ s, e, d }`) and reaches the client as
 * garbage that no schema rejects.
 *
 * Both surface at the WORST possible moment: at response serialisation, inside
 * the framework, on whichever endpoint happens to be the first to select that
 * column. `app.ts` has a dedicated branch in `setErrorHandler` for exactly this
 * (`isResponseSerializationError`) because the raw failure is unreadable.
 *
 * The fix is not to catch it later. The fix is that a `bigint` or a `Decimal`
 * NEVER leaves the persistence adapter. Every repository maps at the boundary,
 * using these functions, and the domain only ever sees `number`, `string` and
 * `Date`.
 *
 * ── WHY DECIMALS BECOME STRINGS AND NOT NUMBERS ──────────────────────────────
 *
 * IEEE-754 doubles cannot represent most decimal fractions exactly. Money that
 * round-trips through `number` acquires cent-level errors that show up as an
 * invoice off by one cent — reported months later, impossible to reproduce.
 * A decimal string is lossless, and JSON has no other lossless option.
 *
 * If the CLIENT needs arithmetic on those values, it parses the string with a
 * decimal library. That is a deliberate cost, paid once, in exchange for never
 * having the rounding conversation.
 */

/**
 * Minimal structural type for the ORM's decimal value.
 *
 * Declared here, structurally, instead of importing `Prisma.Decimal`: this file
 * must not import the generated client (see `prisma-client.ts`), and the only
 * thing that is actually needed is `toString()`.
 */
export interface DecimalLike {
  toString(): string;
}

/**
 * `bigint` → `number`.
 *
 * ⚠ THROWS above `Number.MAX_SAFE_INTEGER` instead of returning a silently
 * wrong value. Beyond 2^53-1 a double cannot represent consecutive integers, so
 * two different ids collapse into the same number — and a wrong id that looks
 * plausible is worse than a crash. If a column can legitimately exceed that
 * range, it is not a `number` in the domain: use `fromBigIntToString`.
 */
export function fromBigInt(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(
      `bigint ${value.toString()} is outside the safe integer range; map it to string instead`,
    );
  }
  return Number(value);
}

/** `bigint` → decimal string. For identifiers and counters that may exceed 2^53. */
export function fromBigIntToString(value: bigint): string {
  return value.toString();
}

/**
 * `number` → `bigint`, for writing back.
 *
 * Rejects non-integers rather than truncating: `toBigInt(1.5)` returning `1n`
 * would corrupt a row with no error anywhere.
 */
export function toBigInt(value: number): bigint {
  if (!Number.isInteger(value)) {
    throw new TypeError(`cannot convert non-integer ${value} to bigint`);
  }
  return BigInt(value);
}

/** ORM decimal → lossless decimal string. See the header on why not `number`. */
export function fromDecimal(value: DecimalLike): string {
  return value.toString();
}

/**
 * Decimal string (or number) → the string form the ORM accepts for a decimal
 * column.
 *
 * Prisma accepts a string for `Decimal` inputs, which keeps this adapter free
 * of any decimal library. Validation happens at the HTTP boundary with Zod, not
 * here: this function's job is conversion, not policy.
 */
export function toDecimal(value: string | number): string {
  const text = typeof value === 'number' ? value.toString() : value.trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text)) {
    throw new TypeError(`"${text}" is not a valid decimal literal`);
  }
  return text;
}
