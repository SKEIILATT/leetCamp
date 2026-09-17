import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AuthUseCases } from '@leetcamp/application';

import { errorBody, ErrorResponseSchema, statusForError } from '../result-to-http.js';

/**
 * `POST /api/v1/auth/register` and `POST /api/v1/auth/login` — the two public
 * (unauthenticated) entry points into the `auth` vertical. Both PUBLIC: no
 * `preHandler: [app.authenticate]` and no `security` in their schema, which is
 * the correct state for endpoints whose entire job is to hand out a credential
 * to someone who does not have one yet.
 */

// Trim + lower-case BEFORE the format check, not after: `.email()` validates
// the raw string, so a padded `" a@b.com "` would fail the format check if it
// ran before trimming. `.pipe()` sequences the two correctly.
const NormalizedEmail = z.string().trim().toLowerCase().pipe(z.email());

const RegisterBodySchema = z.object({
  email: NormalizedEmail,
  // No upper-bound tied to a specific algorithm (unlike bcrypt's 72-byte cap):
  // scrypt has none. The 128 cap here is only to stop someone sending a
  // multi-megabyte "password" and burning CPU on it.
  password: z.string().min(8, 'must be at least 8 characters').max(128),
  displayName: z.string().trim().min(1).max(80),
  // Defaults to the timezone used throughout docs/DECISIONS.md's examples.
  // There is no way yet for a client to discover this from the browser — the
  // frontend does not exist — so a sane default beats a required field nobody
  // can currently fill in correctly.
  timezone: z.string().min(1).max(64).default('America/Guayaquil'),
});

const LoginBodySchema = z.object({
  email: NormalizedEmail,
  // No `.min(8)` here on purpose: a login attempt with a short password must
  // fail as `invalidCredentials()` (401), the same as any other wrong
  // password — not as a 400 that tells the caller their password never met
  // the length rule, which leaks nothing but is still one more oracle bit.
  password: z.string().min(1),
});

export function registerAuthRoutes(app: FastifyInstance, authUseCases: AuthUseCases): void {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/v1/auth/register',
    {
      // Rate-limited: an unauthenticated endpoint that writes to the DB and
      // sends no confirmation email is a spam-account vector without it.
      // Registered global-`rateLimit` plugin is `global: false` — routes must
      // opt in explicitly, see app.ts.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        operationId: 'registerUser',
        tags: ['auth'],
        summary: 'Create a student account',
        body: RegisterBodySchema,
        response: {
          201: z.object({ userId: z.string() }),
          400: ErrorResponseSchema,
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await authUseCases.registerUser(request.body);
      if (!result.ok) {
        // `statusForError` returns `number` — the domain error catalogue is
        // wider than what any single route declares. The cast narrows to
        // exactly the codes THIS route's schema promises above.
        return reply
          .status(statusForError(result.error) as 400 | 409 | 500)
          .send(errorBody(result.error));
      }
      return reply.status(201).send({ userId: result.value.userId });
    },
  );

  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/v1/auth/login',
    {
      // Rate-limited: this is the credential-brute-force target. `max: 10`
      // per IP/minute is generous enough for a real user mistyping a
      // password, tight enough to make guessing a password impractical.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        operationId: 'loginUser',
        tags: ['auth'],
        summary: 'Exchange credentials for a bearer token',
        body: LoginBodySchema,
        response: {
          200: z.object({
            token: z.string(),
            expiresAt: z.iso.datetime().describe('When the token stops being valid.'),
          }),
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await authUseCases.loginUser(request.body);
      if (!result.ok) {
        return reply
          .status(statusForError(result.error) as 400 | 401 | 500)
          .send(errorBody(result.error));
      }
      return reply
        .status(200)
        .send({ token: result.value.token, expiresAt: result.value.expiresAt.toISOString() });
    },
  );
}
