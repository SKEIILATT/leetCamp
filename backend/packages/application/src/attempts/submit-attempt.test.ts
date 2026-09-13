import { describe, expect, it } from 'vitest';
import {
  err,
  ok,
  repository,
  ROLE_ID,
  type Attempt,
  type AttemptRepository,
  type Challenge,
  type ChallengeRepository,
  type Clock,
  type DailyChallenge,
  type DailyChallengeRepository,
  type Difficulty,
  type DifficultyRepository,
  type StreakRepository,
  type User,
  type UserRepository,
  type ValidationEngine,
} from '@leetcamp/domain';

import { makeSubmitAttempt } from './submit-attempt.js';

const clock: Clock = { now: () => new Date('2026-03-15T08:00:00Z'), timeZone: 'UTC' };

const daily: DailyChallenge = {
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
  expectedAnswer: '42',
  status: 'published',
  createdBy: 'admin-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const difficulty: Difficulty = {
  id: 'diff-1',
  name: 'Medium',
  level: 2,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const student: User = {
  id: 'user-1',
  email: 'student@example.com',
  passwordHash: 'hash',
  displayName: 'Student',
  roleId: ROLE_ID.STUDENT,
  timezone: 'America/Guayaquil',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

function deps(overrides: {
  attemptRepository?: Partial<AttemptRepository>;
  streakRepository?: Partial<StreakRepository>;
  dailyChallengeRepository?: Partial<DailyChallengeRepository>;
  challengeRepository?: Partial<ChallengeRepository>;
  difficultyRepository?: Partial<DifficultyRepository>;
  userRepository?: Partial<UserRepository>;
  validationEngine?: Partial<ValidationEngine>;
  clock?: Clock;
} = {}) {
  const attemptRepository: AttemptRepository = {
    findByUserAndDate: async () => ok(null),
    listByUser: async () => ok([]),
    create: async (a) => ok({ ...a }),
    ...overrides.attemptRepository,
  };
  const streakRepository: StreakRepository = {
    findByUserId: async () => ok(null),
    save: async (s) => ok(s),
    listRanked: async () => ok([]),
    ...overrides.streakRepository,
  };
  const dailyChallengeRepository: DailyChallengeRepository = {
    findByDate: async () => ok(daily),
    list: async () => ok([daily]),
    create: async () => ok(daily),
    ...overrides.dailyChallengeRepository,
  };
  const challengeRepository: ChallengeRepository = {
    findById: async () => ok(challenge),
    list: async () => ok([challenge]),
    create: async () => ok(challenge),
    updateStatus: async () => ok(challenge),
    ...overrides.challengeRepository,
  };
  const difficultyRepository: DifficultyRepository = {
    findById: async () => ok(difficulty),
    findByName: async () => ok(null),
    list: async () => ok([difficulty]),
    create: async () => ok(difficulty),
    ...overrides.difficultyRepository,
  };
  const userRepository: UserRepository = {
    findByEmail: async () => ok(student),
    findById: async () => ok(student),
    list: async () => ok([student]),
    setActive: async () => ok(student),
    create: async () => ok(student),
    ...overrides.userRepository,
  };
  const validationEngine: ValidationEngine = {
    validate: async (_c, answer) => ok({ isCorrect: answer === challenge.expectedAnswer }),
    ...overrides.validationEngine,
  };

  return {
    attemptRepository,
    streakRepository,
    dailyChallengeRepository,
    challengeRepository,
    difficultyRepository,
    userRepository,
    validationEngine,
    idGenerator: { generate: () => 'attempt-1' },
    clock: overrides.clock ?? clock,
  };
}

describe('submitAttempt', () => {
  it('records a correct answer and starts the streak at 1', async () => {
    const submitAttempt = makeSubmitAttempt(deps());

    const result = await submitAttempt({ userId: student.id, answer: '42' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.isCorrect).toBe(true);
    expect(result.value.currentStreak).toBe(1);
    expect(result.value.longestStreak).toBe(1);
    // difficulty level 2 * 10 = 20 base; 8 hours elapsed, past every speed
    // bonus tier, so +0.
    expect(result.value.pointsEarned).toBe(20);
    expect(result.value.totalPoints).toBe(20);
  });

  it('still records a WRONG answer and still updates the streak — participation, not correctness', async () => {
    let attemptCreated = false;
    let streakSaved = false;

    const submitAttempt = makeSubmitAttempt(
      deps({
        attemptRepository: {
          create: async (a) => {
            attemptCreated = true;
            expect(a.isCorrect).toBe(false);
            return ok({ ...a });
          },
        },
        streakRepository: {
          save: async (s) => {
            streakSaved = true;
            return ok(s);
          },
        },
      }),
    );

    const result = await submitAttempt({ userId: student.id, answer: 'not the answer' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.isCorrect).toBe(false);
    expect(result.value.pointsEarned).toBe(0);
    expect(attemptCreated).toBe(true);
    expect(streakSaved).toBe(true);
  });

  it('uses the STUDENT\'s own timezone for the streak date, not the global UTC clock', async () => {
    let localDateUsed: string | undefined;

    // Late in the UTC day: the daily challenge is still '2026-03-15' (the
    // global UTC date this instant falls on), but 23:30 UTC + 13h is already
    // the 16th in Auckland — this is what actually exercises "the streak date
    // is NOT the same as the challenge's date".
    const lateUtcClock: Clock = { now: () => new Date('2026-03-15T23:30:00Z'), timeZone: 'UTC' };

    const submitAttempt = makeSubmitAttempt(
      deps({
        clock: lateUtcClock,
        userRepository: { findById: async () => ok({ ...student, timezone: 'Pacific/Auckland' }) },
        streakRepository: {
          save: async (s) => {
            localDateUsed = s.lastAttemptDate;
            return ok(s);
          },
        },
      }),
    );

    await submitAttempt({ userId: student.id, answer: '42' });

    expect(localDateUsed).toBe('2026-03-16');
  });

  it('awards the fast speed bonus when answered within 5 minutes of publishing', async () => {
    const fastClock: Clock = { now: () => new Date('2026-03-15T00:02:00Z'), timeZone: 'UTC' };

    const submitAttempt = makeSubmitAttempt(deps({ clock: fastClock }));

    const result = await submitAttempt({ userId: student.id, answer: '42' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    // base 20 + fast bonus 10.
    expect(result.value.pointsEarned).toBe(30);
  });

  it('propagates a repository failure from the difficulty lookup', async () => {
    const submitAttempt = makeSubmitAttempt(
      deps({ difficultyRepository: { findById: async () => err(repository('connection refused')) } }),
    );

    const result = await submitAttempt({ userId: student.id, answer: '42' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });

  it('rejects when nothing is scheduled today, without creating an attempt', async () => {
    let attemptCreated = false;

    const submitAttempt = makeSubmitAttempt(
      deps({
        dailyChallengeRepository: { findByDate: async () => ok(null) },
        attemptRepository: {
          create: async (a) => {
            attemptCreated = true;
            return ok({ ...a });
          },
        },
      }),
    );

    const result = await submitAttempt({ userId: student.id, answer: '42' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('NOT_FOUND');
    expect(attemptCreated).toBe(false);
  });

  it('rejects a second attempt the same day with CONFLICT, without validating the answer', async () => {
    const alreadySubmitted: Attempt = {
      id: 'attempt-0',
      userId: student.id,
      dailyChallengeDate: daily.date,
      answer: '42',
      isCorrect: true,
      submittedAt: new Date('2026-03-15T01:00:00Z'),
      timeTakenSeconds: 3600,
      points: 20,
    };
    let validated = false;

    const submitAttempt = makeSubmitAttempt(
      deps({
        attemptRepository: { findByUserAndDate: async () => ok(alreadySubmitted) },
        validationEngine: {
          validate: async () => {
            validated = true;
            return ok({ isCorrect: true });
          },
        },
      }),
    );

    const result = await submitAttempt({ userId: student.id, answer: '42' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('CONFLICT');
    expect(validated).toBe(false);
  });

  it('propagates a repository failure from the daily-challenge lookup', async () => {
    const submitAttempt = makeSubmitAttempt(
      deps({ dailyChallengeRepository: { findByDate: async () => err(repository('connection refused')) } }),
    );

    const result = await submitAttempt({ userId: student.id, answer: '42' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });
});
