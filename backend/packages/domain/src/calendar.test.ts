import { describe, expect, it } from 'vitest';

import { formatCalendarDate } from './calendar.js';

describe('formatCalendarDate', () => {
  it('formats an instant as YYYY-MM-DD in UTC', () => {
    expect(formatCalendarDate(new Date('2026-03-15T08:00:00Z'), 'UTC')).toBe('2026-03-15');
  });

  it('pads single-digit month and day', () => {
    expect(formatCalendarDate(new Date('2026-01-05T00:00:00Z'), 'UTC')).toBe('2026-01-05');
  });

  /**
   * THE reason this function exists instead of `toISOString().slice(0, 10)`:
   * the same instant is a DIFFERENT calendar date depending on the zone. This
   * is what lets a per-user streak cutoff (docs/DECISIONS.md) exist at all.
   */
  it('the same instant can fall on different calendar dates in different zones', () => {
    const lateNightUtc = new Date('2026-03-15T23:30:00Z');

    expect(formatCalendarDate(lateNightUtc, 'UTC')).toBe('2026-03-15');
    // Guayaquil is UTC-5: 23:30 UTC is already 18:30 the same day there, but
    // the point stands with a zone far enough west/east — Auckland (UTC+13)
    // has already turned the page to the 16th.
    expect(formatCalendarDate(lateNightUtc, 'Pacific/Auckland')).toBe('2026-03-16');
  });
});
