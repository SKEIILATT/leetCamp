/**
 * A challenge in the question bank. Fase 1 (see `docs/DECISIONS.md`) only had
 * ONE type — prediction/analysis — so its fields lived flattened directly on
 * this entity. Fase 2 adds a real second type (`'code'`, judged via Judge0),
 * which is exactly the trigger the original header comment named for turning
 * this into a real discriminated union instead of a single flat shape.
 *
 * The database mirrors this: `challenges` keeps only the fields both types
 * share plus the prediction-only ones (now nullable), and a new `code_challenges`
 * table (1:1 via `challengeId`) plus `test_cases` (child of that) carry the
 * code-only data. See `schema.prisma` and the `toDomain` mapping in
 * `prisma-challenge-repository.ts` for where that split is bridged.
 */
export type ChallengeStatus = 'draft' | 'published';

/** Languages Judge0 is configured to judge — see `LANGUAGE_ID` in
 * `judge0-validation-engine.ts` for the mapping to Judge0's own numeric ids.
 * Kept as a closed set (not a free string) so an admin cannot create a code
 * challenge in a language nothing can actually judge. */
export type CodeLanguage = 'javascript' | 'python' | 'sql';

export interface ChallengeBase {
  readonly id: string;
  readonly categoryId: string;
  readonly difficultyId: string;
  readonly title: string;
  readonly promptMarkdown: string;
  readonly status: ChallengeStatus;
  /** The admin who created it — NEVER settable by the client, always
   * `request.identity.userId`. */
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PredictionChallenge extends ChallengeBase {
  readonly type: 'prediction';
  /** The snippet shown to the student to predict/analyse. */
  readonly codeSnippet: string;
  /** Compared against the student's answer at validation time — normalising
   * that comparison (trim, case, floats) is the validation layer's job, not
   * stored here. See docs/DECISIONS.md. */
  readonly expectedAnswer: string;
}

/** A single input/expected-output pair Judge0 judges the student's submitted
 * source code against. `isHidden` test cases are used for judging but their
 * `input`/`expectedOutput` must never reach the student — enforced at the
 * `PublicChallenge`/route-schema boundary, not here (this is the admin/full
 * shape). */
export interface TestCase {
  readonly id: string;
  readonly input: string;
  readonly expectedOutput: string;
  readonly isHidden: boolean;
}

export interface CodeChallenge extends ChallengeBase {
  readonly type: 'code';
  readonly starterCode: string;
  readonly language: CodeLanguage;
  /** At least one, enforced by `createChallenge` — a code challenge with zero
   * test cases can never be judged. */
  readonly testCases: readonly TestCase[];
}

export type Challenge = PredictionChallenge | CodeChallenge;

/** Fields `createChallenge` needs for a prediction challenge. Always created
 * as `draft` — publishing is a separate, deliberate action
 * (`publishChallenge`), never a side effect of creation. */
export interface NewPredictionChallenge {
  readonly type: 'prediction';
  readonly categoryId: string;
  readonly difficultyId: string;
  readonly title: string;
  readonly promptMarkdown: string;
  readonly codeSnippet: string;
  readonly expectedAnswer: string;
  readonly createdBy: string;
}

export interface NewTestCase {
  readonly input: string;
  readonly expectedOutput: string;
  readonly isHidden: boolean;
}

export interface NewCodeChallenge {
  readonly type: 'code';
  readonly categoryId: string;
  readonly difficultyId: string;
  readonly title: string;
  readonly promptMarkdown: string;
  readonly starterCode: string;
  readonly language: CodeLanguage;
  readonly testCases: readonly NewTestCase[];
  readonly createdBy: string;
}

export type NewChallenge = NewPredictionChallenge | NewCodeChallenge;
