import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PasswordResetUseCases } from '@leetcamp/application';

import { errorBody, ErrorResponseSchema, statusForError } from '../result-to-http.js';

/**
 * `POST /api/v1/auth/request-password-reset` and
 * `POST /api/v1/auth/reset-password` — both PUBLIC (unauthenticated), same
 * reasoning as `auth.route.ts`: a student who forgot their password cannot
 * present a bearer token yet.
 */

const NormalizedEmail = z.string().trim().toLowerCase().pipe(z.email());

export function registerPasswordResetRoutes(
  app: FastifyInstance,
  passwordResetUseCases: PasswordResetUseCases,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/api/v1/auth/request-password-reset',
    {
      // Rate-limited: this endpoint sends an email per call. Without a limit
      // it is both a mail-bombing vector against a victim's inbox and, more
      // subtly, gives an attacker unlimited attempts to time the response
      // and try to defeat the anti-enumeration behavior above.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        operationId: 'requestPasswordReset',
        tags: ['auth'],
        summary: 'Send a password reset link, if the email is registered',
        body: z.object({ email: NormalizedEmail }),
        response: {
          // ⚠ ONLY 200 and 500, ON PURPOSE. There is no 404 for "no account
          // with that email" — see `requestPasswordReset`'s doc comment. A
          // distinct status for that case would turn this endpoint into an
          // account-enumeration oracle regardless of what the body says.
          200: z.object({ message: z.string() }),
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await passwordResetUseCases.requestPasswordReset(request.body);
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 500).send(errorBody(result.error));
      }
      return reply
        .status(200)
        .send({ message: 'If that email is registered, a reset link has been sent.' });
    },
  );

  typed.post(
    '/api/v1/auth/reset-password',
    {
      // Rate-limited: the token is high-entropy (see password-reset.ts), so
      // this is not really guessable within any reasonable limit — this cap
      // exists mainly for symmetry with the other three auth endpoints and
      // as defense in depth.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        operationId: 'resetPassword',
        tags: ['auth'],
        summary: 'Set a new password using a reset token',
        body: z.object({
          token: z.string().min(1),
          // Same length bounds as registration's password field — see
          // `RegisterBodySchema` in auth.route.ts for why 128 is the cap.
          newPassword: z.string().min(8, 'must be at least 8 characters').max(128),
        }),
        response: {
          200: z.object({ message: z.string() }),
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await passwordResetUseCases.resetPassword(request.body);
      if (!result.ok) {
        return reply
          .status(statusForError(result.error) as 404 | 500)
          .send(errorBody(result.error));
      }
      return reply.status(200).send({ message: 'Password updated. You can log in now.' });
    },
  );
}
