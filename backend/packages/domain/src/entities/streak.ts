import type { Result } from '../result.js';

/**
 * Measures DAILY PARTICIPATION, not correctness — an attempt updates the
 * streak whether it was right or wrong. See `applyAttempt` below for the
 * exact rule, already settled in docs/DECISIONS.md. `lastAttemptDate` is the
 * student's OWN local calendar date ('YYYY-MM-DD', via
 * `formatCalendarDate(instant, user.timezone)`) — NOT the global UTC date the
 * `DailyChallenge` is filed under. Two different students can attempt the
 * SAME global challenge and have it land on different local dates for their
 * own streak bookkeeping, and that is correct, not a bug — see the note on
 * why there is deliberately no grace period.
 */
export interface Streak {
  readonly userId: string;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly lastAttemptDate: string;
}

export interface StreakRepository {
  findByUserId(userId: string): Promise<Result<Streak | null>>;
  /** Upsert — the first attempt a user ever makes has no prior row. */
  save(streak: Streak): Promise<Result<Streak>>;
}

/**
 * THE streak rule, exactly as specified in docs/DECISIONS.md:
 *
 *   - No prior streak            → start at 1.
 *   - Last attempt was yesterday → +1 (and raise `longestStreak` if this is a
 *                                   new high).
 *   - Last attempt was today     → no change. Two different global daily
 *                                   challenges CAN fall on the same local
 *                                   date for a student far enough from UTC
 *                                   (see the entity's header note) — this
 *                                   branch is what makes attempting both idempotent
 *                                   instead of double-counting.
 *   - Anything older (or, defensively, a date in the past relative to the
 *     stored one — e.g. writes applied out of order) → reset to 1. Never
 *     invents a decrease: `longestStreak` only ever goes up.
 *
 * Pure and synchronous ON PURPOSE — the entire rule is testable with three
 * strings and no fakes, no ports, no clock. `submitAttempt` is what supplies
 * the already-resolved local date; this function makes no calendar decisions
 * of its own.
 */
export function applyAttempt(previous: Streak | null, userId: string, localDate: string): Streak {
  if (previous === null) {
    return { userId, currentStreak: 1, longestStreak: 1, lastAttemptDate: localDate };
  }

  const diffDays = daysBetween(previous.lastAttemptDate, localDate);

  if (diffDays <= 0) {
    // 0 = already recorded today (idempotent). Negative = a write landed out
    // of order; never move the streak backwards over it.
    return previous;
  }

  if (diffDays === 1) {
    const currentStreak = previous.currentStreak + 1;
    return {
      userId,
      currentStreak,
      longestStreak: Math.max(previous.longestStreak, currentStreak),
      lastAttemptDate: localDate,
    };
  }

  return {
    userId,
    currentStreak: 1,
    longestStreak: Math.max(previous.longestStreak, 1),
    lastAttemptDate: localDate,
  };
}

/**
 * Difference, in whole days, between two 'YYYY-MM-DD' calendar dates.
 *
 * Both are converted through `Date.UTC` — NOT through the zone either date
 * actually belongs to — because these are already plain calendar labels with
 * no zone of their own at this point; the only thing being compared is "how
 * many day boundaries apart are these two labels". Using a real zone here
 * would reintroduce exactly the DST-around-a-transition-day ambiguity this
 * function exists to avoid (a 23- or 25-hour local day would throw the count
 * off by a fraction that this function must never see).
 */
function daysBetween(from: string, to: string): number {
  return (toEpochDay(to) - toEpochDay(from)) / 86_400_000;
}

function toEpochDay(date: string): number {
  const [yearStr, monthStr, dayStr] = date.split('-');
  if (yearStr === undefined || monthStr === undefined || dayStr === undefined) {
    throw new TypeError(`"${date}" is not a valid YYYY-MM-DD calendar date`);
  }
  return Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
}
