import { describe, expect, it } from 'vitest';

import { calculatePoints } from './scoring.js';

describe('calculatePoints', () => {
  it('always awards 0 for a wrong answer, regardless of difficulty or speed', () => {
    expect(calculatePoints({ isCorrect: false, difficultyLevel: 3, timeTakenSeconds: 1 })).toBe(0);
  });

  it('scales the base with the difficulty level', () => {
    expect(calculatePoints({ isCorrect: true, difficultyLevel: 1, timeTakenSeconds: 10_000 })).toBe(10);
    expect(calculatePoints({ isCorrect: true, difficultyLevel: 3, timeTakenSeconds: 10_000 })).toBe(30);
  });

  it('awards the fast bonus inside 5 minutes', () => {
    expect(calculatePoints({ isCorrect: true, difficultyLevel: 2, timeTakenSeconds: 299 })).toBe(30);
    // Exactly on the boundary counts as fast.
    expect(calculatePoints({ isCorrect: true, difficultyLevel: 2, timeTakenSeconds: 300 })).toBe(30);
  });

  it('awards the moderate bonus between 5 and 30 minutes', () => {
    expect(calculatePoints({ isCorrect: true, difficultyLevel: 2, timeTakenSeconds: 301 })).toBe(25);
    expect(calculatePoints({ isCorrect: true, difficultyLevel: 2, timeTakenSeconds: 1800 })).toBe(25);
  });

  it('awards no speed bonus past 30 minutes', () => {
    expect(calculatePoints({ isCorrect: true, difficultyLevel: 2, timeTakenSeconds: 1801 })).toBe(20);
  });
});
