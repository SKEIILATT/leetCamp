/**
 * Database connectivity probe port.
 *
 * It exists as a PORT, and not as "the ORM client injected into the route", for
 * the same reason as everything else here: `buildHttpApp` must not know about
 * the ORM. If the readiness route imported the database client, the HTTP layer
 * would stop being bootable with stubs and every future test would need a real
 * database.
 *
 * The contract is deliberately poor: no queries, no transactions, no client.
 * It only answers "can we talk to the database right now?". Keeping it that
 * narrow is what stops the health route from turning into a back door.
 */
export interface DatabaseHealthProbe {
  /**
   * Check connectivity with the cheapest possible query.
   *
   * NEVER THROWS. A readiness check that blows up with an exception is an
   * opaque 500 instead of an informative 503, and whoever consumes it (the
   * orchestrator, the reverse proxy) needs to tell "alive but not ready" from
   * "broken".
   *
   * @returns `reachable: true` with the measured latency, or `reachable: false`
   *          with an ALREADY SANITISED reason: the message travels all the way
   *          into the HTTP response, and a raw Postgres error can carry the
   *          host, the user or fragments of the connection string.
   */
  check(): Promise<DatabaseHealthResult>;
}

export type DatabaseHealthResult =
  | { readonly reachable: true; readonly latencyMs: number }
  | { readonly reachable: false; readonly reason: string };
