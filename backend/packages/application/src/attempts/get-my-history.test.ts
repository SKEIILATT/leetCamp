import { describe, expect, it } from 'vitest';
import { err, ok, repository, type Attempt, type Challenge, type DailyChallenge } from '@leetcamp/domain';

import { makeGetMyHistory } from './get-my-history.js';

const attempt: Attempt = {
  id: 'attempt-1',
  userId: 'user-1',
  dailyChallengeDate: '2026-03-15',
  answer: '34',
  isCorrect: true,
  submittedAt: new Date('2026-03-15T10:00:00Z'),
  timeTakenSeconds: 120,
  points: 15,
};

const dailyEntry: DailyChallenge = {
  date: '2026-03-15',
  challengeId: 'challenge-1',
  publishedAt: new Date('2026-03-15T00:00:00Z'),
};

const challenge: Challenge = {
  id: 'challenge-1',
  categoryId: 'cat-1',
  difficultyId: 'diff-1',
  type: 'prediction',
  title: '¿Qué imprime esta consulta?',
  promptMarkdown: 'prompt',
  codeSnippet: 'code',
  expectedAnswer: '34',
  status: 'published',
  createdBy: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('getMyHistory', () => {
  it("enriches each attempt with the challenge's title", async () => {
    const getMyHistory = makeGetMyHistory({
      attemptRepository: {
        findByUserAndDate: async () => ok(null),
        listByUser: async () => ok([attempt]),
        create: async () => ok(attempt),
      },
      dailyChallengeRepository: {
        findByDate: async () => ok(dailyEntry),
        list: async () => ok([dailyEntry]),
        create: async () => ok(dailyEntry),
      },
      challengeRepository: {
        findById: async () => ok(challenge),
        list: async () => ok([challenge]),
        create: async () => ok(challenge),
        updateStatus: async () => ok(challenge),
      },
    });

    const result = await getMyHistory({ userId: 'user-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.challengeTitle).toBe('¿Qué imprime esta consulta?');
    expect(result.value[0]?.answer).toBe('34');
  });

  it('falls back to a placeholder title when the scheduled day no longer resolves to a challenge', async () => {
    const getMyHistory = makeGetMyHistory({
      attemptRepository: {
        findByUserAndDate: async () => ok(null),
        listByUser: async () => ok([attempt]),
        create: async () => ok(attempt),
      },
      dailyChallengeRepository: {
        findByDate: async () => ok(null),
        list: async () => ok([]),
        create: async () => ok(dailyEntry),
      },
      challengeRepository: {
        findById: async () => ok(challenge),
        list: async () => ok([challenge]),
        create: async () => ok(challenge),
        updateStatus: async () => ok(challenge),
      },
    });

    const result = await getMyHistory({ userId: 'user-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value[0]?.challengeTitle).toBe('Reto no disponible');
  });

  it('propagates a repository failure from the attempt lookup', async () => {
    const getMyHistory = makeGetMyHistory({
      attemptRepository: {
        findByUserAndDate: async () => ok(null),
        listByUser: async () => err(repository('connection refused')),
        create: async () => ok(attempt),
      },
      dailyChallengeRepository: {
        findByDate: async () => ok(dailyEntry),
        list: async () => ok([dailyEntry]),
        create: async () => ok(dailyEntry),
      },
      challengeRepository: {
        findById: async () => ok(challenge),
        list: async () => ok([challenge]),
        create: async () => ok(challenge),
        updateStatus: async () => ok(challenge),
      },
    });

    const result = await getMyHistory({ userId: 'user-1' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });
});
