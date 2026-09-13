import {
  alreadyAttempted,
  applyAttempt,
  calculatePoints,
  err,
  formatCalendarDate,
  noDailyChallengeScheduled,
  ok,
  repository,
  type AttemptRepository,
  type ChallengeRepository,
  type Clock,
  type DailyChallengeRepository,
  type DifficultyRepository,
  type IdGenerator,
  type Result,
  type StreakRepository,
  type UserRepository,
  type ValidationEngine,
} from '@leetcamp/domain';

export interface SubmitAttemptDeps {
  readonly attemptRepository: AttemptRepository;
  readonly streakRepository: StreakRepository;
  readonly dailyChallengeRepository: DailyChallengeRepository;
  readonly challengeRepository: ChallengeRepository;
  /** Needed only for `calculatePoints`'s `difficultyLevel` input — see the
   * note where it is read below. */
  readonly difficultyRepository: DifficultyRepository;
  readonly userRepository: UserRepository;
  readonly validationEngine: ValidationEngine;
  readonly idGenerator: IdGenerator;
  /** GLOBAL clock (UTC) — resolves WHICH daily challenge is live right now,
   * same reference as `getTodayChallenge`. The student's OWN timezone (read
   * from `userRepository`) is a separate concern, used only for the streak's
   * local date — see the note below. */
  readonly clock: Clock;
}

export interface SubmitAttemptInput {
  /** From `request.identity.userId` — never from the request body. */
  readonly userId: string;
  readonly answer: string;
}

export interface SubmitAttemptOutput {
  readonly attemptId: string;
  readonly isCorrect: boolean;
  readonly pointsEarned: number;
  readonly currentStreak: number;
  readonly longestStreak: number;
  readonly totalPoints: number;
}

/**
 * Orchestrates the whole "student answers today's challenge" flow: resolve
 * today's challenge → enforce one attempt per day → judge the answer → record
 * it → update the streak. See docs/DECISIONS.md for the product rules this
 * encodes (one attempt, blocked after submit; streak counts participation,
 * not correctness; no grace period).
 *
 * ⚠ NOT WRAPPED IN A DATABASE TRANSACTION. If the attempt write succeeds and
 * the streak write then fails, the attempt is not lost — the streak is
 * re-derivable from attempt history — but it IS a known gap: no
 * `$transaction` port exists in this codebase yet. Acceptable for the MVP,
 * revisit before this matters for real money/prizes riding on the streak.
 */
export function makeSubmitAttempt(
  deps: SubmitAttemptDeps,
): (input: SubmitAttemptInput) => Promise<Result<SubmitAttemptOutput>> {
  return async (input) => {
    const today = formatCalendarDate(deps.clock.now(), deps.clock.timeZone);

    const daily = await deps.dailyChallengeRepository.findByDate(today);
    if (!daily.ok) return err(daily.error);
    if (daily.value === null) return err(noDailyChallengeScheduled(today));

    const existingAttempt = await deps.attemptRepository.findByUserAndDate(input.userId, today);
    if (!existingAttempt.ok) return err(existingAttempt.error);
    if (existingAttempt.value !== null) return err(alreadyAttempted(today));

    const challenge = await deps.challengeRepository.findById(daily.value.challengeId);
    if (!challenge.ok) return err(challenge.error);
    if (challenge.value === null) {
      // Same "should be unreachable" data-integrity note as
      // `getTodayChallenge` — the FK on `daily_challenges` protects this.
      return err(repository('Scheduled daily challenge references a missing challenge'));
    }

    const validated = await deps.validationEngine.validate(challenge.value, input.answer);
    if (!validated.ok) return err(validated.error);

    const user = await deps.userRepository.findById(input.userId);
    if (!user.ok) return err(user.error);
    if (user.value === null) {
      // The caller already holds a valid session for this id — reaching here
      // means the account vanished between token issuance and this call.
      // That is an integrity problem, not a normal 404.
      return err(repository('Authenticated user record is missing'));
    }

    const difficulty = await deps.difficultyRepository.findById(challenge.value.difficultyId);
    if (!difficulty.ok) return err(difficulty.error);
    if (difficulty.value === null) {
      // Same data-integrity reasoning as the missing-challenge branch above —
      // the FK on `challenges.difficulty_id` makes this unreachable in
      // practice.
      return err(repository('Challenge references a missing difficulty'));
    }

    const submittedAt = deps.clock.now();
    const timeTakenSeconds = Math.max(
      0,
      Math.round((submittedAt.getTime() - daily.value.publishedAt.getTime()) / 1000),
    );

    const pointsEarned = calculatePoints({
      isCorrect: validated.value.isCorrect,
      difficultyLevel: difficulty.value.level,
      timeTakenSeconds,
    });

    const attempt = await deps.attemptRepository.create({
      id: deps.idGenerator.generate(),
      userId: input.userId,
      dailyChallengeDate: today,
      answer: input.answer,
      isCorrect: validated.value.isCorrect,
      submittedAt,
      timeTakenSeconds,
      points: pointsEarned,
    });
    if (!attempt.ok) return err(attempt.error);

    // THE local date, per the STUDENT's own timezone — deliberately NOT
    // `today` (the global UTC date used above to pick the challenge). See the
    // header note on `Streak` for why these two can legitimately differ.
    const localDate = formatCalendarDate(submittedAt, user.value.timezone);

    const previousStreak = await deps.streakRepository.findByUserId(input.userId);
    if (!previousStreak.ok) return err(previousStreak.error);

    const nextStreak = applyAttempt(previousStreak.value, input.userId, localDate, pointsEarned);

    const savedStreak = await deps.streakRepository.save(nextStreak);
    if (!savedStreak.ok) return err(savedStreak.error);

    return ok({
      attemptId: attempt.value.id,
      isCorrect: attempt.value.isCorrect,
      pointsEarned,
      currentStreak: savedStreak.value.currentStreak,
      longestStreak: savedStreak.value.longestStreak,
      totalPoints: savedStreak.value.totalPoints,
    });
  };
}
