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
 *
 * `totalPoints` LIVES ON THIS SAME ROW, not a separate `Ranking` table — it is
 * updated by the exact same event (`submitAttempt`), at the exact same
 * instant, as `currentStreak`. Splitting them would mean two upserts per
 * attempt instead of one, buying no isolation: nothing ever reads one without
 * needing to know it changed alongside the other. The ranking (`RankingEntry`
 * below) reads this same table sorted by `totalPoints`, it does not maintain
 * its own copy.
 */
export interface Streak {
  readonly userId: string;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly lastAttemptDate: string;
  readonly totalPoints: number;
}

/**
 * One row of the leaderboard. `userId` is included so a client can find
 * "where am I" in the list without a second request, but nothing about the
 * account beyond `displayName` — the same reasoning as `PublicChallenge`:
 * this is one student's view of OTHER students, not an admin view.
 */
export interface RankingEntry {
  readonly userId: string;
  readonly displayName: string;
  readonly totalPoints: number;
  readonly currentStreak: number;
}

export interface StreakRepository {
  findByUserId(userId: string): Promise<Result<Streak | null>>;
  /** Upsert — the first attempt a user ever makes has no prior row. */
  save(streak: Streak): Promise<Result<Streak>>;
  /** Sorted by `totalPoints` descending. Position is NOT stored — it is
   * derived by the caller from list order — because a stored rank number
   * would need invalidating every time ANYONE ELSE's points change, and a
   * sort over this project's scale (30-100 rows) costs nothing to redo on
   * every read. See docs/DECISIONS.md's note on not recalculating the
   * expensive part (the accumulation), which this is not. */
  listRanked(): Promise<Result<readonly RankingEntry[]>>;
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
 * `pointsEarned` (from `calculatePoints` in `./scoring.js`) ALWAYS
 * accumulates into `totalPoints`, independent of every branch above —
 * points are never reset, never capped by the streak resetting. A student who
 * breaks a 30-day streak keeps every point they already earned.
 *
 * Pure and synchronous ON PURPOSE — the entire rule is testable with three
 * strings and a number, no fakes, no ports, no clock. `submitAttempt` is what
 * supplies the already-resolved local date and the already-computed points;
 * this function makes no calendar or scoring decisions of its own.
 */
export function applyAttempt(
  previous: Streak | null,
  userId: string,
  localDate: string,
  pointsEarned: number,
): Streak {
  if (previous === null) {
    return {
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastAttemptDate: localDate,
      totalPoints: pointsEarned,
    };
  }

  const totalPoints = previous.totalPoints + pointsEarned;
  const diffDays = daysBetween(previous.lastAttemptDate, localDate);

  if (diffDays <= 0) {
    // 0 = already recorded today (idempotent for the streak fields) — but
    // points from a SECOND challenge landing on the same local date (see the
    // entity's header note) still count; only the streak counter is
    // unaffected.
    return { ...previous, totalPoints };
  }

  if (diffDays === 1) {
    const currentStreak = previous.currentStreak + 1;
    return {
      userId,
      currentStreak,
      longestStreak: Math.max(previous.longestStreak, currentStreak),
      lastAttemptDate: localDate,
      totalPoints,
    };
  }

  return {
    userId,
    currentStreak: 1,
    longestStreak: Math.max(previous.longestStreak, 1),
    lastAttemptDate: localDate,
    totalPoints,
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
