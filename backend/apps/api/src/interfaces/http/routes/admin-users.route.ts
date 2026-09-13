import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ROLE_ID } from '@leetcamp/domain';
import type { AdminUsersUseCases } from '@leetcamp/application';

import { errorBody, ErrorResponseSchema, statusForError } from '../result-to-http.js';

const adminPreHandler = (app: FastifyInstance) => [app.authenticate, app.requireRole(ROLE_ID.ADMIN)];

const AdminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  roleId: z.number().int(),
  timezone: z.string(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
});

/**
 * Admin user management: list accounts, activate/deactivate. NO route here
 * (or anywhere) can change a `roleId` — promoting to admin stays a deliberate
 * out-of-band operation (`pnpm promote:admin`, see docs/DECISIONS.md), not an
 * HTTP capability.
 */
export function registerAdminUsersRoutes(app: FastifyInstance, adminUsersUseCases: AdminUsersUseCases): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/api/v1/admin/users',
    {
      preHandler: adminPreHandler(app),
      schema: {
        operationId: 'listUsers',
        tags: ['admin', 'users'],
        summary: 'List all accounts',
        security: [{ bearerAuth: [] }],
        response: { 200: z.array(AdminUserSchema), 500: ErrorResponseSchema },
      },
    },
    async (_request, reply) => {
      const result = await adminUsersUseCases.listUsers();
      if (!result.ok) {
        return reply.status(statusForError(result.error) as 500).send(errorBody(result.error));
      }
      return reply.status(200).send(
        result.value.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() })),
      );
    },
  );

  typed.patch(
    '/api/v1/admin/users/:id/status',
    {
      preHandler: adminPreHandler(app),
      schema: {
        operationId: 'setUserActive',
        tags: ['admin', 'users'],
        summary: 'Activate or deactivate an account',
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.uuid() }),
        body: z.object({ isActive: z.boolean() }),
        response: {
          200: AdminUserSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await adminUsersUseCases.setUserActive({
        // `actingAdminId` is identity, never client input.
        actingAdminId: request.identity!.userId,
        targetUserId: request.params.id,
        isActive: request.body.isActive,
      });
      if (!result.ok) {
        return reply
          .status(statusForError(result.error) as 403 | 404 | 500)
          .send(errorBody(result.error));
      }
      return reply.status(200).send({ ...result.value, createdAt: result.value.createdAt.toISOString() });
    },
  );
}
