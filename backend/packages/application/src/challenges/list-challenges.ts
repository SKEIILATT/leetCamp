import type { Challenge, ChallengeRepository, ChallengeStatus, Result } from '@leetcamp/domain';

export function makeListChallenges(deps: {
  readonly challengeRepository: ChallengeRepository;
}): (filter?: { readonly status?: ChallengeStatus }) => Promise<Result<readonly Challenge[]>> {
  return (filter) => deps.challengeRepository.list(filter);
}
