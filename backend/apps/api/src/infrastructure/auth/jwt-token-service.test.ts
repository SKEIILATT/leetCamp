import { describe, expect, it } from 'vitest';

import { createJwtTokenService } from './jwt-token-service.js';

const baseOptions = {
  secret: 'a-test-secret-that-is-at-least-32-chars-long',
  issuer: 'https://leetcamp.example.com',
  audience: 'leetcamp-api',
  ttlSeconds: 3600,
};

describe('createJwtTokenService', () => {
  it('verifies a token it issued itself', async () => {
    const service = createJwtTokenService(baseOptions);

    const issued = await service.issueToken({ subject: 'user-1', email: 'a@example.com' });
    const result = await service.verifyToken(issued.token);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.subject).toBe('user-1');
    expect(result.value.email).toBe('a@example.com');
  });

  it('omits `email` from the verified identity when none was issued', async () => {
    const service = createJwtTokenService(baseOptions);
    const issued = await service.issueToken({ subject: 'user-1' });
    const result = await service.verifyToken(issued.token);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.email).toBeUndefined();
  });

  it('rejects a token signed with a different secret', async () => {
    const issuer = createJwtTokenService(baseOptions);
    const verifier = createJwtTokenService({ ...baseOptions, secret: 'a-completely-different-secret!!' });

    const issued = await issuer.issueToken({ subject: 'user-1' });
    const result = await verifier.verifyToken(issued.token);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a token issued for a different audience', async () => {
    const issuer = createJwtTokenService({ ...baseOptions, audience: 'some-other-api' });
    const verifier = createJwtTokenService(baseOptions);

    const issued = await issuer.issueToken({ subject: 'user-1' });
    const result = await verifier.verifyToken(issued.token);

    expect(result.ok).toBe(false);
  });

  it('rejects garbage input instead of throwing', async () => {
    const service = createJwtTokenService(baseOptions);
    const result = await service.verifyToken('not.a.jwt');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    // The library's specific failure reason is deliberately not forwarded —
    // see the note in the implementation.
    expect(result.error.message).toBe('Invalid or expired token');
  });

  it('sets expiresAt roughly ttlSeconds in the future', async () => {
    const service = createJwtTokenService(baseOptions);
    const before = Date.now();

    const issued = await service.issueToken({ subject: 'user-1' });

    const deltaSeconds = (issued.expiresAt.getTime() - before) / 1000;
    expect(deltaSeconds).toBeGreaterThan(baseOptions.ttlSeconds - 5);
    expect(deltaSeconds).toBeLessThanOrEqual(baseOptions.ttlSeconds + 5);
  });
});
