import type { Result } from '../result.js';

/**
 * The single global daily challenge (see `docs/DECISIONS.md` — leetCamp has
 * ONE reto diario for the whole bootcamp, not one per student). Scheduling it
 * is a manual admin action for the MVP: the admin already curates the
 * question bank by hand, and automating "pick the next unused published
 * challenge" is speculative machinery this project does not need yet.
 *
 * `date` is a PURE CALENDAR DATE ('YYYY-MM-DD'), not an instant — it has no
 * time-of-day and no time zone of its own. See the adapter
 * (`apps/api/src/infrastructure/persistence/prisma-daily-challenge-repository.ts`)
 * for how that stays true through a column that Postgres/Prisma still
 * represents as a `Date` object.
 */
export interface DailyChallenge {
  readonly date: string;
  readonly challengeId: string;
  /** When this was scheduled — the reference instant `Attempt.timeTakenSeconds`
   * (not built yet) will measure against, per docs/DECISIONS.md. */
  readonly publishedAt: Date;
}

export interface NewDailyChallenge {
  readonly date: string;
  readonly challengeId: string;
}

export interface DailyChallengeRepository {
  findByDate(date: string): Promise<Result<DailyChallenge | null>>;
  list(): Promise<Result<readonly DailyChallenge[]>>;
  create(entry: NewDailyChallenge & { publishedAt: Date }): Promise<Result<DailyChallenge>>;
}
