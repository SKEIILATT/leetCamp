import { err, externalService, type Result, type ValidationEngine, type ValidationOutcome } from '@leetcamp/domain';

/**
 * Dispatches to the right adapter by `challenge.type` — this is the ONLY
 * place that decision is made. `submitAttempt` receives this as its
 * `validationEngine` dependency and stays completely unaware that two
 * adapters exist, exactly as planned in docs/DECISIONS.md.
 */
export function createCompositeValidationEngine(engines: {
  readonly prediction: ValidationEngine;
  /** `null` when `JUDGE0_BASE_URL` is not configured — code execution is an
   * optional capability, not a hard requirement to boot the server. */
  readonly code: ValidationEngine | null;
}): ValidationEngine {
  return {
    async validate(challenge, answer): Promise<Result<ValidationOutcome>> {
      if (challenge.type === 'prediction') {
        return engines.prediction.validate(challenge, answer);
      }
      if (engines.code === null) {
        return err(externalService('Code execution is not enabled on this server'));
      }
      return engines.code.validate(challenge, answer);
    },
  };
}
