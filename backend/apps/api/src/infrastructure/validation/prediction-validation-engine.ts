import { ok, type Challenge, type Result, type ValidationEngine, type ValidationOutcome } from '@leetcamp/domain';

/**
 * Fase 1 adapter: normalised string comparison — no network call, cannot
 * fail. The Judge0 adapter for Fase 2 (`type: 'code'`) satisfies the same
 * port and is the only thing that changes; `submitAttempt` does not.
 *
 * Normalisation is intentionally shallow (trim, case-fold, collapse internal
 * whitespace) — docs/DECISIONS.md flags per-test-case normalisation (floats,
 * list order) as a Fase 2 concern, which only makes sense once there IS a
 * per-test-case shape to normalise against.
 */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function createPredictionValidationEngine(): ValidationEngine {
  return {
    async validate(challenge: Challenge, answer: string): Promise<Result<ValidationOutcome>> {
      // Unreachable through `createCompositeValidationEngine`, which only
      // ever routes `type: 'prediction'` here — guarded anyway, same
      // reasoning as the equivalent check in `judge0-validation-engine.ts`.
      if (challenge.type !== 'prediction') {
        return ok({ isCorrect: false });
      }
      return ok({ isCorrect: normalize(answer) === normalize(challenge.expectedAnswer) });
    },
  };
}
