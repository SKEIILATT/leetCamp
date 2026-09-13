import {
  challengeNotFound,
  challengeNotPublished,
  dailyChallengeAlreadyScheduled,
  err,
  ok,
  type ChallengeRepository,
  type Clock,
  type DailyChallengeRepository,
  type Result,
} from '@leetcamp/domain';

export interface ScheduleDailyChallengeDeps {
  readonly dailyChallengeRepository: DailyChallengeRepository;
  readonly challengeRepository: ChallengeRepository;
  readonly clock: Clock;
}

export interface ScheduleDailyChallengeInput {
  /** 'YYYY-MM-DD', already validated as a real calendar date by the HTTP
   * layer's Zod schema (`z.iso.date()`). */
  readonly date: string;
  readonly challengeId: string;
}

/**
 * Manual admin action — see the header note on the `DailyChallenge` entity
 * for why this is not automated in the MVP.
 */
export function makeScheduleDailyChallenge(
  deps: ScheduleDailyChallengeDeps,
): (input: ScheduleDailyChallengeInput) => Promise<Result<void>> {
  return async (input) => {
    const existing = await deps.dailyChallengeRepository.findByDate(input.date);
    if (!existing.ok) return err(existing.error);
    if (existing.value !== null) return err(dailyChallengeAlreadyScheduled(input.date));

    const challenge = await deps.challengeRepository.findById(input.challengeId);
    if (!challenge.ok) return err(challenge.error);
    if (challenge.value === null) return err(challengeNotFound(input.challengeId));
    // Only a PUBLISHED challenge may go live as the reto del día — a draft
    // reaching a student is a content leak, not a display bug.
    if (challenge.value.status !== 'published') {
      return err(challengeNotPublished(input.challengeId));
    }

    const created = await deps.dailyChallengeRepository.create({
      date: input.date,
      challengeId: input.challengeId,
      publishedAt: deps.clock.now(),
    });
    if (!created.ok) return err(created.error);

    return ok(undefined);
  };
}
