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
  type: 'prediction' as const,
  categoryId: category.id,
  difficultyId: difficulty.id,
  title: 'What does this query return?',
  promptMarkdown: 'Given the table...',
  codeSnippet: 'SELECT 1;',
  expectedAnswer: '1',
  createdBy: 'admin-1',
};

const baseCodeInput = {
  type: 'code' as const,
  categoryId: category.id,
  difficultyId: difficulty.id,
  title: 'Reverse a string',
  promptMarkdown: 'Write a function that reverses a string.',
  starterCode: 'function reverse(s) {}',
  language: 'javascript' as const,
  testCases: [{ input: 'abc', expectedOutput: 'cba', isHidden: false }],
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
    // `status: 'draft'` first, `...c` second — so `c.type` (which the caller
    // sets) is never clobbered back to a hardcoded 'prediction'. Test cases
    // get a synthetic id here (the real repository lets Postgres generate
    // it) so the fake's return value satisfies `TestCase`, not `NewTestCase`.
    create: async (c) =>
      ok(
        c.type === 'code'
          ? { status: 'draft', ...c, testCases: c.testCases.map((tc, i) => ({ id: `tc-${i}`, ...tc })) }
          : { status: 'draft', ...c },
      ),
    updateStatus: async () => {
      throw new Error('createChallenge must never update status');
    },
    updateDraft: async () => {
      throw new Error('createChallenge must never update a draft');
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
            return ok(
              c.type === 'code'
                ? { status: 'draft', ...c, testCases: c.testCases.map((tc, i) => ({ id: `tc-${i}`, ...tc })) }
                : { status: 'draft', ...c },
            );
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

  it('creates a draft code challenge with its test cases', async () => {
    const createChallenge = makeCreateChallenge(deps());

    const result = await createChallenge(baseCodeInput);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.challengeId).toBe('challenge-1');
  });

  it('rejects a code challenge with zero test cases', async () => {
    const createChallenge = makeCreateChallenge(deps());

    const result = await createChallenge({ ...baseCodeInput, testCases: [] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('VALIDATION');
  });

  it('rejects a code challenge in an unsupported language', async () => {
    const createChallenge = makeCreateChallenge(deps());

    // @ts-expect-error — deliberately an unsupported value, to exercise the
    // runtime guard behind the type system (the HTTP schema also rejects
    // this before it ever reaches here, but the use case does not trust it).
    const result = await createChallenge({ ...baseCodeInput, language: 'rust' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('VALIDATION');
  });
});
