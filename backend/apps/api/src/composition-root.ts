import type { FastifyInstance } from 'fastify';
import { buildAuthUseCases, buildChallengesUseCases, buildSystemUseCases } from '@leetcamp/application';

import type { Env } from './shared/config/env.js';
import { API_VERSION } from './shared/version.js';
import { buildHttpApp } from './interfaces/http/app.js';
import { createJwtTokenService, createScryptPasswordHasher } from './infrastructure/auth/index.js';
import { createSystemClock } from './infrastructure/clock/index.js';
import { createUuidGenerator } from './infrastructure/id/index.js';
import {
  createPrismaCategoryRepository,
  createPrismaChallengeRepository,
  createPrismaClient,
  createPrismaDatabaseHealthProbe,
  createPrismaDifficultyRepository,
  createPrismaUserAuthorizationRepository,
  createPrismaUserRepository,
} from './infrastructure/persistence/index.js';
import {
  createInProcessScheduler,
  registerSchedulerJobs,
} from './infrastructure/scheduler/index.js';

/**
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ THE COMPOSITION ROOT — the ONE file that knows both the abstractions and  │
 * │ the concrete implementations. Everything above it depends only on ports.  │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 *   `buildHttpApp` NEVER opens a connection. `composeApp` is the only thing
 *   that does.
 *
 * That division is not bookkeeping. It is what lets the HTTP layer be booted
 * with stubs — no Postgres, no network, no credentials — which is the property
 * every test in `interfaces/http/` rests on. Move any of this code up into
 * `app.ts` and it is lost for the whole project at once.
 *
 * This is also the only file allowed to import the ORM, the auth SDK and
 * anything else in `infrastructure/`. `no-restricted-imports` in the root
 * eslint config enforces the ORM half mechanically.
 */
export async function composeApp(env: Env): Promise<FastifyInstance> {
  /**
   * ── THE SHARED ABORT SIGNAL ────────────────────────────────────────────────
   *
   * Every long-lived outbound operation — an HTTP call to a third party, a
   * stream, a retry loop — takes this signal. On shutdown it is aborted once,
   * and all of them unwind together.
   *
   * Without it, graceful shutdown is a lie: `app.close()` stops accepting
   * connections, but an in-flight 30-second call to an external provider keeps
   * the process alive until the orchestrator loses patience and SIGKILLs it.
   * The signal is what turns "stop taking work" into "stop doing work".
   */
  const shutdown = new AbortController();

  // ── Concrete adapters ──────────────────────────────────────────────────────
  //
  // Self-issued JWT (see docs/DECISIONS.md): the SAME service both signs
  // tokens at login and verifies them on every authenticated request, so it
  // satisfies both `TokenIssuer` and `TokenVerifier`.
  const jwtTokenService = createJwtTokenService({
    secret: env.JWT_SECRET,
    issuer: env.AUTH_ISSUER,
    audience: env.AUTH_AUDIENCE,
    ttlSeconds: env.JWT_TTL_SECONDS,
  });
  const tokenVerifier = jwtTokenService;

  const passwordHasher = createScryptPasswordHasher();
  const idGenerator = createUuidGenerator();

  // ── Database ───────────────────────────────────────────────────────────────
  //
  // THE ONLY instantiation of the client in the whole process. `DATABASE_URL`
  // is the runtime (pooled) connection; `DIRECT_URL` is not read here because
  // only the ORM CLI and migrations use it.
  const prisma = createPrismaClient({ connectionString: env.DATABASE_URL });

  /**
   * ── THE DEFERRED LOGGER REFERENCE ──────────────────────────────────────────
   *
   * The real logger is Fastify's and does not exist until after
   * `buildHttpApp`, yet the probe and the scheduler are ARGUMENTS to that call.
   * The circularity is resolved with a deferred reference rather than a second
   * logger: both are only invoked while serving a request or on a timer, i.e.
   * always after `app` has been assigned.
   *
   * A separate logger here would duplicate configuration — including the
   * `redact` paths that keep credentials out of the logs — and split the log
   * stream in two.
   */
  const appRef: { current?: FastifyInstance } = {};
  const log = {
    debug: (obj: unknown, msg: string) => appRef.current?.log.debug(obj, msg),
    info: (obj: unknown, msg: string) => appRef.current?.log.info(obj, msg),
    warn: (obj: unknown, msg: string) => appRef.current?.log.warn(obj, msg),
    error: (obj: unknown, msg: string) => appRef.current?.log.error(obj, msg),
  };

  const userRepository = createPrismaUserAuthorizationRepository(prisma, log);
  const databaseProbe = createPrismaDatabaseHealthProbe(prisma, log);

  const authUseCases = buildAuthUseCases({
    userRepository: createPrismaUserRepository(prisma, log),
    passwordHasher,
    tokenIssuer: jwtTokenService,
    idGenerator,
    clock: createSystemClock(),
  });

  const challengesUseCases = buildChallengesUseCases({
    challengeRepository: createPrismaChallengeRepository(prisma, log),
    categoryRepository: createPrismaCategoryRepository(prisma, log),
    difficultyRepository: createPrismaDifficultyRepository(prisma, log),
    idGenerator,
    clock: createSystemClock(),
  });

  // ── Scheduler ──────────────────────────────────────────────────────────────
  //
  // It does NOT start on construction: `start()` is called below, after the
  // jobs are registered and after `appRef` is set, so the `scheduler.started`
  // line comes out through the real logger instead of vanishing.
  const scheduler = createInProcessScheduler({
    enabled: env.SCHEDULER_ENABLED,
    bootDelayMs: env.SCHEDULER_BOOT_DELAY_MS,
    logger: log,
  });

  registerSchedulerJobs(scheduler, {
    system: buildSystemUseCases({ clock: createSystemClock() }),
    heartbeatMinutes: env.SCHEDULER_HEARTBEAT_MINUTES,
  });

  const app = await buildHttpApp({
    tokenVerifier,
    userRepository,
    databaseProbe,
    scheduler,
    authUseCases,
    challengesUseCases,
    config: {
      nodeEnv: env.NODE_ENV,
      logLevel: env.LOG_LEVEL,
      version: API_VERSION,
      corsOrigins: env.CORS_ORIGINS,
      // Already coerced to boolean by the env schema. The real gate is in
      // app.ts, which additionally requires nodeEnv !== 'production'.
      enableOpenApiEndpoint: env.ENABLE_OPENAPI_ENDPOINT,
    },
  });

  appRef.current = app;

  scheduler.start();

  /**
   * ── GRACEFUL SHUTDOWN ──────────────────────────────────────────────────────
   *
   * Registered AFTER the app is built and BEFORE `main.ts` starts listening.
   * `app.close()` — which SIGINT/SIGTERM trigger — runs this hook.
   *
   * ⚠ ONE HOOK, AND THE ORDER INSIDE IT IS THE ORDER YOU READ.
   *
   * These could be three separate `onClose` hooks. They are not, deliberately:
   * the order in which Fastify runs multiple `onClose` hooks is not something
   * worth betting shutdown integrity on. In a single hook the order is explicit
   * and reviewable.
   *
   *   1. Cancel the timers, so no new job iteration starts against a database
   *      that is about to disconnect.
   *   2. Abort in-flight outbound work, so nothing is still holding the event
   *      loop open.
   *   3. Only then release the connection pool.
   *
   * Skipping step 3 leaves connections dangling against the pooler on every
   * restart until they time out on their own — and poolers have limits.
   */
  app.addHook('onClose', async () => {
    scheduler.stop();
    shutdown.abort();
    await prisma.$disconnect();
  });

  return app;
}
