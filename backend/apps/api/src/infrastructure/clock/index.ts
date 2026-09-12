import type { Clock } from '@leetcamp/domain';

/**
 * The system clock. The one place in the process allowed to call `new Date()`.
 *
 * `timeZone` is injected rather than read from `process.env.TZ` so the
 * business day is a configuration decision and not an accident of the
 * container's locale. Deploying to a different region must not move the
 * boundaries of a report.
 */
export function createSystemClock(timeZone = 'UTC'): Clock {
  return {
    now: () => new Date(),
    timeZone,
  };
}
