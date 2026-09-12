import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { RequestIdentity, TokenVerifier, UserAuthorizationRepository } from '@leetcamp/domain';

import { checkRole, resolveIdentity } from '../authenticate.js';
import { errorBody, statusForError } from '../result-to-http.js';

/**
 * Authentication plugin: composes the two identity layers and populates
 * `request.identity`.
 *
 * ── THE PROJECT'S GOLDEN RULE ────────────────────────────────────────────────
 * **Identity is never read from the body or from query params, always from
 * `request.identity`.** A handler that accepts a `userId`, a `roleId` or a
 * tenant id from the client to decide permissions does not have a bug: it has
 * an authorization hole. The client can write whatever it likes there.
 *
 * ── WHY `fastify-plugin` ─────────────────────────────────────────────────────
 * Wrapped in `fp` so its decorators BREAK ENCAPSULATION on purpose and are
 * available to every route registered afterwards. Without `fp`,
 * `app.authenticate` would exist only inside the plugin's scope and outside
 * routes would fail at boot with `FST_ERR_DEC_UNDECLARED` — or worse, if
 * somebody "fixed" that by dropping the preHandler, they would silently be left
 * unauthenticated.
 */

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * The caller's verified identity. `undefined` on public routes and on
     * routes using `authenticateOptional` without a token.
     *
     * Inside a handler behind `app.authenticate` it is ALWAYS present: if
     * authentication fails the preHandler has already replied and the handler
     * never runs.
     */
    identity?: RequestIdentity;
  }
  interface FastifyInstance {
    /** preHandler: requires a valid identity. Replies 401 without one. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * preHandler: populates `request.identity` when a valid token is present and
     * lets anonymous callers through when there is no header. A token that IS
     * present but invalid is still a 401 — "optional" refers to the absence of a
     * credential, not to accepting a broken one.
     */
    authenticateOptional: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * Factory of role-authorization preHandlers. Used AFTER `authenticate`, in
     * the same array:
     *
     *   preHandler: [app.authenticate, app.requireRole(ROLE_ID.ADMIN)]
     *
     * The order matters: `requireRole` reads `request.identity`, which is what
     * `authenticate` just populated.
     */
    requireRole: (
      ...allowedRoleIds: readonly number[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  readonly tokenVerifier: TokenVerifier;
  readonly userRepository: UserAuthorizationRepository;
}

const authPluginAsync: FastifyPluginAsync<AuthPluginOptions> = async (app, opts) => {
  const { tokenVerifier, userRepository } = opts;

  // Declaring the request decorator with a default value is what lets Fastify
  // reserve a slot on the request prototype. Without it, assigning
  // `request.identity` would create a fresh property per request (slower) and
  // `hasDecorator` would not see it.
  app.decorateRequest('identity', undefined);

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await resolveIdentity(
      tokenVerifier,
      userRepository,
      request.headers.authorization,
    );

    if (!result.ok) {
      // `statusForError` is the ONLY thing that picks a status. A literal `401`
      // here would flatten the distinction between an inactive user
      // (UNAUTHENTICATED) and a database outage (REPOSITORY -> 500), and the
      // second one would start logging everybody out.
      await reply.status(statusForError(result.error)).send(errorBody(result.error));
      return;
    }

    request.identity = result.value;
  });

  app.decorate('authenticateOptional', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.headers.authorization) return; // legitimately anonymous
    const result = await resolveIdentity(
      tokenVerifier,
      userRepository,
      request.headers.authorization,
    );
    if (!result.ok) {
      await reply.status(statusForError(result.error)).send(errorBody(result.error));
      return;
    }
    request.identity = result.value;
  });

  app.decorate(
    'requireRole',
    (...allowedRoleIds: readonly number[]) =>
      async (request: FastifyRequest, reply: FastifyReply) => {
        // No identity means someone wired `requireRole` without `authenticate`
        // in front. Reply 401 instead of falling through: a wiring mistake must
        // not turn into an open route.
        if (!request.identity) {
          request.log.error('requireRole ran without authenticate in front of it');
          await reply.status(401).send({ message: 'Not authenticated', code: 'UNAUTHENTICATED' });
          return;
        }

        const result = checkRole(request.identity, allowedRoleIds);
        if (!result.ok) {
          await reply.status(statusForError(result.error)).send(errorBody(result.error));
        }
      },
  );
};

export const authPlugin = fp(authPluginAsync, { name: 'auth-plugin' });
