/**
 * Port for reading time. This is the most important port in the package and it
 * is not cosmetic: most non-trivial business rules are rules about dates.
 * Rolling windows, grace periods, SLA deadlines, "same working day".
 *
 * If the domain called `new Date()`, none of those rules would be testable:
 * you would have to wait real hours, fake the system clock, or pass the date in
 * as a parameter on every use case — which just moves the problem to the caller
 * and ends with the HTTP API accepting a date from the client. That is exactly
 * what we do not want: the client must not get to decide whether it was on
 * time.
 *
 * With the clock injected, a test pins the instant and asserts the exact
 * outcome:
 *
 * ```ts
 * const clock: Clock = { now: () => new Date('2026-03-15T08:00:00Z'), timeZone: 'UTC' };
 * ```
 *
 * ── WHY THE PORT CARRIES `timeZone` AND NOT JUST `now()` ─────────────────────
 *
 * `now()` returns an INSTANT (UTC). That is enough for duration rules ("have
 * more than 24 h passed since X?"), which are instant arithmetic.
 *
 * Calendar rules are not instant arithmetic. "Does this fall on the same
 * working day?" or "the last three months" depend on where the day starts, and
 * that is only defined relative to a time zone. If the port exposed only
 * `now()`, every use case would have to either (a) hardcode a zone, or (b) read
 * `process.env.TZ` — impure and forbidden here — or (c) silently inherit the
 * server's zone, which is how you get "the report changes when we deploy to
 * another region".
 *
 * Exposing the zone as part of the clock keeps the decision in one injectable
 * place, and lets tests pin 'UTC' to reason more easily. `timeZone` is an IANA
 * identifier; the actual conversion is done by whoever needs a calendar, with
 * `Intl`, no external dependency.
 */
export interface Clock {
  /** The current instant. Always absolute, never a "local" date. */
  now(): Date;

  /**
   * IANA time zone in which the business day is defined (e.g.
   * 'America/Guayaquil'). Infrastructure configures it; the domain only reads it.
   */
  readonly timeZone: string;
}
