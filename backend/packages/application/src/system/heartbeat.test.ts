import { describe, expect, it } from 'vitest';
import type { Clock } from '@leetcamp/domain';

import { makeHeartbeat } from './heartbeat.js';

/**
 * The point of this spec is not the heartbeat. It is that a use case can be
 * exercised with a hand-written fake and NOTHING ELSE — no server, no database,
 * no test container, no mocking library. If a future use case cannot be tested
 * this way, it has infrastructure leaking into it.
 */
const frozenClock: Clock = {
  now: () => new Date('2026-03-15T08:00:00.000Z'),
  timeZone: 'UTC',
};

describe('makeHeartbeat', () => {
  it('reports one processed unit stamped with the injected clock', async () => {
    const heartbeat = makeHeartbeat({ clock: frozenClock });

    const result = await heartbeat();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.processed).toBe(1);
    expect(result.value.failed).toBe(0);
    // Exact assertion on a timestamp — only possible because the clock is a port.
    expect(result.value.detail?.at).toBe('2026-03-15T08:00:00.000Z');
  });
});
