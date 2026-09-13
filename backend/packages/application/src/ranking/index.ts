import type { StreakRepository } from '@leetcamp/domain';

import { makeGetRanking } from './get-ranking.js';

/** The BUNDLE of the `ranking` vertical — one read-only use case, no role
 * gate: every authenticated student can see the leaderboard. */
export interface RankingDeps {
  readonly streakRepository: StreakRepository;
}

export function buildRankingUseCases(deps: RankingDeps) {
  return {
    getRanking: makeGetRanking(deps),
  };
}

export type RankingUseCases = ReturnType<typeof buildRankingUseCases>;
