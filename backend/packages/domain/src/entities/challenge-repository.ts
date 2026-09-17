import type { Result } from '../result.js';
import type { Challenge, ChallengeStatus, NewChallenge } from './challenge.js';

/** Distributes over a union BEFORE omitting — plain `Omit<Union, K>` collapses
 * a discriminated union down to its common keys instead of keeping each
 * member's own shape, which is exactly wrong here (it would erase
 * `codeSnippet`/`starterCode` as "not on every member"). */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** Everything `NewChallenge` carries EXCEPT `createdBy` — an edit never
 * changes who authored a challenge. Same discriminated-by-`type` shape,
 * otherwise. */
export type DraftChallengeEdit = DistributiveOmit<NewChallenge, 'createdBy'>;

export interface ChallengeRepository {
  findById(id: string): Promise<Result<Challenge | null>>;

  list(filter?: { readonly status?: ChallengeStatus }): Promise<Result<readonly Challenge[]>>;

  create(challenge: NewChallenge & { id: string; createdAt: Date; updatedAt: Date }): Promise<Result<Challenge>>;

  /**
   * Raw status write — no business rule here. `publishChallenge` (the use
   * case) is what checks the challenge is still `draft` before calling this;
   * the repository does not re-derive that decision, it only persists it.
   */
  updateStatus(id: string, status: ChallengeStatus, updatedAt: Date): Promise<Result<Challenge>>;

  /**
   * Replaces a draft's editable fields wholesale (including, for a `'code'`
   * challenge, its entire `testCases` list) — `updateDraftChallenge` (the use
   * case) is what checks `status === 'draft'` and that `type` did not change
   * before calling this; the repository does not re-derive either decision.
   */
  updateDraft(id: string, edit: DraftChallengeEdit, updatedAt: Date): Promise<Result<Challenge>>;
}
