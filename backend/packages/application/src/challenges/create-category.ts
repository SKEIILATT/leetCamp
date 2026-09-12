import {
  duplicateCategoryName,
  err,
  ok,
  type CategoryRepository,
  type Clock,
  type IdGenerator,
  type Result,
} from '@leetcamp/domain';

export interface CreateCategoryDeps {
  readonly categoryRepository: CategoryRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export interface CreateCategoryInput {
  readonly name: string;
}

export interface CreateCategoryOutput {
  readonly categoryId: string;
}

export function makeCreateCategory(
  deps: CreateCategoryDeps,
): (input: CreateCategoryInput) => Promise<Result<CreateCategoryOutput>> {
  return async (input) => {
    const existing = await deps.categoryRepository.findByName(input.name);
    if (!existing.ok) return err(existing.error);
    if (existing.value !== null) return err(duplicateCategoryName(input.name));

    const created = await deps.categoryRepository.create({
      id: deps.idGenerator.generate(),
      name: input.name,
      createdAt: deps.clock.now(),
    });
    if (!created.ok) return err(created.error);

    return ok({ categoryId: created.value.id });
  };
}
