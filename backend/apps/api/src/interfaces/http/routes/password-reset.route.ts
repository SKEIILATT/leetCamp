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
