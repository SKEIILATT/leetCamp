import { PrismaPg } from '@prisma/adapter-pg';
import type { DatabaseHealthProbe, DatabaseHealthResult } from '@leetcamp/domain';

import { PrismaClient, type Prisma } from '../../generated/prisma/index.js';

/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ THE ONLY FILE IN THE PROJECT THAT IMPORTS THE GENERATED ORM CLIENT.       │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Everything else — repositories included — imports the `PrismaClient` TYPE
 * from here, never from the generated directory. The root `eslint.config.js`
 * enforces it with `no-restricted-imports`, so the rule is mechanical rather
 * than aspirational.
 *
 * Why it matters: the generated client's import path is an artefact of the
 * generator's `output` setting. When it moves — a Prisma major, a change of
 * generator, a switch to another ORM entirely — one file changes instead of
 * every repository in the codebase.
 *
 * ⚠ THIS FILE OPENS CONNECTIONS. Only the composition root may call it.
 * `buildHttpApp` does not import it and must never import it: if it did, the
 * HTTP layer would stop being bootable without Postgres and every test that
 * mounts the app with stubs would suddenly need a database.
 *
 * ── WHY A DRIVER ADAPTER AND NOT THE NATIVE ENGINE ───────────────────────────
 * With the adapter the connection is governed by `pg` (node-postgres) and
 * Prisma stops loading its native query-engine binary. Three concrete
 * consequences:
 *
 *   1. The pool is `pg`'s: configurable and observable from JavaScript. Behind
 *      a transaction-mode pooler that matters.
 *   2. No per-platform native binary to ship in the image.
 *   3. `pg` does not use named prepared statements by default, which is exactly
 *      what breaks against PgBouncer in transaction mode.
 */

export interface PrismaClientOptions {
  /** The RUNTIME connection string (`DATABASE_URL`), not the direct one. */
  readonly connectionString: string;
}

export function createPrismaClient(options: PrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({ connectionString: options.connectionString });
  return new PrismaClient({ adapter });
}

/**
 * Re-export of the client TYPE so repositories can be typed without importing
 * the generated directory. See the boundary note at the top of the file.
 */
export type { PrismaClient, Prisma };

/**
 * The type of the `tx` handed to `prisma.$transaction(async (tx) => ...)`.
 * Structurally identical to `PrismaClient` for every model delegate
 * (`tx.attempt`, `tx.streak`, ...) — it just drops `$transaction` itself and
 * the connection-lifecycle methods, which a callback running INSIDE a
 * transaction must never call. Repositories that need to work both against
 * the top-level client and inside a transaction (see
 * `prisma-attempt-transaction-runner.ts`) accept `PrismaClient |
 * PrismaTransactionClient` instead of only `PrismaClient`.
 */
export type PrismaTransactionClient = Prisma.TransactionClient;

/**
 * Readiness probe over an already-constructed client.
 *
 * `SELECT 1` and nothing else: it reads no table, so it does not depend on
 * row-level security, on schema grants, or on any migration having run. It
 * checks the one thing it claims to check — that there is a usable connection.
 */
export function createPrismaDatabaseHealthProbe(
  prisma: PrismaClient,
  logger?: { error: (obj: unknown, msg: string) => void },
): DatabaseHealthProbe {
  return {
    async check(): Promise<DatabaseHealthResult> {
      const startedAt = performance.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
        return { reachable: true, latencyMs: Math.round(performance.now() - startedAt) };
      } catch (error) {
        // ⚠ THE DETAIL IS LOGGED BUT DOES NOT TRAVEL IN THE RESPONSE. Postgres
        // connection errors carry the host, the user and sometimes the whole
        // connection string, and this response is served by a PUBLIC endpoint.
        // The port's contract already says the reason must arrive sanitised;
        // this is where that promise is kept.
        logger?.error({ err: error }, 'readiness: the database is not answering');
        return { reachable: false, reason: 'database unreachable' };
      }
    },
  };
}
