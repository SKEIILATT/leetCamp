import {
  duplicateDifficultyName,
  err,
  ok,
  type Clock,
  type DifficultyRepository,
  type IdGenerator,
  type Result,
} from '@leetcamp/domain';

export interface CreateDifficultyDeps {
  readonly difficultyRepository: DifficultyRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export interface CreateDifficultyInput {
  readonly name: string;
  readonly level: number;
}

export interface CreateDifficultyOutput {
  readonly difficultyId: string;
}

export function makeCreateDifficulty(
  deps: CreateDifficultyDeps,
): (input: CreateDifficultyInput) => Promise<Result<CreateDifficultyOutput>> {
  return async (input) => {
    const existing = await deps.difficultyRepository.findByName(input.name);
    if (!existing.ok) return err(existing.error);
    if (existing.value !== null) return err(duplicateDifficultyName(input.name));

    const created = await deps.difficultyRepository.create({
      id: deps.idGenerator.generate(),
      name: input.name,
      level: input.level,
      createdAt: deps.clock.now(),
    });
    if (!created.ok) return err(created.error);

    return ok({ difficultyId: created.value.id });
  };
}
