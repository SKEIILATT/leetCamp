import {
  err,
  ok,
  type Attempt,
  type AttemptRepository,
  type ChallengeRepository,
  type DailyChallengeRepository,
  type Result,
} from '@leetcamp/domain';

/** `Attempt` plus the title of the challenge it was answering — `Attempt`
 * itself only stores `dailyChallengeDate` (see the domain entity's header
 * comment), so the title is resolved here, one hop through
 * `DailyChallenge.challengeId`, purely for display in the student's history. */
export interface HistoryEntry extends Attempt {
  readonly challengeTitle: string;
}

export interface GetMyHistoryDeps {
  readonly attemptRepository: AttemptRepository;
  readonly dailyChallengeRepository: DailyChallengeRepository;
  readonly challengeRepository: ChallengeRepository;
}

export function makeGetMyHistory(
  deps: GetMyHistoryDeps,
): (input: { readonly userId: string }) => Promise<Result<readonly HistoryEntry[]>> {
  return async (input) => {
    const attempts = await deps.attemptRepository.listByUser(input.userId);
    if (!attempts.ok) return err(attempts.error);

    const entries: HistoryEntry[] = [];

    // Sequential, not `Promise.all`: at this project's scale (30-100
    // students, one attempt per day) an N+1 lookup here costs nothing real,
    // and it keeps the first repository failure the one actually reported
    // instead of a racy "whichever promise rejects first".
    for (const attempt of attempts.value) {
      // A student's own attempt against a day whose scheduling later changed
      // is a real, benign case (not a data-integrity error like the same
      // lookup failing in `submitAttempt`) — the day already happened exactly
      // as recorded, so a missing lookup here degrades to a label, not a 500.
      let challengeTitle = 'Reto no disponible';

      const daily = await deps.dailyChallengeRepository.findByDate(attempt.dailyChallengeDate);
      if (!daily.ok) return err(daily.error);

      if (daily.value !== null) {
        const challenge = await deps.challengeRepository.findById(daily.value.challengeId);
        if (!challenge.ok) return err(challenge.error);
        if (challenge.value !== null) {
          challengeTitle = challenge.value.title;
        }
      }

      entries.push({ ...attempt, challengeTitle });
    }

    return ok(entries);
  };
}
