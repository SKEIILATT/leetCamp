import {
  err,
  formatCalendarDate,
  noDailyChallengeScheduled,
  ok,
  repository,
  type CategoryRepository,
  type ChallengeRepository,
  type Clock,
  type CodeLanguage,
  type DailyChallengeRepository,
  type DifficultyRepository,
  type Result,
} from '@leetcamp/domain';

export interface GetTodayChallengeDeps {
  readonly dailyChallengeRepository: DailyChallengeRepository;
  readonly challengeRepository: ChallengeRepository;
  /** Only for the display names on the response — see `PublicChallenge`.
   * Students cannot reach `GET /admin/categories`/`/admin/difficulties`
   * (admin-only), so this is the only way today's badge can show "SQL"
   * instead of a raw category id. */
  readonly categoryRepository: CategoryRepository;
  readonly difficultyRepository: DifficultyRepository;
  /** The GLOBAL reference clock for "what day is it" — deliberately NOT a
   * per-user timezone. There is one reto del día for the whole bootcamp; the
   * per-user day cutoff (docs/DECISIONS.md) only matters for `Streak`, not
   * for which challenge is showing right now. */
  readonly clock: Clock;
}

interface PublicChallengeBase {
  readonly challengeId: string;
  readonly date: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly difficultyId: string;
  readonly difficultyName: string;
  readonly title: string;
  readonly promptMarkdown: string;
  readonly publishedAt: Date;
}

/** A test case as the STUDENT sees it — `isHidden` is never sent (a hidden
 * case's whole point is that its own flag does not leak either), only the
 * two fields a non-hidden case has anything useful to show. */
export interface PublicTestCase {
  readonly input: string;
  readonly expectedOutput: string;
}

/**
 * The student-facing view of today's challenge.
 *
 * ⚠ NO `expectedAnswer` FIELD, and no HIDDEN test cases, ON PURPOSE. Unlike
 * `Challenge` in `@leetcamp/domain`, this type cannot even represent carrying
 * the prediction answer or a hidden case's input/output — that is not a
 * serialization choice made at the route, it is enforced by the shape this
 * use case returns. A student reading this response can never see the
 * prediction answer before submitting one, nor a hidden test case's content.
 */
export type PublicChallenge =
  | (PublicChallengeBase & { readonly type: 'prediction'; readonly codeSnippet: string })
  | (PublicChallengeBase & {
      readonly type: 'code';
      readonly starterCode: string;
      readonly language: CodeLanguage;
      readonly visibleTestCases: readonly PublicTestCase[];
    });

export function makeGetTodayChallenge(
  deps: GetTodayChallengeDeps,
): () => Promise<Result<PublicChallenge>> {
  return async () => {
    const today = formatCalendarDate(deps.clock.now(), deps.clock.timeZone);

    const daily = await deps.dailyChallengeRepository.findByDate(today);
    if (!daily.ok) return err(daily.error);
    if (daily.value === null) return err(noDailyChallengeScheduled(today));

    const challenge = await deps.challengeRepository.findById(daily.value.challengeId);
    if (!challenge.ok) return err(challenge.error);
    if (challenge.value === null) {
      // The foreign key on `daily_challenges.challenge_id` makes this
      // unreachable in practice — there is no delete-challenge operation yet
      // for it to survive. Kept as a REPOSITORY (not NOT_FOUND) failure
      // because if it ever fires, it means the data is inconsistent, not that
      // the student asked for something that legitimately does not exist.
      return err(repository('Scheduled daily challenge references a missing challenge'));
    }

    const category = await deps.categoryRepository.findById(challenge.value.categoryId);
    if (!category.ok) return err(category.error);
    if (category.value === null) {
      return err(repository('Challenge references a missing category'));
    }

    const difficulty = await deps.difficultyRepository.findById(challenge.value.difficultyId);
    if (!difficulty.ok) return err(difficulty.error);
    if (difficulty.value === null) {
      return err(repository('Challenge references a missing difficulty'));
    }

    const base = {
      challengeId: challenge.value.id,
      date: daily.value.date,
      categoryId: challenge.value.categoryId,
      categoryName: category.value.name,
      difficultyId: challenge.value.difficultyId,
      difficultyName: difficulty.value.name,
      title: challenge.value.title,
      promptMarkdown: challenge.value.promptMarkdown,
      publishedAt: daily.value.publishedAt,
    };

    if (challenge.value.type === 'code') {
      return ok({
        ...base,
        type: 'code',
        starterCode: challenge.value.starterCode,
        language: challenge.value.language,
        // Hidden test cases are filtered out HERE, not left to the route
        // schema to strip — same reasoning as the missing `expectedAnswer`
        // field above.
        visibleTestCases: challenge.value.testCases
          .filter((testCase) => !testCase.isHidden)
          .map((testCase) => ({ input: testCase.input, expectedOutput: testCase.expectedOutput })),
      });
    }

    return ok({ ...base, type: 'prediction', codeSnippet: challenge.value.codeSnippet });
  };
}
