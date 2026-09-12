import type { LoggerOptions } from 'pino';

/**
 * Pino options per environment, consumed by Fastify's built-in logger.
 *
 * - test        : silent, so the test runner's output stays readable
 * - development : pino-pretty, human readable
 * - production  : raw NDJSON for the log collector
 *
 * ── `redact` IS NOT COSMETIC ─────────────────────────────────────────────────
 * The Authorization header carries a bearer token: one log line containing it
 * hands a valid credential to anyone with access to the logs. Same for the
 * database URL, which embeds the password.
 *
 * ⚠ KNOWN LIMIT: `redact` matches OBJECT PATHS, not substrings. It cannot save a
 * secret embedded inside a URL that is logged as a bare string. That is why
 * `*.DATABASE_URL` is listed as a path — and why no credential may ever travel
 * as a query parameter.
 *
 * This is defence in depth, not the primary protection. The primary protection
 * is never logging whole configuration objects.
 */
export function loggerOptionsFor(
  nodeEnv: 'development' | 'test' | 'production',
  level: string,
): LoggerOptions | false {
  if (nodeEnv === 'test') return false;

  const base: LoggerOptions = {
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        '*.headers.Authorization',
        '*.headers.authorization',
        '*.DATABASE_URL',
        '*.DIRECT_URL',
        '*.AUTH_CLIENT_SECRET',
        '*.JWT_SECRET',
        // Add every new secret-bearing env var here as it is introduced. The
        // cost of listing one that never appears in a log is zero; the cost of
        // remembering later is not.
      ],
      censor: '[redacted]',
    },
  };

  if (nodeEnv === 'development') {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    };
  }

  return base;
}
