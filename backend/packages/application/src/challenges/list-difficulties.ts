import type { Difficulty, DifficultyRepository, Result } from '@leetcamp/domain';

export function makeListDifficulties(deps: {
  readonly difficultyRepository: DifficultyRepository;
}): () => Promise<Result<readonly Difficulty[]>> {
  return () => deps.difficultyRepository.list();
}
