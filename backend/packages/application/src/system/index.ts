import type { Clock } from '@leetcamp/domain';

import { makeHeartbeat } from './heartbeat.js';

/**
 * The BUNDLE of the `system` vertical.
 *
 * Every vertical exports one factory that takes the vertical's dependencies and
 * returns an object with its use cases already wired. The composition root
 * calls this once and hands the result to whoever needs it.
 *
 * ⚠ THE BUNDLE'S SURFACE IS A SECURITY DECISION, NOT AN ERGONOMIC ONE. Whatever
 * you export here becomes callable from the HTTP layer. A use case that only
 * an internal job should ever invoke does NOT belong in the bundle; wire it
 * directly where it is used. "Export everything, restrict later" is how an
 * internal operation ends up one route away from being public.
 *
 * `system` is the vertical for work with no business owner. Real jobs go in
 * their own vertical, next to the domain they belong to.
 */
export interface SystemDeps {
  readonly clock: Clock;
}

export function buildSystemUseCases(deps: SystemDeps) {
  return {
    heartbeat: makeHeartbeat({ clock: deps.clock }),
  };
}

export type SystemUseCases = ReturnType<typeof buildSystemUseCases>;
