import type {
  CategoryRepository,
  ChallengeRepository,
  Clock,
  DifficultyRepository,
  IdGenerator,
} from '@leetcamp/domain';

import { makeCreateCategory } from './create-category.js';
import { makeCreateChallenge } from './create-challenge.js';
import { makeCreateDifficulty } from './create-difficulty.js';
import { makeListCategories } from './list-categories.js';
import { makeListChallenges } from './list-challenges.js';
import { makeListDifficulties } from './list-difficulties.js';
import { makePublishChallenge } from './publish-challenge.js';
import { makeUpdateDraftChallenge } from './update-draft-challenge.js';

/**
 * The BUNDLE of the `challenges` vertical.
 *
 * ⚠ THE BUNDLE'S SURFACE IS A SECURITY DECISION. Every use case here is
 * mutating admin capability (create a category, create a challenge, publish
 * it) or reads the FULL challenge bank including drafts — none of it belongs
 * behind a route a student can reach. The routes that wire this bundle
 * (`apps/api/src/interfaces/http/routes/admin-challenges.route.ts`) are what
 * actually enforces that, via `app.requireRole(ROLE_ID.ADMIN)` — this bundle
 * itself has no notion of who is calling it.
 */
export interface ChallengesDeps {
  readonly challengeRepository: ChallengeRepository;
  readonly categoryRepository: CategoryRepository;
  readonly difficultyRepository: DifficultyRepository;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** `false` when `JUDGE0_BASE_URL` is not configured — see
   * `publishChallenge`'s guard. */
  readonly codeExecutionEnabled: boolean;
}

export function buildChallengesUseCases(deps: ChallengesDeps) {
  return {
    createCategory: makeCreateCategory(deps),
    createDifficulty: makeCreateDifficulty(deps),
    listCategories: makeListCategories(deps),
    listDifficulties: makeListDifficulties(deps),
    createChallenge: makeCreateChallenge(deps),
    publishChallenge: makePublishChallenge(deps),
    updateDraftChallenge: makeUpdateDraftChallenge(deps),
    listChallenges: makeListChallenges(deps),
  };
}

export type ChallengesUseCases = ReturnType<typeof buildChallengesUseCases>;
