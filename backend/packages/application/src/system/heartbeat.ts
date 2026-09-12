import { ok, type Clock, type JobRunOutcome, type Result } from '@leetcamp/domain';

/**
 * Reference use case. Delete it as soon as you have a real vertical — it is
 * here to demonstrate the shape, not to stay.
 *
 * ── THE SHAPE: A FACTORY THAT RETURNS A FUNCTION ─────────────────────────────
 *
 *   makeX(deps) -> (input) => Promise<Result<Output>>
 *
 * Dependencies are bound once, at composition time. The returned function takes
 * only the input. That is what makes a use case callable in a test with three
 * lines and no framework:
 *
 * ```ts
 * const heartbeat = makeHeartbeat({ clock: { now: () => new Date(0), timeZone: 'UTC' } });
 * const result = await heartbeat();
 * ```
 *
 * The alternative — a class with an injected constructor, or a function taking
 * `(deps, input)` — either drags a container in or forces every call site to
 * carry the dependencies around. Neither buys anything here.
 *
 * ⚠ NOTE WHAT IS ABSENT: no `new Date()`. The instant comes from the `Clock`
 * port. That is the whole point of the port, and this trivial job is the
 * cheapest place to see it.
 */
export interface HeartbeatDeps {
  readonly clock: Clock;
}

export function makeHeartbeat(deps: HeartbeatDeps): () => Promise<Result<JobRunOutcome>> {
  return async () => {
    const at = deps.clock.now();

    return ok({
      processed: 1,
      succeeded: 1,
      failed: 0,
      detail: { at: at.toISOString(), timeZone: deps.clock.timeZone },
    });
  };
}
