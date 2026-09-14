import { describe, expect, it } from 'vitest';
import {
  err,
  ok,
  repository,
  unauthenticated,
  type AuthorizationProfile,
  type Result,
  type TokenVerifier,
  type UserAuthorizationRepository,
  type VerifiedIdentity,
} from '@leetcamp/domain';

import { checkRole, extractBearerToken, resolveIdentity } from './authenticate.js';

/**
 * These specs are the reason `authenticate.ts` is a separate file from
 * `auth.plugin.ts`. Not one line here boots a server, opens a socket or touches
 * a database — the whole two-layer identity model is exercised through two hand
 * written fakes. That is the property to protect: if a future change makes this
 * file need `fastify`, the logic leaked into the wrong layer.
 *
 * The fakes are plain object literals on purpose. A mocking library would let
 * you assert on calls that the port does not promise, and those assertions
 * break on every refactor without catching a single real bug.
 */

const stubVerifier = (result: Result<VerifiedIdentity>): TokenVerifier => ({
  verifyToken: async () => result,
});

const stubRepository = (
  result: Result<AuthorizationProfile | null>,
): UserAuthorizationRepository => ({
  findActiveProfileBySubject: async () => result,
});

const validProfile: AuthorizationProfile = {
  userId: 'user-1',
  displayName: 'Ana Méndez',
  roleId: 1,
  scopeIds: ['scope-a'],
};

describe('extractBearerToken', () => {
  it('rejects a missing header', () => {
    const result = extractBearerToken(undefined);
    expect(result.ok).toBe(false);
  });

  it('rejects a scheme that is not Bearer', () => {
    expect(extractBearerToken('Basic abc').ok).toBe(false);
  });

  it('rejects a header with extra segments', () => {
    expect(extractBearerToken('Bearer a b').ok).toBe(false);
  });

  /**
   * The literal strings a JS client sends when it interpolates a missing value.
   * Without this branch the failure surfaces from cryptographic verification,
   * which is far harder to diagnose from the browser.
   */
  it.each(['Bearer null', 'Bearer undefined'])('rejects %s as a missing credential', (header) => {
    expect(extractBearerToken(header).ok).toBe(false);
  });

  it('accepts a well-formed header', () => {
    const result = extractBearerToken('Bearer abc.def.ghi');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value).toBe('abc.def.ghi');
  });
});

describe('resolveIdentity', () => {
  it('composes both layers into a full identity', async () => {
    const result = await resolveIdentity(
      stubVerifier(ok({ subject: 'sub-1', email: 'a@example.com' })),
      stubRepository(ok(validProfile)),
      'Bearer token',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.userId).toBe('user-1');
    // `subject` and `userId` are DIFFERENT values and both survive. Conflating
    // them is the failure the identity model exists to prevent.
    expect(result.value.subject).toBe('sub-1');
    expect(result.value.role).toBe('admin');
  });

  /**
   * THE MOST IMPORTANT ASSERTION IN THIS FILE.
   *
   * A database outage must NOT be reported as 401. If it were, every client
   * would sign its user out over an infrastructure incident, and the support
   * ticket would read "everyone got logged out" instead of "the database is
   * down".
   */
  it('propagates a repository failure instead of turning it into 401', async () => {
    const result = await resolveIdentity(
      stubVerifier(ok({ subject: 'sub-1' })),
      stubRepository(err(repository('connection refused'))),
      'Bearer token',
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });

  it('answers UNAUTHENTICATED when there is no active profile', async () => {
    const result = await resolveIdentity(
      stubVerifier(ok({ subject: 'sub-1' })),
      stubRepository(ok(null)),
      'Bearer token',
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    // 401, not 403 — see the long note in authenticate.ts.
    expect(result.error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses an unknown role id rather than defaulting to one', async () => {
    const result = await resolveIdentity(
      stubVerifier(ok({ subject: 'sub-1' })),
      stubRepository(ok({ ...validProfile, roleId: 9999 })),
      'Bearer token',
    );

    expect(result.ok).toBe(false);
  });

  it('stops at layer 1 when the token does not verify', async () => {
    const result = await resolveIdentity(
      stubVerifier(err(unauthenticated('bad signature'))),
      stubRepository(ok(validProfile)),
      'Bearer token',
    );

    expect(result.ok).toBe(false);
  });
});

describe('checkRole', () => {
  const identity = {
    userId: 'user-1',
    subject: 'sub-1',
    displayName: 'Ana Méndez',
    roleId: 1,
    role: 'admin' as const,
    scopeIds: [] as readonly string[],
  };

  it('allows a listed role id', () => {
    expect(checkRole(identity, [1, 2]).ok).toBe(true);
  });

  it('answers FORBIDDEN — not UNAUTHENTICATED — for a live identity without permission', () => {
    const result = checkRole(identity, [2]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('FORBIDDEN');
  });

  it('does not disclose which roles would have been accepted', () => {
    const result = checkRole(identity, [2, 3]);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.message).not.toMatch(/[23]/);
  });
});
