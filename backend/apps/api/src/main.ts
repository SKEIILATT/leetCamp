import { composeApp } from './composition-root.js';
import { env } from './shared/config/env.js';

/**
 * Process entry point. Importing `env` ALREADY validates it (fail fast on
 * incomplete configuration), then the composition root wires everything and
 * Fastify starts listening.
 *
 * `host: '0.0.0.0'` is mandatory, not a default: inside a container, binding to
 * 127.0.0.1 leaves the port unreachable from outside and the healthcheck fails
 * with no explanation.
 *
 * ── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────
 * SIGINT/SIGTERM call `app.close()`, which runs the `onClose` hook registered in
 * the composition root (stop the scheduler, abort in-flight work, disconnect the
 * database).
 *
 * ⚠ The explicit `process.exit(0)` afterwards is intentional: without it, a
 * single lingering handle can keep the process hanging, and the orchestrator
 * eventually kills it with SIGKILL — precisely what graceful shutdown exists to
 * avoid. The exit code stays 0 because a requested shutdown is not a failure.
 *
 * ⚠ The signal handlers are NOT guarded against re-entry here for brevity. If
 * your platform can deliver SIGTERM twice (some orchestrators do during a
 * rollout), add a `let closing = false` guard: calling `app.close()` twice
 * concurrently runs the `onClose` hook twice, and `$disconnect` on an already
 * disconnected pool is not something to find out about during an incident.
 */
async function main(): Promise<void> {
  const app = await composeApp(env);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  // `console.error` and not `app.log`: when the failure is env validation or
  // composition, no Fastify instance — and therefore no logger — exists yet.
  console.error('Fatal boot error:', error);
  process.exit(1);
});
