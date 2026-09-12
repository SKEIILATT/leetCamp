import { describe, expect, it } from 'vitest';
import {
  err,
  ok,
  repository,
  type Category,
  type CategoryRepository,
  type ChallengeRepository,
  type Clock,
  type Difficulty,
  type DifficultyRepository,
} from '@leetcamp/domain';

import { makeCreateChallenge } from './create-challenge.js';

const fixedClock: Clock = { now: () => new Date('2026-03-15T08:00:00Z'), timeZone: 'UTC' };

const category: Category = { id: 'cat-1', name: 'SQL', createdAt: new Date('2026-01-01T00:00:00Z') };
const difficulty: Difficulty = {
  id: 'diff-1',
  name: 'Easy',
  level: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const baseInput = {
  categoryId: category.id,
  difficultyId: difficulty.id,
  title: 'What does this query return?',
  promptMarkdown: 'Given the table...',
  codeSnippet: 'SELECT 1;',
  expectedAnswer: '1',
  createdBy: 'admin-1',
};

function deps(overrides: {
  categoryRepository?: Partial<CategoryRepository>;
  difficultyRepository?: Partial<DifficultyRepository>;
  challengeRepository?: Partial<ChallengeRepository>;
} = {}) {
  const categoryRepository: CategoryRepository = {
    findById: async () => ok(category),
    findByName: async () => ok(null),
    list: async () => ok([category]),
    create: async (c) => ok({ ...c }),
    ...overrides.categoryRepository,
  };
  const difficultyRepository: DifficultyRepository = {
    findById: async () => ok(difficulty),
    findByName: async () => ok(null),
    list: async () => ok([difficulty]),
    create: async (d) => ok({ ...d }),
    ...overrides.difficultyRepository,
  };
  const challengeRepository: ChallengeRepository = {
    findById: async () => ok(null),
    list: async () => ok([]),
    create: async (c) => ok({ ...c, type: 'prediction', status: 'draft' }),
    updateStatus: async () => {
      throw new Error('createChallenge must never update status');
    },
    ...overrides.challengeRepository,
  };

  return {
    categoryRepository,
    difficultyRepository,
    challengeRepository,
    idGenerator: { generate: () => 'challenge-1' },
    clock: fixedClock,
  };
}

describe('createChallenge', () => {
  it('creates a draft challenge when both references exist', async () => {
    const createChallenge = makeCreateChallenge(deps());

    const result = await createChallenge(baseInput);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.challengeId).toBe('challenge-1');
  });

  it('rejects an unknown categoryId with VALIDATION, without touching difficulty or creating', async () => {
    let difficultyChecked = false;
    let created = false;

    const createChallenge = makeCreateChallenge(
      deps({
        categoryRepository: { findById: async () => ok(null) },
        difficultyRepository: {
          findById: async () => {
            difficultyChecked = true;
            return ok(difficulty);
          },
        },
        challengeRepository: {
          create: async (c) => {
            created = true;
            return ok({ ...c, type: 'prediction', status: 'draft' });
          },
        },
      }),
    );

    const result = await createChallenge(baseInput);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('VALIDATION');
    expect(difficultyChecked).toBe(false);
    expect(created).toBe(false);
  });

  it('rejects an unknown difficultyId with VALIDATION', async () => {
    const createChallenge = makeCreateChallenge(
      deps({ difficultyRepository: { findById: async () => ok(null) } }),
    );

    const result = await createChallenge(baseInput);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('VALIDATION');
  });

  it('propagates a repository failure from the category lookup', async () => {
    const createChallenge = makeCreateChallenge(
      deps({ categoryRepository: { findById: async () => err(repository('connection refused')) } }),
    );

    const result = await createChallenge(baseInput);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });
});
