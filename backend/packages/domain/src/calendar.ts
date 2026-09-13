/**
 * `Date` (an instant) → `'YYYY-MM-DD'` (a calendar date), AS SEEN IN `timeZone`.
 *
 * Pure `Intl`, no date library — `Clock`'s own header comment names this as
 * the intended way to turn an instant into a calendar concept, and
 * `boundaries/dependencies` in the root eslint config blocks date-fns/dayjs/
 * luxon from the core outright.
 *
 * `en-CA` is not a nod to Canada: that locale is the one built-in
 * `Intl.DateTimeFormat` preset whose default numeric date order is already
 * `YYYY-MM-DD`, which is what saves this function from reassembling the
 * three parts by hand.
 *
 * Used for BOTH the single global "what date is it for the daily challenge"
 * (see `get-today-challenge.ts`, UTC) and, later, the PER-USER day cutoff for
 * streaks (docs/DECISIONS.md) — same function, different `timeZone` argument.
 */
export function formatCalendarDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
