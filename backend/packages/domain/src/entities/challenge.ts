/**
 * A challenge in the question bank. Fase 1 (see `docs/DECISIONS.md`) only has
 * ONE type — prediction/analysis — so its fields are flattened directly onto
 * this entity instead of split into a separate `PredictionChallenge` value
 * object the way the product spec eventually imagines it. Splitting now, for a
 * `type` that can only ever be `'prediction'`, is exactly the kind of
 * speculative shape this project's own conventions warn against — when Fase 2
 * (`type: 'code'`) actually lands, THAT is when this becomes a union.
 *
 * The database is still normalised into `challenges` + `prediction_challenges`
 * (see `schema.prisma`) — the flattening happens at the repository boundary,
 * not in storage, so the eventual split costs a domain change and a data
 * migration, not a schema rewrite.
 */
export type ChallengeStatus = 'draft' | 'published';

export interface Challenge {
  readonly id: string;
  readonly categoryId: string;
  readonly difficultyId: string;
  readonly type: 'prediction';
  readonly title: string;
  readonly promptMarkdown: string;
  /** The snippet shown to the student to predict/analyse. */
  readonly codeSnippet: string;
  /** Compared against the student's answer at validation time — normalising
   * that comparison (trim, case, floats) is the validation layer's job, not
   * stored here. See docs/DECISIONS.md. */
  readonly expectedAnswer: string;
  readonly status: ChallengeStatus;
  /** The admin who created it — NEVER settable by the client, always
   * `request.identity.userId`. */
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Fields `createChallenge` needs. Always created as `draft` — publishing is
 * a separate, deliberate action (`publishChallenge`), never a side effect of
 * creation. */
export interface NewChallenge {
  readonly categoryId: string;
  readonly difficultyId: string;
  readonly title: string;
  readonly promptMarkdown: string;
  readonly codeSnippet: string;
  readonly expectedAnswer: string;
  readonly createdBy: string;
}
