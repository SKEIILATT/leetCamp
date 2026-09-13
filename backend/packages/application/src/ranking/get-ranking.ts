import { err, ok, type RankingEntry, type Result, type StreakRepository } from '@leetcamp/domain';

/**
 * One entry of the leaderboard, with its 1-based position. Position is
 * computed HERE, from list order — never stored — see the note on
 * `StreakRepository.listRanked`.
 */
export interface RankedEntry extends RankingEntry {
  readonly position: number;
}

export function makeGetRanking(deps: {
  readonly streakRepository: StreakRepository;
}): () => Promise<Result<readonly RankedEntry[]>> {
  return async () => {
    const entries = await deps.streakRepository.listRanked();
    if (!entries.ok) return err(entries.error);

    return ok(entries.value.map((entry, index) => ({ ...entry, position: index + 1 })));
  };
}
