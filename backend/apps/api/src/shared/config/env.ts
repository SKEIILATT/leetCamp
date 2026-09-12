import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

/**
 * Validated, typed environment. FAILS AT BOOT when something required is
 * missing or malformed — that is the entire point of this file. A half
 * configured server must never reach the point of listening on a port, because
 * from that moment on it answers 500 to everything and looks alive to the
 * orchestrator.
 *
 * `@t3-oss/env-core` does NOT load `.env` by itself. Node's native `--env-file`
 * does it (see the `dev` / `start` scripts of this workspace), so there is no
 * `dotenv` dependency.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * REQUIRED variables have NO default. Optional ones degrade with a warning and
 * document what is lost. A default on a security-relevant variable is a silent
 * failure: the day someone deploys without setting it, the server comes up
 * happily with the wrong value.
 *
 * Nothing with a client-visible prefix (`VITE_`, `NEXT_PUBLIC_`, …) may ever
 * appear here. That prefix publishes the value in the browser bundle.
 */

/**
 * PostgreSQL connection-string validator.
 *
 * `z.url()` alone is NOT used, for a concrete reason: it accepts anything the
 * `URL` constructor can parse, including `https://example.com`. Pasting the
 * wrong URL there — the natural confusion, since both live in the same file —
 * would pass validation and fail later, on the first query, with an
 * unreadable driver error.
 *
 * ⚠ THE `new URL()` CHECK IS THE IMPORTANT HALF. A password containing reserved
 * characters that were never percent-encoded produces a string that does not
 * parse. It reaches the driver intact and fails with an authentication error
 * that costs hours of looking for the wrong password. Here it fails at boot,
 * naming the variable.
 */
const postgresUrl = () =>
  z
    .string()
    .min(1)
    .refine((value) => /^postgres(ql)?:\/\//.test(value), {
      message: 'must start with postgresql:// or postgres://',
    })
    .refine(
      (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      {
        message:
          'does not parse as a URL — almost always a password that was not percent-encoded (@ : / ? # must be %40 %3A %2F %3F %23)',
      },
    );

export const env = createEnv({
  server: {
    /** Drives the logger configuration and the production gate on /openapi. */
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    PORT: z.coerce.number().int().positive().default(5090),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    /**
     * REQUIRED, deliberately WITHOUT a default.
     *
     * A default on a CORS allow-list is a silent security failure: the day
     * someone deploys without setting it, the server comes up happily accepting
     * another environment's origins. Better that the process dies at boot with
     * an explicit message.
     *
     * Format: CSV. The `.replace(/\/+$/, '')` is load-bearing — the browser's
     * `Origin` header is always `scheme://host[:port]` with NO trailing slash,
     * so an entry like `https://app.example.com/` would never match and would
     * break CORS in production silently.
     */
    CORS_ORIGINS: z
      .string()
      .min(1)
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim().replace(/\/+$/, ''))
          .filter(Boolean),
      ),

    /**
     * Publishes `GET /openapi`. Default `false`.
     *
     * The real gate is DOUBLE: `app.ts` additionally requires
     * `NODE_ENV !== 'production'`. Flipping this by mistake in production does
     * not expose the API surface.
     */
    ENABLE_OPENAPI_ENDPOINT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    /**
     * REQUIRED. The connection the RUNTIME uses — through the pooler, in
     * transaction mode, when there is one.
     */
    DATABASE_URL: postgresUrl(),

    /**
     * REQUIRED. The DIRECT connection, in session mode.
     *
     * NOT A DUPLICATE OF `DATABASE_URL`, and the distinction is load-bearing:
     * transaction-mode pooling does not support what migrations need
     * (statements depending on session state, advisory locks, DDL in long
     * transactions). The ORM uses this one for `migrate` and introspection, and
     * the other for the runtime.
     *
     * The application code never reads it — the ORM CLI does. It is validated
     * here anyway so that a malformed string breaks at server boot rather than
     * six weeks later, the first time someone tries to migrate.
     */
    DIRECT_URL: postgresUrl(),

    // ── Authentication ────────────────────────────────────────────────────────
    // Self-issued JWT (see docs/DECISIONS.md): this API signs AND verifies its
    // own tokens with a shared secret, there is no external identity provider
    // and no JWKS endpoint.
    /**
     * REQUIRED. `iss` claim this API stamps on every token it issues, and
     * requires on every token it verifies.
     *
     * Not optional and not defaulted on purpose: an issuer left loose turns a
     * configuration slip into "we accept tokens signed by anyone" — including,
     * for a self-issued setup, a token minted by a DIFFERENT deployment that
     * happens to share a leaked or default `JWT_SECRET`.
     */
    AUTH_ISSUER: z.url(),

    /** REQUIRED. `aud` claim, same reasoning as `AUTH_ISSUER`. */
    AUTH_AUDIENCE: z.string().min(1),

    /**
     * REQUIRED. HMAC secret used to both SIGN (login) and VERIFY (every
     * authenticated request) tokens. No default, ever: a default secret in a
     * self-issued setup does not degrade security, it deletes it — anyone
     * reading this file could then forge a valid token for any user.
     *
     * 32 bytes minimum (matches a 256-bit key for HS256). Generate one with
     * `openssl rand -base64 32`.
     */
    JWT_SECRET: z.string().min(32, 'must be at least 32 characters — generate with `openssl rand -base64 32`'),

    /** How long an issued token stays valid, in SECONDS. Default: 24h — this
     * product is a once-a-day challenge, not a long-lived session product, so
     * a same-day re-login is an acceptable and expected trade-off. */
    JWT_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),

    // ── Scheduler ─────────────────────────────────────────────────────────────
    /**
     * THE MASTER SWITCH. Default `false`, and the default is the important part:
     * turning jobs on has to be a deliberate act.
     *
     * ⚠ **IT MAY ONLY BE `true` ON ONE INSTANCE.** The scheduler is in-process
     * with no distributed coordination: two replicas with this on run every job
     * twice. That is data corruption, not a performance problem. See
     * `docs/deployment.md`.
     */
    SCHEDULER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),

    /**
     * Delay in MILLISECONDS between process start and the first run of jobs
     * marked `runOnBoot`.
     *
     * Not a whim: a container in a restart loop — bad credential, unreachable
     * database — that fires its jobs immediately turns ten restarts a minute
     * into a burst of real work. The delay does not fix the loop; it guarantees
     * a container that dies during startup dies BEFORE touching anything.
     */
    SCHEDULER_BOOT_DELAY_MS: z.coerce.number().int().nonnegative().default(10_000),

    /** Cadence of the reference heartbeat job, in MINUTES. */
    SCHEDULER_HEARTBEAT_MINUTES: z.coerce.number().int().positive().default(15),
  },
  runtimeEnv: process.env,
  // `CORS_ORIGINS=` (empty) must read as ABSENT and fail the boot, not as a
  // silently empty allow-list.
  emptyStringAsUndefined: true,
});

export type Env = typeof env;
