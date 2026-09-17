import { describe, expect, it } from 'vitest';
import { ok, type CodeChallenge, type PredictionChallenge, type ValidationEngine } from '@leetcamp/domain';

import { createCompositeValidationEngine } from './composite-validation-engine.js';

const predictionChallenge: PredictionChallenge = {
  id: 'challenge-1',
  categoryId: 'cat-1',
  difficultyId: 'diff-1',
  type: 'prediction',
  title: 'title',
  promptMarkdown: 'prompt',
  codeSnippet: 'code',
  expectedAnswer: '42',
  status: 'published',
  createdBy: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const codeChallenge: CodeChallenge = {
  id: 'challenge-2',
  categoryId: 'cat-1',
  difficultyId: 'diff-1',
  type: 'code',
  title: 'title',
  promptMarkdown: 'prompt',
  starterCode: 'function solve() {}',
  language: 'javascript',
  testCases: [{ id: 'tc-1', input: '1', expectedOutput: '1', isHidden: false }],
  status: 'published',
  createdBy: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('compositeValidationEngine', () => {
  it('routes a prediction challenge to the prediction engine', async () => {
    let called = false;
    const prediction: ValidationEngine = {
      validate: async () => {
        called = true;
        return ok({ isCorrect: true });
      },
    };
    const code: ValidationEngine = { validate: async () => ok({ isCorrect: false }) };

    const engine = createCompositeValidationEngine({ prediction, code });
    const result = await engine.validate(predictionChallenge, '42');

    expect(called).toBe(true);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.isCorrect).toBe(true);
  });

  it('routes a code challenge to the code engine', async () => {
    let called = false;
    const prediction: ValidationEngine = { validate: async () => ok({ isCorrect: false }) };
    const code: ValidationEngine = {
      validate: async () => {
        called = true;
        return ok({ isCorrect: true });
      },
    };

    const engine = createCompositeValidationEngine({ prediction, code });
    const result = await engine.validate(codeChallenge, 'function solve() {}');

    expect(called).toBe(true);
    expect(result.ok).toBe(true);
  });

  it('fails with EXTERNAL_SERVICE for a code challenge when Judge0 is not configured', async () => {
    const prediction: ValidationEngine = { validate: async () => ok({ isCorrect: false }) };

    const engine = createCompositeValidationEngine({ prediction, code: null });
    const result = await engine.validate(codeChallenge, 'anything');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('EXTERNAL_SERVICE');
  });
});
