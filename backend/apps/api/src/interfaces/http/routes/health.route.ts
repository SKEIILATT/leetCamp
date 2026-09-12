import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { DatabaseHealthProbe } from '@leetcamp/domain';

/**
 * Liveness and readiness probes. Both public, no authentication: the consumer
 * is the orchestrator, which has no token.
 *
 * ⚠ `operationId` IS MANDATORY ON EVERY ROUTE. Without it `openapi-typescript`
 * emits an empty `operations` map and the frontend's type helpers have no key
 * to work with. `apps/web/scripts/openapi.ts` fails the generation if any
 * operation is missing one, so forgetting it breaks the codegen rather than
 * degrading it quietly.
 *
 * The response Zod schema does double duty: it serialises the response AND
 * feeds the OpenAPI output. That is the entire point of the type provider — one
 * declaration, zero drift between what the runtime returns and what the spec
 * promises.
 */
export function registerHealthRoutes(
  app: FastifyInstance,
  version: string,
  databaseProbe?: DatabaseHealthProbe,
): void {
  /**
   * ⚠ LIVENESS DELIBERATELY DOES NOT TOUCH THE DATABASE.
   *
   * This is the probe the orchestrator uses to decide whether to KILL the
   * process. If it depended on Postgres, a database blip would kill and restart
   * every container — which fixes nothing and adds a restart loop on top of an
   * incident that already exists.
   *
   * Readiness — which DOES touch the database — is `GET /health/ready` below.
   * THEY ARE TWO SEPARATE ROUTES ON PURPOSE, and the separation is the important
   * part: liveness answers "should I kill the process?", readiness answers
   * "should I send it traffic?". Collapsing them into one gives you the restart
   * loop described above. The docker-compose healthcheck uses /health for
   * exactly this reason.
   */
  app.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
      schema: {
        operationId: 'getHealth',
        tags: ['system'],
        summary: 'Liveness probe',
        description:
          'Returns ok while the process is alive. Does NOT check database connectivity.',
        response: {
          200: z.object({
            status: z.literal('ok'),
            version: z.string().describe('Deployed service version.'),
            uptime: z.number().describe('Seconds the process has been alive.'),
          }),
        },
      },
    },
    async () => ({ status: 'ok' as const, version, uptime: process.uptime() }),
  );

  const databaseStatusSchema = z.object({
    status: z.enum(['ok', 'unreachable', 'not-configured']),
    latencyMs: z.number().optional().describe('Latency of the probe query, only when status is ok.'),
  });

  /**
   * Readiness probe.
   *
   * ⚠ NEVER returns the raw database error. A `pg` connection failure carries
   * the host, the user and sometimes the whole connection string, and this route
   * is public. The port already hands back a sanitised reason (see
   * `DatabaseHealthProbe`) and the real detail stays in the logs.
   *
   * 503 and not 500 when the database is down: the process is perfectly alive,
   * it just is not ready to serve traffic. A generic 5xx would make the
   * orchestrator restart it, which is precisely what does not fix a database
   * outage.
   *
   * `databaseProbe` is OPTIONAL in the signature, and that is load-bearing:
   * `app.ts` must not require a connection in order to be constructed. With no
   * probe injected the route still exists — the OpenAPI contract must not change
   * with server configuration — and answers 503 declaring `not-configured`,
   * which is the truth.
   */
  app.withTypeProvider<ZodTypeProvider>().get(
    '/health/ready',
    {
      schema: {
        operationId: 'getReadiness',
        tags: ['system'],
        summary: 'Readiness probe',
        description:
          'Checks database connectivity. Returns 503 when unreachable. GET /health does NOT depend on this check.',
        response: {
          200: z.object({ status: z.literal('ready'), database: databaseStatusSchema }),
          503: z.object({ status: z.literal('not-ready'), database: databaseStatusSchema }),
        },
      },
    },
    async (_req, reply) => {
      if (!databaseProbe) {
        return reply.code(503).send({
          status: 'not-ready' as const,
          database: { status: 'not-configured' as const },
        });
      }

      const result = await databaseProbe.check();
      if (!result.reachable) {
        return reply.code(503).send({
          status: 'not-ready' as const,
          database: { status: 'unreachable' as const },
        });
      }

      return reply.code(200).send({
        status: 'ready' as const,
        database: { status: 'ok' as const, latencyMs: result.latencyMs },
      });
    },
  );
}
