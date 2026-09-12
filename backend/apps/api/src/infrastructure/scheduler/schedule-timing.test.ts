import { describe, expect, it } from 'vitest';
import type { JobSchedule } from '@leetcamp/domain';

import { clampDelayMs, MAX_TIMER_MS, MIN_TIMER_MS, nextDelayMs } from './schedule-timing.js';

/**
 * Every assertion here is about arithmetic, and not one of them waits. That is
 * why the arithmetic lives in its own file: testing "does it run tomorrow at
 * 06:00" through a real timer is not a test, it is a bet.
 */
describe('nextDelayMs', () => {
  it('converts an interval in minutes to milliseconds', () => {
    const schedule: JobSchedule = { kind: 'everyMinutes', minutes: 15 };
    expect(nextDelayMs(schedule, new Date('2026-03-15T08:00:00Z'))).toBe(900_000);
  });

  it('targets today when the daily time is still ahead', () => {
    const schedule: JobSchedule = { kind: 'dailyAtUtc', hour: 6, minute: 30 };
    const now = new Date('2026-03-15T06:00:00Z');
    expect(nextDelayMs(schedule, now)).toBe(30 * 60_000);
  });

  it('rolls over to tomorrow when the daily time has passed', () => {
    const schedule: JobSchedule = { kind: 'dailyAtUtc', hour: 6, minute: 0 };
    const now = new Date('2026-03-15T07:00:00Z');
    expect(nextDelayMs(schedule, now)).toBe(23 * 60 * 60_000);
  });

  /**
   * "Exactly now" must roll over, not fire immediately: otherwise a run that
   * finishes in the same millisecond it started reschedules itself into a loop.
   */
  it('rolls over when the daily time is exactly now', () => {
    const schedule: JobSchedule = { kind: 'dailyAtUtc', hour: 6, minute: 0 };
    const now = new Date('2026-03-15T06:00:00.000Z');
    expect(nextDelayMs(schedule, now)).toBe(24 * 60 * 60_000);
  });

  /**
   * The computation must be in UTC, not local time. Run on a machine set to a
   * DST-observing zone, a local-time implementation gets this wrong twice a
   * year — which is exactly the kind of bug nobody reproduces.
   */
  it('computes in UTC regardless of the host time zone', () => {
    const schedule: JobSchedule = { kind: 'dailyAtUtc', hour: 0, minute: 0 };
    const now = new Date('2026-06-15T23:30:00Z');
    expect(nextDelayMs(schedule, now)).toBe(30 * 60_000);
  });
});

describe('clampDelayMs', () => {
  it('leaves a reasonable delay untouched and reports no clamping', () => {
    expect(clampDelayMs(60_000)).toStrictEqual({ delayMs: 60_000, wasClamped: false });
  });

  /** The hot loop through the front door: a zero or negative interval. */
  it.each([0, -1, 10])('raises %i to the floor and reports it', (input) => {
    expect(clampDelayMs(input)).toStrictEqual({ delayMs: MIN_TIMER_MS, wasClamped: true });
  });

  /** The 32-bit overflow, which Node turns into a 1 ms timer without complaint. */
  it('lowers a delay above the 32-bit ceiling and reports it', () => {
    expect(clampDelayMs(MAX_TIMER_MS + 1)).toStrictEqual({
      delayMs: MAX_TIMER_MS,
      wasClamped: true,
    });
  });

  it('treats NaN as the floor rather than passing it to setTimeout', () => {
    expect(clampDelayMs(Number.NaN)).toStrictEqual({ delayMs: MIN_TIMER_MS, wasClamped: true });
  });
});
