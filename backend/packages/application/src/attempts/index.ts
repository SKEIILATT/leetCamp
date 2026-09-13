import type {
  AttemptRepository,
  ChallengeRepository,
  Clock,
  DailyChallengeRepository,
  IdGenerator,
  StreakRepository,
  UserRepository,
  ValidationEngine,
} from '@leetcamp/domain';

import { makeGetMyHistory } from './get-my-history.js';
import { makeGetMyStreak } from './get-my-streak.js';
import { makeSubmitAttempt } from './submit-attempt.js';

/**
 * The BUNDLE of the `attempts` vertical. Every use case here is meant for a
 * plain authenticated student acting on THEIR OWN data — `submitAttempt`
 * takes `userId` from `request.identity`, never from the body, and
 * `getMyStreak`/`getMyHistory` read no one else's rows because the route
 * always passes the caller's own id. Unlike `challenges`/`dailyChallenges`,
 * nothing here needs a role check.
 */
export interface AttemptsDeps {
  readonly attemptRepository: AttemptRepository;
  readonly streakRepository: StreakRepository;
  readonly dailyChallengeRepository: DailyChallengeRepository;
  readonly challengeRepository: ChallengeRepository;
  readonly userRepository: UserRepository;
  readonly validationEngine: ValidationEngine;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export function buildAttemptsUseCases(deps: AttemptsDeps) {
  return {
    submitAttempt: makeSubmitAttempt(deps),
    getMyStreak: makeGetMyStreak(deps),
    getMyHistory: makeGetMyHistory(deps),
  };
}

export type AttemptsUseCases = ReturnType<typeof buildAttemptsUseCases>;
