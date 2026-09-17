import { describe, expect, it } from 'vitest';
import {
  err,
  ok,
  repository,
  type Challenge,
  type ChallengeRepository,
  type Clock,
  type DailyChallenge,
  type DailyChallengeRepository,
} from '@leetcamp/domain';

import { makeScheduleDailyChallenge } from './schedule-daily-challenge.js';

const fixedClock: Clock = { now: () => new Date('2026-03-15T08:00:00Z'), timeZone: 'UTC' };

const publishedChallenge: Challenge = {
  id: 'challenge-1',
  categoryId: 'cat-1',
  difficultyId: 'diff-1',
  type: 'prediction',
  title: 'title',
  promptMarkdown: 'prompt',
  codeSnippet: 'code',
  expectedAnswer: 'answer',
  status: 'published',
  createdBy: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function deps(overrides: {
  dailyChallengeRepository?: Partial<DailyChallengeRepository>;
  challengeRepository?: Partial<ChallengeRepository>;
} = {}) {
  const dailyChallengeRepository: DailyChallengeRepository = {
    findByDate: async () => ok(null),
    list: async () => ok([]),
    create: async (entry) => ok(entry),
    ...overrides.dailyChallengeRepository,
  };
  const challengeRepository: ChallengeRepository = {
    findById: async () => ok(publishedChallenge),
    list: async () => ok([publishedChallenge]),
    create: async () => ok(publishedChallenge),
    updateStatus: async () => ok(publishedChallenge),
    updateDraft: async () => ok(publishedChallenge),
    ...overrides.challengeRepository,
  };
  return { dailyChallengeRepository, challengeRepository, clock: fixedClock };
}

describe('scheduleDailyChallenge', () => {
  it('schedules a published challenge for a free date', async () => {
    const schedule = makeScheduleDailyChallenge(deps());

    const result = await schedule({ date: '2026-03-20', challengeId: publishedChallenge.id });

    expect(result.ok).toBe(true);
  });

  it('rejects a date that already has a challenge scheduled, with CONFLICT', async () => {
    const existing: DailyChallenge = {
      date: '2026-03-20',
      challengeId: 'other-challenge',
      publishedAt: new Date('2026-03-01T00:00:00Z'),
    };
    let createCalled = false;

    const schedule = makeScheduleDailyChallenge(
      deps({
        dailyChallengeRepository: {
          findByDate: async () => ok(existing),
          create: async (entry) => {
            createCalled = true;
            return ok(entry);
          },
        },
      }),
    );

    const result = await schedule({ date: '2026-03-20', challengeId: publishedChallenge.id });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('CONFLICT');
    expect(createCalled).toBe(false);
  });

  it('rejects an unknown challengeId with NOT_FOUND', async () => {
    const schedule = makeScheduleDailyChallenge(
      deps({ challengeRepository: { findById: async () => ok(null) } }),
    );

    const result = await schedule({ date: '2026-03-20', challengeId: 'missing' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rejects a draft challenge with VALIDATION, without scheduling it', async () => {
    let createCalled = false;
    const draft: Challenge = { ...publishedChallenge, status: 'draft' };

    const schedule = makeScheduleDailyChallenge(
      deps({
        challengeRepository: { findById: async () => ok(draft) },
        dailyChallengeRepository: {
          create: async (entry) => {
            createCalled = true;
            return ok(entry);
          },
        },
      }),
    );

    const result = await schedule({ date: '2026-03-20', challengeId: draft.id });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('VALIDATION');
    expect(createCalled).toBe(false);
  });

  it('propagates a repository failure from the date lookup', async () => {
    const schedule = makeScheduleDailyChallenge(
      deps({ dailyChallengeRepository: { findByDate: async () => err(repository('connection refused')) } }),
    );

    const result = await schedule({ date: '2026-03-20', challengeId: publishedChallenge.id });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });
});
