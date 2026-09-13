import type { Result, Streak, StreakRepository } from '@leetcamp/domain';

/** `null` means no attempt has ever been recorded — day one, not a failure. */
export function makeGetMyStreak(deps: {
  readonly streakRepository: StreakRepository;
}): (input: { readonly userId: string }) => Promise<Result<Streak | null>> {
  return (input) => deps.streakRepository.findByUserId(input.userId);
}
