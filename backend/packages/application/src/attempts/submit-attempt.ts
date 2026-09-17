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
  type AttemptTransactionRunner,
  type ChallengeRepository,
  type Clock,
  type DailyChallengeRepository,
  type DifficultyRepository,
  type IdGenerator,
  type Result,
  type TestCaseResult,
  type UserRepository,
  type ValidationEngine,
} from '@leetcamp/domain';

export interface SubmitAttemptDeps {
  /** Read-only here: the friendly pre-check below, not the atomic write —
   * see the note on `attemptTransactionRunner`. */
  readonly attemptRepository: AttemptRepository;
  /** Runs the "create the attempt, then update the streak" pair atomically —
   * see the port's own doc comment for why this exists as a separate
   * dependency instead of two plain repositories. */
  readonly attemptTransactionRunner: AttemptTransactionRunner;
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
  /** Only present for a `type: 'code'` challenge — see `ValidationOutcome`. */
  readonly testResults?: readonly TestCaseResult[];
  readonly compileError?: string;
  readonly runtimeError?: string;
}

/**
 * Orchestrates the whole "student answers today's challenge" flow: resolve
 * today's challenge → enforce one attempt per day → judge the answer → record
 * it → update the streak. See docs/DECISIONS.md for the product rules this
 * encodes (one attempt, blocked after submit; streak counts participation,
 * not correctness; no grace period).
 *
 * The attempt write and the streak write happen inside ONE database
 * transaction (`attemptTransactionRunner`, see docs/DECISIONS.md) — either
 * both land or neither does. This closed a gap that stood since the vertical
 * was first built: previously, a failure between the two writes could not
 * lose the attempt (re-derivable from history) but could leave the streak
 * stale.
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

    // `undefined` for a prediction attempt (none of these three fields is
    // ever set by that adapter) — built once here so both the persisted
    // `Attempt` and the returned output agree on exactly the same value.
    const judgeDetails =
      validated.value.testResults !== undefined ||
      validated.value.compileError !== undefined ||
      validated.value.runtimeError !== undefined
        ? {
            ...(validated.value.testResults !== undefined ? { testResults: validated.value.testResults } : {}),
            ...(validated.value.compileError !== undefined ? { compileError: validated.value.compileError } : {}),
            ...(validated.value.runtimeError !== undefined ? { runtimeError: validated.value.runtimeError } : {}),
          }
        : undefined;

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

    // THE local date, per the STUDENT's own timezone — deliberately NOT
    // `today` (the global UTC date used above to pick the challenge). See the
    // header note on `Streak` for why these two can legitimately differ.
    const localDate = formatCalendarDate(submittedAt, user.value.timezone);

    // Both writes happen inside ONE transaction: either the attempt is
    // recorded and the streak reflects it, or neither write lands. See
    // `AttemptTransactionRunner`'s doc comment for why this exists as a
    // separate port instead of two plain repository calls.
    const txResult = await deps.attemptTransactionRunner.run(async (repos) => {
      const attempt = await repos.attemptRepository.create({
        id: deps.idGenerator.generate(),
        userId: input.userId,
        dailyChallengeDate: today,
        answer: input.answer,
        isCorrect: validated.value.isCorrect,
        submittedAt,
        timeTakenSeconds,
        points: pointsEarned,
        ...(judgeDetails !== undefined ? { judgeDetails } : {}),
      });
      if (!attempt.ok) return err(attempt.error);

      const previousStreak = await repos.streakRepository.findByUserId(input.userId);
      if (!previousStreak.ok) return err(previousStreak.error);

      const nextStreak = applyAttempt(previousStreak.value, input.userId, localDate, pointsEarned);

      const savedStreak = await repos.streakRepository.save(nextStreak);
      if (!savedStreak.ok) return err(savedStreak.error);

      return ok({ attempt: attempt.value, streak: savedStreak.value });
    });
    if (!txResult.ok) return err(txResult.error);

    return ok({
      attemptId: txResult.value.attempt.id,
      isCorrect: txResult.value.attempt.isCorrect,
      pointsEarned,
      currentStreak: txResult.value.streak.currentStreak,
      longestStreak: txResult.value.streak.longestStreak,
      totalPoints: txResult.value.streak.totalPoints,
      ...(validated.value.testResults !== undefined ? { testResults: validated.value.testResults } : {}),
      ...(validated.value.compileError !== undefined ? { compileError: validated.value.compileError } : {}),
      ...(validated.value.runtimeError !== undefined ? { runtimeError: validated.value.runtimeError } : {}),
    });
  };
}
