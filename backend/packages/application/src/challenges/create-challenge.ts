import {
  err,
  invalidCategoryReference,
  invalidDifficultyReference,
  ok,
  type CategoryRepository,
  type ChallengeRepository,
  type Clock,
  type DifficultyRepository,
  type IdGenerator,
  type Result,
} from '@leetcamp/domain';

export interface CreateChallengeDeps {
  readonly challengeRepository: ChallengeRepository;
  readonly categoryRepository: CategoryRepository;
  readonly difficultyRepository: DifficultyRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export interface CreateChallengeInput {
  readonly categoryId: string;
  readonly difficultyId: string;
  readonly title: string;
  readonly promptMarkdown: string;
  readonly codeSnippet: string;
  readonly expectedAnswer: string;
  /** From `request.identity.userId` — NEVER from the request body. */
  readonly createdBy: string;
}

export interface CreateChallengeOutput {
  readonly challengeId: string;
}

/**
 * Always creates a `draft`. Publishing is `publishChallenge`, a separate,
 * deliberate action — never a side effect of creation, so an admin can build
 * up a challenge (and see it rendered) before it can reach a student.
 */
export function makeCreateChallenge(
  deps: CreateChallengeDeps,
): (input: CreateChallengeInput) => Promise<Result<CreateChallengeOutput>> {
  return async (input) => {
    // Checked here, not left to the foreign key: a FK violation reaches the
    // repository as an opaque database error, and this way the client gets a
    // VALIDATION naming exactly which id is wrong.
    const category = await deps.categoryRepository.findById(input.categoryId);
    if (!category.ok) return err(category.error);
    if (category.value === null) return err(invalidCategoryReference(input.categoryId));

    const difficulty = await deps.difficultyRepository.findById(input.difficultyId);
    if (!difficulty.ok) return err(difficulty.error);
    if (difficulty.value === null) return err(invalidDifficultyReference(input.difficultyId));

    const now = deps.clock.now();
    const created = await deps.challengeRepository.create({
      id: deps.idGenerator.generate(),
      categoryId: input.categoryId,
      difficultyId: input.difficultyId,
      title: input.title,
      promptMarkdown: input.promptMarkdown,
      codeSnippet: input.codeSnippet,
      expectedAnswer: input.expectedAnswer,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });
    if (!created.ok) return err(created.error);

    return ok({ challengeId: created.value.id });
  };
}
