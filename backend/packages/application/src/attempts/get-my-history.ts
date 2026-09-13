import type { Attempt, AttemptRepository, Result } from '@leetcamp/domain';

export function makeGetMyHistory(deps: {
  readonly attemptRepository: AttemptRepository;
}): (input: { readonly userId: string }) => Promise<Result<readonly Attempt[]>> {
  return (input) => deps.attemptRepository.listByUser(input.userId);
}
