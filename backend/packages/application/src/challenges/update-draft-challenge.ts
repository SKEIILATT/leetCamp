import {
  challengeNotFound,
  codeChallengeNeedsTestCases,
  conflict,
  err,
  invalidCategoryReference,
  invalidDifficultyReference,
  ok,
  validation,
  type CategoryRepository,
  type ChallengeRepository,
  type Clock,
  type CodeLanguage,
  type DifficultyRepository,
  type NewTestCase,
  type Result,
} from '@leetcamp/domain';

export interface UpdateDraftChallengeDeps {
  readonly challengeRepository: ChallengeRepository;
  readonly categoryRepository: CategoryRepository;
  readonly difficultyRepository: DifficultyRepository;
  readonly clock: Clock;
}

interface UpdateDraftChallengeInputBase {
  readonly challengeId: string;
  readonly categoryId: string;
  readonly difficultyId: string;
  readonly title: string;
  readonly promptMarkdown: string;
}

export type UpdateDraftChallengeInput =
  | (UpdateDraftChallengeInputBase & {
      readonly type: 'prediction';
      readonly codeSnippet: string;
      readonly expectedAnswer: string;
    })
  | (UpdateDraftChallengeInputBase & {
      readonly type: 'code';
      readonly starterCode: string;
      readonly language: CodeLanguage;
      readonly testCases: readonly NewTestCase[];
    });

const SUPPORTED_LANGUAGES: readonly CodeLanguage[] = ['javascript', 'python', 'sql'];

/**
 * Edits a challenge that is still `draft` — a typo in a test case or a
 * prompt should not require deleting and recreating the whole thing. Once
 * `published`, a challenge is immutable through this use case: editing test
 * cases retroactively would change what a challenge means for whoever has
 * already seen it, the same "one direction only" reasoning `publishChallenge`
 * already applies to the status transition itself.
 *
 * `type` may NOT change on an edit (switching a prediction into a code
 * challenge or back is a different challenge, not an edit of this one) — the
 * repository's `create` is the only writer of `type`, this use case never
 * touches it.
 */
export function makeUpdateDraftChallenge(
  deps: UpdateDraftChallengeDeps,
): (input: UpdateDraftChallengeInput) => Promise<Result<void>> {
  return async (input) => {
    const found = await deps.challengeRepository.findById(input.challengeId);
    if (!found.ok) return err(found.error);
    if (found.value === null) return err(challengeNotFound(input.challengeId));

    if (found.value.status !== 'draft') {
      return err(conflict(`Challenge ${input.challengeId} is no longer a draft`));
    }
    if (found.value.type !== input.type) {
      return err(validation(`Cannot change a '${found.value.type}' challenge into a '${input.type}' one`));
    }

    const category = await deps.categoryRepository.findById(input.categoryId);
    if (!category.ok) return err(category.error);
    if (category.value === null) return err(invalidCategoryReference(input.categoryId));

    const difficulty = await deps.difficultyRepository.findById(input.difficultyId);
    if (!difficulty.ok) return err(difficulty.error);
    if (difficulty.value === null) return err(invalidDifficultyReference(input.difficultyId));

    if (input.type === 'code') {
      if (input.testCases.length === 0) return err(codeChallengeNeedsTestCases());
      if (!SUPPORTED_LANGUAGES.includes(input.language)) {
        return err(validation(`Unsupported language: ${input.language}`));
      }
    }

    const updated = await deps.challengeRepository.updateDraft(
      input.challengeId,
      input.type === 'prediction'
        ? {
            type: 'prediction',
            categoryId: input.categoryId,
            difficultyId: input.difficultyId,
            title: input.title,
            promptMarkdown: input.promptMarkdown,
            codeSnippet: input.codeSnippet,
            expectedAnswer: input.expectedAnswer,
          }
        : {
            type: 'code',
            categoryId: input.categoryId,
            difficultyId: input.difficultyId,
            title: input.title,
            promptMarkdown: input.promptMarkdown,
            starterCode: input.starterCode,
            language: input.language,
            testCases: input.testCases,
          },
      deps.clock.now(),
    );
    if (!updated.ok) return err(updated.error);

    return ok(undefined);
  };
}
