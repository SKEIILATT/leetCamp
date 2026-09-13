import type { DailyChallenge, DailyChallengeRepository, Result } from '@leetcamp/domain';

export function makeListDailyChallenges(deps: {
  readonly dailyChallengeRepository: DailyChallengeRepository;
}): () => Promise<Result<readonly DailyChallenge[]>> {
  return () => deps.dailyChallengeRepository.list();
}
