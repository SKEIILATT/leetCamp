import {
  err,
  formatCalendarDate,
  noDailyChallengeScheduled,
  ok,
  repository,
  type ChallengeRepository,
  type Clock,
  type DailyChallengeRepository,
  type Result,
} from '@leetcamp/domain';

export interface GetTodayChallengeDeps {
  readonly dailyChallengeRepository: DailyChallengeRepository;
  readonly challengeRepository: ChallengeRepository;
  /** The GLOBAL reference clock for "what day is it" — deliberately NOT a
   * per-user timezone. There is one reto del día for the whole bootcamp; the
   * per-user day cutoff (docs/DECISIONS.md) only matters for `Streak`, not
   * for which challenge is showing right now. */
  readonly clock: Clock;
}

/**
 * The student-facing view of today's challenge.
 *
 * ⚠ NO `expectedAnswer` FIELD, ON PURPOSE. Unlike `Challenge` in
 * `@leetcamp/domain`, this type cannot even represent carrying the answer —
 * that is not a serialization choice made at the route, it is enforced by the
 * shape this use case returns. A student reading this response can never see
 * the answer before submitting one.
 */
export interface PublicChallenge {
  readonly challengeId: string;
  readonly date: string;
  readonly categoryId: string;
  readonly difficultyId: string;
  readonly title: string;
  readonly promptMarkdown: string;
  readonly codeSnippet: string;
  readonly publishedAt: Date;
}

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

    return ok({
      challengeId: challenge.value.id,
      date: daily.value.date,
      categoryId: challenge.value.categoryId,
      difficultyId: challenge.value.difficultyId,
      title: challenge.value.title,
      promptMarkdown: challenge.value.promptMarkdown,
      codeSnippet: challenge.value.codeSnippet,
      publishedAt: daily.value.publishedAt,
    });
  };
}
