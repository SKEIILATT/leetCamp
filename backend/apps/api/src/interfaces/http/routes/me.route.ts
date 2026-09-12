import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { ErrorResponseSchema } from '../result-to-http.js';

/**
 * `GET /api/v1/me` — the reference protected route.
 *
 * It exists so the scaffold ships with one route that actually exercises the
 * auth plugin end to end, and so the shape of a protected endpoint is visible
 * without reading a guide. Keep it or replace it; do not copy it without the
 * two notes below.
 *
 * ── ROUTE CONVENTIONS THIS FILE DEMONSTRATES ─────────────────────────────────
 *
 *  1. THE PREFIX IS PART OF THE PATH. Routes are mounted as `/api/v1/...`, not
 *     `/v1/...`, and the reverse proxy does NOT strip `/api` (see the Caddyfile).
 *     Both sides have to agree, and the spec is the record of that agreement.
 *  2. `operationId` IS MANDATORY. Without it the frontend codegen produces an
 *     empty `operations` map.
 *  3. `security` MUST be declared on protected routes. Fastify enforces nothing
 *     from it — `preHandler` is what enforces — but the generated client and any
 *     API console read it. Omitting it produces a document that describes a
 *     public endpoint while the server rejects anonymous callers.
 *  4. THE ERROR RESPONSES ARE DECLARED. `ErrorResponseSchema` carries
 *     `.meta({ id: 'Error' })`, so every route referencing it shares one
 *     component instead of inlining a divergent copy.
 */
export function registerMeRoutes(app: FastifyInstance): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/v1/me',
    {
      // `app.authenticate` was decorated by the auth plugin, registered in step 6
      // of app.ts — i.e. BEFORE this route. Reversing that order crashes at boot
      // with FST_ERR_DEC_UNDECLARED.
      preHandler: [app.authenticate],
      schema: {
        operationId: 'getMe',
        tags: ['identity'],
        summary: 'The authenticated caller',
        security: [{ bearerAuth: [] }],
        response: {
          200: z.object({
            userId: z.string(),
            email: z.string().optional(),
            role: z.enum(['admin', 'student']),
            roleId: z.number().int(),
            scopeIds: z.array(z.string()),
          }),
          401: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
    },
    async (request) => {
      // Behind `app.authenticate`, `identity` is always present: on failure the
      // preHandler already replied and this handler never ran. The non-null
      // assertion documents that invariant rather than hiding a missing check.
      const identity = request.identity!;

      // ⚠ EVERY FIELD COMES FROM `request.identity`. Nothing here is read from
      // the body or the query string. A handler that took a `userId` from the
      // client to decide what to return would not have a bug — it would have an
      // authorization hole.
      return {
        userId: identity.userId,
        ...(identity.email !== undefined ? { email: identity.email } : {}),
        role: identity.role,
        roleId: identity.roleId,
        scopeIds: [...identity.scopeIds],
      };
    },
  );
}
