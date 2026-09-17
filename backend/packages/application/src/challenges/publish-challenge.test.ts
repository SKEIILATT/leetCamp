import { describe, expect, it } from 'vitest';
import { err, ok, repository, type Challenge, type Clock } from '@leetcamp/domain';

import { makePublishChallenge } from './publish-challenge.js';

const fixedClock: Clock = { now: () => new Date('2026-03-15T08:00:00Z'), timeZone: 'UTC' };

const draftChallenge: Challenge = {
  id: 'challenge-1',
  categoryId: 'cat-1',
  difficultyId: 'diff-1',
  type: 'prediction',
  title: 'title',
  promptMarkdown: 'prompt',
  codeSnippet: 'code',
  expectedAnswer: 'answer',
  status: 'draft',
  createdBy: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const draftCodeChallenge: Challenge = {
  id: 'challenge-2',
  categoryId: 'cat-1',
  difficultyId: 'diff-1',
  type: 'code',
  title: 'title',
  promptMarkdown: 'prompt',
  starterCode: 'function solve() {}',
  language: 'javascript',
  testCases: [{ id: 'tc-1', input: '1', expectedOutput: '1', isHidden: false }],
  status: 'draft',
  createdBy: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('publishChallenge', () => {
  it('publishes a draft challenge', async () => {
    let statusWritten: string | undefined;

    const publishChallenge = makePublishChallenge({
      challengeRepository: {
        findById: async () => ok(draftChallenge),
        list: async () => ok([]),
        create: async () => ok(draftChallenge),
        updateDraft: async () => ok(draftChallenge),
        updateStatus: async (_id, status) => {
          statusWritten = status;
          return ok({ ...draftChallenge, status });
        },
      },
      clock: fixedClock,
      codeExecutionEnabled: true,
    });

    const result = await publishChallenge({ challengeId: draftChallenge.id });

    expect(result.ok).toBe(true);
    expect(statusWritten).toBe('published');
  });

  it('rejects an unknown challenge with NOT_FOUND', async () => {
    const publishChallenge = makePublishChallenge({
      challengeRepository: {
        findById: async () => ok(null),
        list: async () => ok([]),
        create: async () => ok(draftChallenge),
        updateDraft: async () => ok(draftChallenge),
        updateStatus: async () => {
          throw new Error('must not update a challenge that was never found');
        },
      },
      clock: fixedClock,
      codeExecutionEnabled: true,
    });

    const result = await publishChallenge({ challengeId: 'missing' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rejects an already-published challenge with CONFLICT, without writing again', async () => {
    let updateCalled = false;
    const published: Challenge = { ...draftChallenge, status: 'published' };

    const publishChallenge = makePublishChallenge({
      challengeRepository: {
        findById: async () => ok(published),
        list: async () => ok([]),
        create: async () => ok(draftChallenge),
        updateDraft: async () => ok(draftChallenge),
        updateStatus: async () => {
          updateCalled = true;
          return ok(published);
        },
      },
      clock: fixedClock,
      codeExecutionEnabled: true,
    });

    const result = await publishChallenge({ challengeId: published.id });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('CONFLICT');
    expect(updateCalled).toBe(false);
  });

  it('propagates a repository failure from the lookup', async () => {
    const publishChallenge = makePublishChallenge({
      challengeRepository: {
        findById: async () => err(repository('connection refused')),
        list: async () => ok([]),
        create: async () => ok(draftChallenge),
        updateDraft: async () => ok(draftChallenge),
        updateStatus: async () => ok(draftChallenge),
      },
      clock: fixedClock,
      codeExecutionEnabled: true,
    });

    const result = await publishChallenge({ challengeId: draftChallenge.id });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });

  it('rejects publishing a code challenge when Judge0 is not configured, without writing', async () => {
    let updateCalled = false;

    const publishChallenge = makePublishChallenge({
      challengeRepository: {
        findById: async () => ok(draftCodeChallenge),
        list: async () => ok([]),
        create: async () => ok(draftCodeChallenge),
        updateDraft: async () => ok(draftCodeChallenge),
        updateStatus: async () => {
          updateCalled = true;
          return ok({ ...draftCodeChallenge, status: 'published' });
        },
      },
      clock: fixedClock,
      codeExecutionEnabled: false,
    });

    const result = await publishChallenge({ challengeId: draftCodeChallenge.id });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('VALIDATION');
    expect(updateCalled).toBe(false);
  });

  it('publishes a code challenge when Judge0 is configured', async () => {
    const publishChallenge = makePublishChallenge({
      challengeRepository: {
        findById: async () => ok(draftCodeChallenge),
        list: async () => ok([]),
        create: async () => ok(draftCodeChallenge),
        updateDraft: async () => ok(draftCodeChallenge),
        updateStatus: async (_id, status) => ok({ ...draftCodeChallenge, status }),
      },
      clock: fixedClock,
      codeExecutionEnabled: true,
    });

    const result = await publishChallenge({ challengeId: draftCodeChallenge.id });

    expect(result.ok).toBe(true);
  });
});
