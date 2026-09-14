import { describe, expect, it } from 'vitest';
import {
  err,
  ok,
  repository,
  type Category,
  type Challenge,
  type Clock,
  type DailyChallenge,
  type Difficulty,
} from '@leetcamp/domain';

import { makeGetTodayChallenge } from './get-today-challenge.js';

const clock: Clock = { now: () => new Date('2026-03-15T08:00:00Z'), timeZone: 'UTC' };

const todaysEntry: DailyChallenge = {
  date: '2026-03-15',
  challengeId: 'challenge-1',
  publishedAt: new Date('2026-03-15T00:00:00Z'),
};

const challenge: Challenge = {
  id: 'challenge-1',
  categoryId: 'cat-1',
  difficultyId: 'diff-1',
  type: 'prediction',
  title: 'title',
  promptMarkdown: 'prompt',
  codeSnippet: 'code',
  expectedAnswer: 'THE SECRET ANSWER',
  status: 'published',
  createdBy: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const category: Category = { id: 'cat-1', name: 'SQL', createdAt: new Date('2026-01-01T00:00:00Z') };
const difficulty: Difficulty = {
  id: 'diff-1',
  name: 'Fácil',
  level: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const categoryRepository = {
  findById: async () => ok(category),
  findByName: async () => ok(category),
  list: async () => ok([category]),
  create: async () => ok(category),
};

const difficultyRepository = {
  findById: async () => ok(difficulty),
  findByName: async () => ok(difficulty),
  list: async () => ok([difficulty]),
  create: async () => ok(difficulty),
};

describe('getTodayChallenge', () => {
  it("looks up today's date (derived from the clock) and returns the challenge, with category/difficulty names, without the answer", async () => {
    let dateQueried: string | undefined;

    const getTodayChallenge = makeGetTodayChallenge({
      dailyChallengeRepository: {
        findByDate: async (date) => {
          dateQueried = date;
          return ok(todaysEntry);
        },
        list: async () => ok([todaysEntry]),
        create: async () => ok(todaysEntry),
      },
      challengeRepository: {
        findById: async () => ok(challenge),
        list: async () => ok([challenge]),
        create: async () => ok(challenge),
        updateStatus: async () => ok(challenge),
      },
      categoryRepository,
      difficultyRepository,
      clock,
    });

    const result = await getTodayChallenge();

    expect(dateQueried).toBe('2026-03-15');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    // THE property this use case exists to guarantee.
    expect(result.value).not.toHaveProperty('expectedAnswer');
    expect(result.value.title).toBe(challenge.title);
    expect(result.value.categoryName).toBe('SQL');
    expect(result.value.difficultyName).toBe('Fácil');
  });

  it('answers NOT_FOUND when nothing is scheduled for today', async () => {
    const getTodayChallenge = makeGetTodayChallenge({
      dailyChallengeRepository: {
        findByDate: async () => ok(null),
        list: async () => ok([]),
        create: async () => ok(todaysEntry),
      },
      challengeRepository: {
        findById: async () => ok(challenge),
        list: async () => ok([challenge]),
        create: async () => ok(challenge),
        updateStatus: async () => ok(challenge),
      },
      categoryRepository,
      difficultyRepository,
      clock,
    });

    const result = await getTodayChallenge();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('propagates a repository failure from the daily-challenge lookup', async () => {
    const getTodayChallenge = makeGetTodayChallenge({
      dailyChallengeRepository: {
        findByDate: async () => err(repository('connection refused')),
        list: async () => ok([]),
        create: async () => ok(todaysEntry),
      },
      challengeRepository: {
        findById: async () => ok(challenge),
        list: async () => ok([challenge]),
        create: async () => ok(challenge),
        updateStatus: async () => ok(challenge),
      },
      categoryRepository,
      difficultyRepository,
      clock,
    });

    const result = await getTodayChallenge();

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });
});
