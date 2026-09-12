import type { Category, CategoryRepository, Result } from '@leetcamp/domain';

export function makeListCategories(deps: {
  readonly categoryRepository: CategoryRepository;
}): () => Promise<Result<readonly Category[]>> {
  return () => deps.categoryRepository.list();
}
