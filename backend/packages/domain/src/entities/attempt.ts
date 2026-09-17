import type { Result } from '../result.js';
import type { TestCaseResult } from '../ports/validation-engine.js';

/** Frozen at submission time, from `ValidationOutcome` — see the header note
 * on `Attempt.judgeDetails` below for why this is never re-derived on read. */
export interface JudgeDetails {
  readonly testResults?: readonly TestCaseResult[];
  readonly compileError?: string;
  readonly runtimeError?: string;
}

/**
 * A student's single submission against a specific day's global challenge.
 * `dailyChallengeDate` references `DailyChallenge.date` (its primary key —
 * there is no separate `dailyChallengeId`, see that entity's header comment),
 * not `Challenge.id` — the attempt is against a SCHEDULED DAY, which is what
 * the one-per-day constraint has to key on.
 */
export interface Attempt {
  readonly id: string;
  readonly userId: string;
  readonly dailyChallengeDate: string;
  /** Raw text the student sent — comparison/normalisation is the
   * `ValidationEngine`'s job (`../ports/validation-engine.ts`), not stored
   * here pre-normalised. */
  readonly answer: string;
  readonly isCorrect: boolean;
  readonly submittedAt: Date;
  /** `submittedAt` minus `DailyChallenge.publishedAt`, in seconds — the speed
   * bonus input per docs/DECISIONS.md. Computed once at submission time, not
   * derived on read, so it never changes under a later query. */
  readonly timeTakenSeconds: number;
  /** From `calculatePoints` in `./scoring.js`, computed ONCE at submission
   * time against the difficulty level and timing AS THEY WERE THAT DAY —
   * never recomputed on read. If it were, an admin editing a difficulty's
   * `level` later would silently rewrite everyone's past scores. */
  readonly points: number;
  /** Per-test-case breakdown for a `type: 'code'` challenge — `undefined` for
   * a prediction attempt. See `JudgeDetails`'s header note on why it is never
   * recomputed after submission. */
  readonly judgeDetails?: JudgeDetails;
}

export interface NewAttempt {
  readonly userId: string;
  readonly dailyChallengeDate: string;
  readonly answer: string;
  readonly isCorrect: boolean;
  readonly submittedAt: Date;
  readonly timeTakenSeconds: number;
  readonly points: number;
  readonly judgeDetails?: JudgeDetails;
}

export interface AttemptRepository {
  /** The one-per-user-per-day check `submitAttempt` pre-checks before
   * writing — the database's `@@unique([userId, dailyChallengeDate])` is the
   * backstop for the race, not the primary mechanism. */
  findByUserAndDate(userId: string, dailyChallengeDate: string): Promise<Result<Attempt | null>>;
  listByUser(userId: string): Promise<Result<readonly Attempt[]>>;
  create(attempt: NewAttempt & { id: string }): Promise<Result<Attempt>>;
}
