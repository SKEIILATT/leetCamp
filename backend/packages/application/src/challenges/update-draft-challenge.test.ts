import { describe, expect, it } from 'vitest';
import {
  err,
  ok,
  repository,
  type Category,
  type CategoryRepository,
  type Challenge,
  type ChallengeRepository,
  type Clock,
  type Difficulty,
  type DifficultyRepository,
} from '@leetcamp/domain';

import { makeUpdateDraftChallenge } from './update-draft-challenge.js';

const fixedClock: Clock = { now: () => new Date('2026-03-15T08:00:00Z'), timeZone: 'UTC' };

const category: Category = { id: 'cat-1', name: 'SQL', createdAt: new Date('2026-01-01T00:00:00Z') };
const difficulty: Difficulty = {
  id: 'diff-1',
  name: 'Easy',
  level: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const draftPrediction: Challenge = {
  id: 'challenge-1',
  categoryId: 'cat-1',
  difficultyId: 'diff-1',
  type: 'prediction',
  title: 'old title',
  promptMarkdown: 'old prompt',
  codeSnippet: 'old code',
  expectedAnswer: 'old answer',
  status: 'draft',
  createdBy: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const draftCode: Challenge = {
  id: 'challenge-2',
  categoryId: 'cat-1',
  difficultyId: 'diff-1',
  type: 'code',
  title: 'old title',
  promptMarkdown: 'old prompt',
  starterCode: 'function solve() {}',
  language: 'javascript',
  testCases: [{ id: 'tc-1', input: '1', expectedOutput: '1', isHidden: false }],
  status: 'draft',
  createdBy: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const predictionEdit = {
  challengeId: draftPrediction.id,
  type: 'prediction' as const,
  categoryId: category.id,
  difficultyId: difficulty.id,
  title: 'new title',
  promptMarkdown: 'new prompt',
  codeSnippet: 'new code',
  expectedAnswer: 'new answer',
};

const codeEdit = {
  challengeId: draftCode.id,
  type: 'code' as const,
  categoryId: category.id,
  difficultyId: difficulty.id,
  title: 'new title',
  promptMarkdown: 'new prompt',
  starterCode: 'function solve() { return 1; }',
  language: 'javascript' as const,
  testCases: [{ input: '2', expectedOutput: '2', isHidden: true }],
};

function deps(overrides: {
  challengeRepository?: Partial<ChallengeRepository>;
  categoryRepository?: Partial<CategoryRepository>;
  difficultyRepository?: Partial<DifficultyRepository>;
} = {}) {
  const challengeRepository: ChallengeRepository = {
    findById: async () => ok(draftPrediction),
    list: async () => ok([]),
    create: async () => ok(draftPrediction),
    updateStatus: async () => {
      throw new Error('updateDraftChallenge must never update status');
    },
    updateDraft: async (_id, edit) => ok({ ...draftPrediction, ...edit } as Challenge),
    ...overrides.challengeRepository,
  };
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

  return { challengeRepository, categoryRepository, difficultyRepository, clock: fixedClock };
}

describe('updateDraftChallenge', () => {
  it('edits a draft prediction challenge', async () => {
    const updateDraftChallenge = makeUpdateDraftChallenge(deps());

    const result = await updateDraftChallenge(predictionEdit);

    expect(result.ok).toBe(true);
  });

  it('edits a draft code challenge, replacing its test cases wholesale', async () => {
    let editReceived: unknown;
    const updateDraftChallenge = makeUpdateDraftChallenge(
      deps({
        challengeRepository: {
          findById: async () => ok(draftCode),
          updateDraft: async (_id, edit) => {
            editReceived = edit;
            return ok(draftCode);
          },
        },
      }),
    );

    const result = await updateDraftChallenge(codeEdit);

    expect(result.ok).toBe(true);
    expect(editReceived).toMatchObject({ type: 'code', testCases: codeEdit.testCases });
  });

  it('rejects editing an unknown challenge with NOT_FOUND', async () => {
    const updateDraftChallenge = makeUpdateDraftChallenge(
      deps({ challengeRepository: { findById: async () => ok(null) } }),
    );

    const result = await updateDraftChallenge(predictionEdit);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rejects editing a challenge that is no longer a draft, with CONFLICT', async () => {
    const updateDraftChallenge = makeUpdateDraftChallenge(
      deps({ challengeRepository: { findById: async () => ok({ ...draftPrediction, status: 'published' }) } }),
    );

    const result = await updateDraftChallenge(predictionEdit);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('CONFLICT');
  });

  it('rejects changing a challenge\'s type, with VALIDATION', async () => {
    const updateDraftChallenge = makeUpdateDraftChallenge(
      deps({ challengeRepository: { findById: async () => ok(draftPrediction) } }),
    );

    const result = await updateDraftChallenge(codeEdit);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('VALIDATION');
  });

  it('rejects an unknown categoryId with VALIDATION', async () => {
    const updateDraftChallenge = makeUpdateDraftChallenge(
      deps({ categoryRepository: { findById: async () => ok(null) } }),
    );

    const result = await updateDraftChallenge(predictionEdit);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('VALIDATION');
  });

  it('rejects a code edit with zero test cases', async () => {
    const updateDraftChallenge = makeUpdateDraftChallenge(
      deps({ challengeRepository: { findById: async () => ok(draftCode) } }),
    );

    const result = await updateDraftChallenge({ ...codeEdit, testCases: [] });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('VALIDATION');
  });

  it('propagates a repository failure from the lookup', async () => {
    const updateDraftChallenge = makeUpdateDraftChallenge(
      deps({ challengeRepository: { findById: async () => err(repository('connection refused')) } }),
    );

    const result = await updateDraftChallenge(predictionEdit);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });
});
