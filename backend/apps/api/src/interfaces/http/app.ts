import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fastifyCors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type {
  DatabaseHealthProbe,
  RecurringJobScheduler,
  TokenVerifier,
  UserAuthorizationRepository,
} from '@leetcamp/domain';
import type {
  AdminUsersUseCases,
  AttemptsUseCases,
  AuthUseCases,
  ChallengesUseCases,
  DailyChallengesUseCases,
  PasswordResetUseCases,
  RankingUseCases,
} from '@leetcamp/application';

import { loggerOptionsFor } from '../../shared/logger.js';
import { authPlugin } from './plugins/auth.plugin.js';
import { registerAdminChallengeRoutes } from './routes/admin-challenges.route.js';
import { registerAdminUsersRoutes } from './routes/admin-users.route.js';
import { registerAttemptsRoutes } from './routes/attempts.route.js';
import { registerAuthRoutes } from './routes/auth.route.js';
import { registerDailyChallengeRoutes } from './routes/daily-challenge.route.js';
import { registerHealthRoutes } from './routes/health.route.js';
import { registerMeRoutes } from './routes/me.route.js';
import { registerPasswordResetRoutes } from './routes/password-reset.route.js';
import { registerRankingRoutes } from './routes/ranking.route.js';

export interface HttpAppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly logLevel: string;
  /** Version reported by GET /health. See shared/version.ts. */
  readonly version: string;
  /**
   * Browser origins allowed EXACTLY by CORS. localhost / 127.0.0.1 on any port
   * are allowed separately, through the anchored regex below.
   */
  readonly corsOrigins: readonly string[];
  /**
   * Exposes `GET /openapi`. NOT the only lock: the real gate is double —
   * `nodeEnv !== 'production'` **AND** this flag. Defence in depth on purpose,
   * so flipping the variable by mistake in a production deploy does NOT publish
   * the whole API surface.
   */
  readonly enableOpenApiEndpoint: boolean;
}

export interface HttpAppDeps {
  readonly config: HttpAppConfig;

  /** Identity layer 1. Arrives as a PORT, which is what lets tests inject a stub. */
  readonly tokenVerifier: TokenVerifier;

  /** Identity layer 2. Another port — swapping the ORM never reaches this file. */
  readonly userRepository: UserAuthorizationRepository;

  /**
   * Database connectivity probe, consumed ONLY by `GET /health/ready`.
   *
   * OPTIONAL on purpose, and it is a design decision rather than a convenience:
   * if it were required, every test that mounts this app to check CORS or error
   * handling would have to fabricate a database double. It is still a PORT — no
   * ORM client enters here, now or later.
   */
  readonly databaseProbe?: DatabaseHealthProbe;

  /**
   * Cron scheduler, consumed ONLY to READ state.
   *
   * ⚠ `buildHttpApp` neither starts nor stops it. Its lifecycle belongs to the
   * composition root, like the database client's.
   */
  readonly scheduler?: RecurringJobScheduler;

  // Use cases are injected HERE as they arrive. Keep the shape explicit — never
  // a bag of `any` — because that is exactly what lets tests boot this app with
  // stubs and still be type-checked.
  readonly authUseCases: AuthUseCases;
  readonly challengesUseCases: ChallengesUseCases;
  readonly dailyChallengesUseCases: DailyChallengesUseCases;
  readonly attemptsUseCases: AttemptsUseCases;
  readonly adminUsersUseCases: AdminUsersUseCases;
  readonly rankingUseCases: RankingUseCases;
  readonly passwordResetUseCases: PasswordResetUseCases;
}

/**
 * Builds ONLY the HTTP layer: Fastify + the Zod type provider + plugins +
 * routes. Dependencies arrive by injection and this function opens NO database
 * or network connection.
 *
 * That is not a style detail: it is what keeps the interface layer free of
 * infrastructure and what lets tests boot the app with stubs, without Postgres
 * and without reaching the internet. Every future feature leans on that
 * property. If someone puts a database client in here, it is lost for the whole
 * project at once. The single place where concretes are instantiated is
 * `composition-root.ts`.
 *
 * ⚠⚠ THE NUMBERED ORDER BELOW IS LOAD-BEARING, NOT DECORATIVE. Each step says
 * why. A different order breaks in ways that are hard to diagnose — several of
 * them silently.
 */
export async function buildHttpApp(deps: HttpAppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // Behind the reverse proxy, `req.ip` must be the real client IP and not the
    // proxy's, or the per-IP rate limit throttles everyone as one bucket.
    trustProxy: true,
    logger: loggerOptionsFor(deps.config.nodeEnv, deps.config.logLevel),
  }).withTypeProvider<ZodTypeProvider>();

  // 1) Zod compilers BEFORE registering any route — including routes that live
  //    inside plugins. A route registered earlier falls back to Ajv in silence
  //    and then blows up with FST_ERR_SCH_VALIDATION_BUILD against the Zod
  //    object.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // 2) Global error handling, BEFORE the routes so nothing escapes. Without
  //    `setErrorHandler` / `setNotFoundHandler` there are holes through which
  //    Fastify's default shapes come out, and those do NOT match our
  //    `{ message, code }` envelope. A client parsing errors would then have two
  //    shapes to handle and would get one of them wrong.
  app.setErrorHandler((err, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      req.log.warn({ err }, 'request validation failed');
      return reply.code(400).send({ message: 'Invalid request payload', code: 'VALIDATION' });
    }

    if (isResponseSerializationError(err)) {
      // Almost always means a repository returned a BigInt or a Decimal that was
      // never mapped (see infrastructure/persistence/type-mappers.ts). This
      // branch exists on purpose: it turns an opaque JSON.stringify crash into a
      // localised error carrying the method and URL that produced it.
      req.log.error({ err, method: err.method, url: err.url }, 'response serialization failed');
      return reply.code(500).send({ message: 'Internal server error', code: 'REPOSITORY' });
    }

    req.log.error({ err }, 'unhandled error');
    // Both type guards above accept `unknown`, so their negative branches widen
    // `err` back to `unknown` instead of FastifyError. Re-narrow through the
    // framework's own error shape.
    const fastifyError = err as FastifyError;
    const status = fastifyError.statusCode ?? 500;

    if (fastifyError.code && status < 500) {
      return reply.code(status).send({ message: fastifyError.message, code: fastifyError.code });
    }

    // NON-NEGOTIABLE: never leak `err.message` on a 5xx. It can carry connection
    // strings, SQL fragments or service keys. Log it whole, answer generically.
    return reply.code(status).send({
      message: status >= 500 ? 'Internal server error' : fastifyError.message,
      code: status >= 500 ? 'REPOSITORY' : 'VALIDATION',
    });
  });

  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ message: 'Route not found', code: 'NOT_FOUND' }),
  );

  // 3) Rate limit. `global: false` is intentional: it does NOT throttle
  //    everything, only routes that opt in. /health is polled by the
  //    orchestrator very frequently and throttling it causes restart cascades —
  //    a rate limiter that triggers container restarts is worse than none.
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (req) => req.ip,
    allowList: ['127.0.0.1'],
    errorResponseBuilder: (_req, ctx) => ({
      code: 'RATE_LIMITED',
      statusCode: ctx.statusCode,
      message: `Too many requests, retry in ${ctx.after}`,
    }),
  });

  // 4) CORS, before swagger and before every route, so its `onRequest` hook and
  //    the global `OPTIONS *` preflight route cover the whole surface.
  //    Registered on the ROOT instance: @fastify/cors is wrapped in
  //    fastify-plugin, so it deliberately breaks encapsulation and applies to
  //    everything added after it. Registering it inside a route scope would
  //    leave the rest of the app without CORS.
  //
  //    `origin` is a FUNCTION so we can allow an exact allow-list PLUS
  //    localhost/127.0.0.1 on any port (the dev port varies) without
  //    enumerating every port.
  //
  //    ⚠ A disallowed origin is answered WITHOUT the Access-Control-Allow-Origin
  //    header. It is NOT an error — the browser is what blocks the read, not the
  //    server — so this calls `cb(null, false)` and NEVER `cb(new Error(...))`,
  //    which would surface as a 500 and make a routine cross-origin probe look
  //    like a server fault in the logs.
  const localhostOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      // No Origin header => not a cross-origin browser request (curl,
      // server-to-server, same origin). CORS does not apply; allow it. This is
      // NOT an authentication bypass: that is the auth plugin's job, a separate
      // layer.
      if (!origin) return cb(null, true);
      // Exact string equality against the allow-list (Array.includes), NOT a
      // substring check: a substring check would accept evil-localhost.com.
      if (deps.config.corsOrigins.includes(origin)) return cb(null, true);
      // Anchored regex: the `^...$` ARE the defence. Never `origin.includes('localhost')`.
      if (localhostOrigin.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    // `credentials` MUST stay false while auth is a stateless
    // `Authorization: Bearer` header set by the frontend's own JS rather than an
    // ambient cookie. No cookie, no CSRF surface — and `credentials: true` is
    // additionally incompatible with any wildcard.
    credentials: false,
  });

  // 5) OpenAPI, generated from the routes' Zod schemas. Its place is HERE, after
  //    CORS and before the routes: swagger must see the schemas of routes
  //    registered after it.
  //
  //    ⚠ `openapi: '3.1.0'` IS EXPLICIT AND IS THE MOST IMPORTANT LINE IN THIS
  //    BLOCK. `jsonSchemaTransform` emits JSON Schema draft 2020-12: OpenAPI 3.1
  //    accepts it, 3.0 does not. @fastify/swagger defaults to 3.0.3, and under
  //    3.0 several Zod 4 constructs (`nullable`, `const`, numeric
  //    `exclusiveMinimum`) serialise WRONG AND SILENTLY — the document is
  //    produced, nothing errors, and the types the frontend derives from it come
  //    out incorrect. Deleting this line is the single most likely root cause of
  //    a future "the generated types do not match the API". One line prevents it,
  //    and `scripts/openapi.ts` on the web side asserts it a second time.
  //
  //    `transformObject` (in addition to `transform`) is what emits schemas
  //    carrying `.meta({ id })` as reusable components under
  //    `#/components/schemas` instead of inlining them per route.
  //    `ErrorResponseSchema` depends on it to come out as a single referenced
  //    `Error`.
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'leetcamp API',
        version: deps.config.version,
        description:
          'HTTP contract of leetcamp. Generated from each route Zod schema: there is no shared types package between api and web — THIS document is the contract.',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Session token. Header `Authorization: Bearer <token>`.',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });

  // 6) Authentication plugin. Its position is load-bearing twice over:
  //
  //    · AFTER swagger, so protected routes registered in step 7 appear in the
  //      document with their `security: [{ bearerAuth: [] }]`.
  //    · BEFORE the routes, because it decorates `app.authenticate` /
  //      `app.requireRole`, and a route registered before the decoration exists
  //      crashes at boot with `FST_ERR_DEC_UNDECLARED`.
  //
  //    It receives PORTS, never clients: `buildHttpApp` still opens no
  //    connections.
  await app.register(authPlugin, {
    tokenVerifier: deps.tokenVerifier,
    userRepository: deps.userRepository,
  });

  // 7) Routes.
  registerHealthRoutes(app, deps.config.version, deps.databaseProbe);
  registerAuthRoutes(app, deps.authUseCases);
  registerPasswordResetRoutes(app, deps.passwordResetUseCases);
  registerAdminChallengeRoutes(app, deps.challengesUseCases);
  registerDailyChallengeRoutes(app, deps.dailyChallengesUseCases);
  registerAttemptsRoutes(app, deps.attemptsUseCases);
  registerAdminUsersRoutes(app, deps.adminUsersUseCases);
  registerRankingRoutes(app, deps.rankingUseCases);
  registerMeRoutes(app);

  // 8) The spec endpoint, GATED: never available in production.
  //
  //    The gate is DOUBLE on purpose — `nodeEnv !== 'production'` **and** the
  //    flag. Even if someone sets the env var by mistake in a production
  //    deployment, the environment check still blocks it, and the 404 is served
  //    by step 2's `setNotFoundHandler` with the normal envelope: from outside
  //    it is indistinguishable from a route that never existed.
  if (deps.config.nodeEnv !== 'production' && deps.config.enableOpenApiEndpoint) {
    //  `hide: true` keeps it OUT of the document itself. Not cosmetic: every
    //  operation in the spec becomes an entry in the `operations` map the
    //  frontend generates, and this one has no `operationId` and no response
    //  schema — it would show up as an anonymous, untyped operation inside the
    //  generated client. The spec describes the API, not the mechanism that
    //  publishes it.
    app.get('/openapi', { schema: { hide: true } }, async () => app.swagger());
  }

  return app;
}
