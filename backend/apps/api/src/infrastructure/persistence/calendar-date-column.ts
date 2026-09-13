/**
 * Round-trip between the domain's pure calendar date ('YYYY-MM-DD', no time,
 * no zone) and a Postgres `@db.Date` column, which Prisma still surfaces as a
 * JS `Date`.
 *
 * ⚠ BOTH DIRECTIONS GO THROUGH THE UTC-EXPLICIT FORM, NEVER LOCAL-TIMEZONE
 * `Date` METHODS. `new Date(y, m, d)` and `.getDate()` resolve against the
 * SERVER's local zone, which is invisible in development (developer machine
 * and server usually share a zone) and wrong the day this process runs
 * somewhere else. Shared here because it is used by every table with a pure
 * calendar-date column (`daily_challenges.date`, `streaks.last_attempt_date`,
 * `attempts.daily_challenge_date`) — duplicating it per adapter is exactly
 * how one of them eventually gets it wrong.
 */
export function toDateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDateColumn(date: Date): string {
  return date.toISOString().slice(0, 10);
}
