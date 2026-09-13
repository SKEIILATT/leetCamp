import { describe, expect, it } from 'vitest';

import { applyAttempt, type Streak } from './streak.js';

describe('applyAttempt', () => {
  it('starts at 1 with no prior streak', () => {
    const result = applyAttempt(null, 'user-1', '2026-03-15');
    expect(result).toStrictEqual({
      userId: 'user-1',
      currentStreak: 1,
      longestStreak: 1,
      lastAttemptDate: '2026-03-15',
    });
  });

  it('increments when the last attempt was exactly yesterday', () => {
    const previous: Streak = {
      userId: 'user-1',
      currentStreak: 4,
      longestStreak: 4,
      lastAttemptDate: '2026-03-14',
    };

    const result = applyAttempt(previous, 'user-1', '2026-03-15');

    expect(result.currentStreak).toBe(5);
    expect(result.longestStreak).toBe(5);
    expect(result.lastAttemptDate).toBe('2026-03-15');
  });

  it('raises longestStreak only when currentStreak sets a new high', () => {
    const previous: Streak = {
      userId: 'user-1',
      currentStreak: 2,
      longestStreak: 10,
      lastAttemptDate: '2026-03-14',
    };

    const result = applyAttempt(previous, 'user-1', '2026-03-15');

    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(10);
  });

  it('is a no-op when the last attempt was already today (idempotent)', () => {
    const previous: Streak = {
      userId: 'user-1',
      currentStreak: 5,
      longestStreak: 8,
      lastAttemptDate: '2026-03-15',
    };

    const result = applyAttempt(previous, 'user-1', '2026-03-15');

    expect(result).toStrictEqual(previous);
  });

  it('resets to 1 when a day was skipped, without a grace period', () => {
    const previous: Streak = {
      userId: 'user-1',
      currentStreak: 12,
      longestStreak: 12,
      lastAttemptDate: '2026-03-10',
    };

    const result = applyAttempt(previous, 'user-1', '2026-03-15');

    expect(result.currentStreak).toBe(1);
    // The record stands even after a reset.
    expect(result.longestStreak).toBe(12);
    expect(result.lastAttemptDate).toBe('2026-03-15');
  });

  it('never moves the streak backwards on an out-of-order write', () => {
    const previous: Streak = {
      userId: 'user-1',
      currentStreak: 5,
      longestStreak: 5,
      lastAttemptDate: '2026-03-15',
    };

    const result = applyAttempt(previous, 'user-1', '2026-03-14');

    expect(result).toStrictEqual(previous);
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
    };

    const result = applyAttempt(previous, 'user-1', '2026-03-01');

    expect(result.currentStreak).toBe(4);
  });
});
