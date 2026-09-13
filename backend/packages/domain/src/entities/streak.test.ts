import { describe, expect, it } from 'vitest';

import { applyAttempt, type Streak } from './streak.js';

describe('applyAttempt', () => {
  it('starts at 1 with no prior streak, totalPoints set to what was just earned', () => {
    const result = applyAttempt(null, 'user-1', '2026-03-15', 30);
    expect(result).toStrictEqual({
      userId: 'user-1',
      currentStreak: 1,
      longestStreak: 1,
      lastAttemptDate: '2026-03-15',
      totalPoints: 30,
    });
  });

  it('increments when the last attempt was exactly yesterday', () => {
    const previous: Streak = {
      userId: 'user-1',
      currentStreak: 4,
      longestStreak: 4,
      lastAttemptDate: '2026-03-14',
      totalPoints: 100,
    };

    const result = applyAttempt(previous, 'user-1', '2026-03-15', 20);

    expect(result.currentStreak).toBe(5);
    expect(result.longestStreak).toBe(5);
    expect(result.lastAttemptDate).toBe('2026-03-15');
    expect(result.totalPoints).toBe(120);
  });

  it('raises longestStreak only when currentStreak sets a new high', () => {
    const previous: Streak = {
      userId: 'user-1',
      currentStreak: 2,
      longestStreak: 10,
      lastAttemptDate: '2026-03-14',
      totalPoints: 0,
    };

    const result = applyAttempt(previous, 'user-1', '2026-03-15', 0);

    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(10);
  });

  it('does not change the streak counters for a second attempt on the same local day, but still adds its points', () => {
    const previous: Streak = {
      userId: 'user-1',
      currentStreak: 5,
      longestStreak: 8,
      lastAttemptDate: '2026-03-15',
      totalPoints: 50,
    };

    const result = applyAttempt(previous, 'user-1', '2026-03-15', 15);

    expect(result.currentStreak).toBe(5);
    expect(result.longestStreak).toBe(8);
    expect(result.lastAttemptDate).toBe('2026-03-15');
    // THE property that matters here: points from a second global challenge
    // landing on the same local date (a timezone edge case, see the entity's
    // header note) are never lost, even though the streak itself is a no-op.
    expect(result.totalPoints).toBe(65);
  });

  it('resets the streak to 1 when a day was skipped, without a grace period — points are never reset', () => {
    const previous: Streak = {
      userId: 'user-1',
      currentStreak: 12,
      longestStreak: 12,
      lastAttemptDate: '2026-03-10',
      totalPoints: 500,
    };

    const result = applyAttempt(previous, 'user-1', '2026-03-15', 25);

    expect(result.currentStreak).toBe(1);
    // The record stands even after a reset.
    expect(result.longestStreak).toBe(12);
    expect(result.lastAttemptDate).toBe('2026-03-15');
    expect(result.totalPoints).toBe(525);
  });

  it('never moves the streak counters backwards on an out-of-order write, but still credits the points', () => {
    const previous: Streak = {
      userId: 'user-1',
      currentStreak: 5,
      longestStreak: 5,
      lastAttemptDate: '2026-03-15',
      totalPoints: 200,
    };

    const result = applyAttempt(previous, 'user-1', '2026-03-14', 10);

    expect(result.currentStreak).toBe(5);
    expect(result.longestStreak).toBe(5);
    expect(result.lastAttemptDate).toBe('2026-03-15');
    expect(result.totalPoints).toBe(210);
  });

  /**
   * A month boundary is where a naive string/number comparison of the day
   * component alone (`'01' - '28'`) breaks. This is what actually exercises
   * `Date.UTC`-based day counting.
   */
  it('counts exactly one day across a month boundary', () => {
    const previous: Streak = {
      userId: 'user-1',
      currentStreak: 3,
      longestStreak: 3,
      lastAttemptDate: '2026-02-28',
      totalPoints: 0,
    };

    const result = applyAttempt(previous, 'user-1', '2026-03-01', 0);

    expect(result.currentStreak).toBe(4);
  });
});
