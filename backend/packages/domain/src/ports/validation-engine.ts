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
 * 2 lands. Both concerns satisfy this same interface.
 *
 * Returns `Result`, not a bare boolean: unlike the prediction adapter (pure,
 * cannot fail), a future Judge0 adapter makes a network call and CAN fail —
 * that failure is `err(externalService(...))`, never silently `isCorrect:
 * false`, which would tell a student their correct code was wrong because a
 * third party timed out.
 */
export interface ValidationOutcome {
  readonly isCorrect: boolean;
}

export interface ValidationEngine {
  validate(challenge: Challenge, answer: string): Promise<Result<ValidationOutcome>>;
}
