import type {
  CategoryRepository,
  ChallengeRepository,
  Clock,
  DailyChallengeRepository,
  DifficultyRepository,
} from '@leetcamp/domain';

import { makeGetTodayChallenge } from './get-today-challenge.js';
import { makeListDailyChallenges } from './list-daily-challenges.js';
import { makeScheduleDailyChallenge } from './schedule-daily-challenge.js';

/**
 * The BUNDLE of the `dailyChallenges` vertical.
 *
 * ⚠ `scheduleDailyChallenge` and `listDailyChallenges` are admin-only —
 * enforced at the route (`app.requireRole(ROLE_ID.ADMIN)`), same as the
 * `challenges` vertical. `getTodayChallenge` is the one use case here meant
 * for a plain authenticated student, and it is the only one whose output type
 * cannot even represent the answer — see `PublicChallenge`.
 */
export interface DailyChallengesDeps {
  readonly dailyChallengeRepository: DailyChallengeRepository;
  readonly challengeRepository: ChallengeRepository;
  readonly categoryRepository: CategoryRepository;
  readonly difficultyRepository: DifficultyRepository;
  readonly clock: Clock;
}

export function buildDailyChallengesUseCases(deps: DailyChallengesDeps) {
  return {
    scheduleDailyChallenge: makeScheduleDailyChallenge(deps),
    listDailyChallenges: makeListDailyChallenges(deps),
    getTodayChallenge: makeGetTodayChallenge(deps),
  };
}

export type DailyChallengesUseCases = ReturnType<typeof buildDailyChallengesUseCases>;
