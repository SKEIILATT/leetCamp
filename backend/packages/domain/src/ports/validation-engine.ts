import type { Challenge } from '../entities/challenge.js';
import type { Result } from '../result.js';

/**
 * Port for judging a submitted answer against a challenge.
 *
 * Declared as a swappable capability, not inlined into `submitAttempt`,
 * because of a decision already made in docs/DECISIONS.md: Fase 1 needs only
 * normalised string comparison (`prediction`), Fase 2 needs a real code
 * execution round-trip through Judge0 — and `submitAttempt`'s business logic
 * (one-per-day, streak update, time-taken) must not change one line when Fase
 * 2 lands. Both concerns satisfy this same interface, dispatched by
 * `createCompositeValidationEngine` on `challenge.type`.
 *
 * Returns `Result`, not a bare boolean: unlike the prediction adapter (pure,
 * cannot fail), the Judge0 adapter makes a network call and CAN fail — that
 * failure is `err(externalService(...))`, never silently `isCorrect: false`,
 * which would tell a student their correct code was wrong because a third
 * party timed out.
 */
export interface TestCaseResult {
  readonly passed: boolean;
  readonly hidden: boolean;
  /** Present only when `hidden` is `false` — a hidden test case's input and
   * output must never reach the student, so the adapter omits these fields
   * entirely for hidden cases rather than relying on a caller to strip them. */
  readonly input?: string;
  readonly expectedOutput?: string;
  readonly actualOutput?: string;
}

export interface ValidationOutcome {
  readonly isCorrect: boolean;
  /** Only populated by the Judge0 adapter (`type: 'code'` challenges) — the
   * prediction adapter never sets this. */
  readonly testResults?: readonly TestCaseResult[];
  readonly compileError?: string;
  readonly runtimeError?: string;
}

export interface ValidationEngine {
  validate(challenge: Challenge, answer: string): Promise<Result<ValidationOutcome>>;
}
