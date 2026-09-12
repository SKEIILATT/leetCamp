import type { Result } from '../result.js';
import type { Challenge, ChallengeStatus, NewChallenge } from './challenge.js';

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
}
