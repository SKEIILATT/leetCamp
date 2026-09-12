import type { JobSchedule } from '@leetcamp/domain';

/**
 * The scheduler's timing arithmetic, EXTRACTED ON PURPOSE.
 *
 * Everything here is pure: it takes a `JobSchedule` and an instant and returns
 * a number of milliseconds. Not one function in this file touches a timer. That
 * is what lets "when does it run next" — the place where the bugs actually live
 * — be tested with exact assertions and without waiting a single real
 * millisecond.
 */

/**
 * Node stores a timer delay in a signed 32-bit integer.
 *
 * A delay above this ceiling does NOT wait longer: it overflows SILENTLY and is
 * clamped to 1 ms, turning the timer into a hot loop. This is not hypothetical
 * — a misconfigured interval in a real deployment produced
 * `TimeoutOverflowWarning: Timeout duration was set to 1` and fired a real sync
 * EVERY MILLISECOND from boot.
 *
 * Clamping turns "hammer the system forever" into "run at most once every ~24.8
 * days", which still honours the intent of an absurdly large interval (run very
 * rarely) without the catastrophe.
 */
export const MAX_TIMER_MS = 2_147_483_647;

/**
 * Floor on the delay. The ceiling protects one extreme; this protects the other,
 * which is just as destructive and considerably easier to type: a `0` interval
 * gives a `setTimeout(fn, 0)` that reschedules itself — the same hot loop
 * through the front door.
 */
export const MIN_TIMER_MS = 1_000;

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Milliseconds from `now` until the next run of `schedule`.
 *
 * `dailyAtUtc` is computed in UTC end to end (`Date.UTC` plus UTC getters),
 * never through the process's local time. Deliberate: the container's zone is
 * not part of the contract, and daylight saving simply does not exist in UTC —
 * the same computation in local time would have two days a year with 23 or 25
 * hours and a job that skips or double-fires.
 *
 * When today's time has already passed (or is exactly now), the next run is
 * tomorrow. The "exactly now" case jumping to tomorrow is intentional: it stops
 * a run that finishes in the same millisecond it started from firing in a loop.
 *
 * ⚠ Returns the RAW value, unclamped. Callers must pass it through
 * `clampDelayMs` — which lets them log `wasClamped` instead of trimming in
 * silence.
 */
export function nextDelayMs(schedule: JobSchedule, now: Date): number {
  switch (schedule.kind) {
    case 'everyMinutes':
      return Math.round(schedule.minutes * 60_000);

    case 'dailyAtUtc': {
      const todayAt = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        schedule.hour,
        schedule.minute,
        0,
        0,
      );
      const delta = todayAt - now.getTime();
      return delta > 0 ? delta : delta + DAY_MS;
    }
  }
}

export interface ClampedDelay {
  readonly delayMs: number;
  /** `true` when the requested delay was outside the representable range. */
  readonly wasClamped: boolean;
}

/**
 * Confine a delay between the floor and the ceiling, REPORTING whether it had
 * to. The report is the point: a value that was clamped means the configuration
 * says something the runtime cannot honour, and that deserves a warning line
 * rather than silent correction.
 */
export function clampDelayMs(requestedMs: number): ClampedDelay {
  if (!Number.isFinite(requestedMs)) {
    return { delayMs: MIN_TIMER_MS, wasClamped: true };
  }
  if (requestedMs < MIN_TIMER_MS) return { delayMs: MIN_TIMER_MS, wasClamped: true };
  if (requestedMs > MAX_TIMER_MS) return { delayMs: MAX_TIMER_MS, wasClamped: true };
  return { delayMs: Math.round(requestedMs), wasClamped: false };
}
