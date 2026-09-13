/**
 * THE points rule for a single attempt (docs/DECISIONS.md: ranking by
 * accumulated points, "base por dificultad + bonus por rapidez").
 *
 * A WRONG answer earns 0 — the racha (`streak.ts`) already rewards showing up
 * whether you got it right or not; points are the separate signal for "got it
 * right, and how fast", which is what the ranking sorts by.
 *
 * `basePoints = difficultyLevel * 10` scales with `Difficulty.level` — a
 * number the admin assigns, not a fixed set of named tiers — so a difficulty
 * the admin adds later earns proportionally more without a code change.
 *
 * Speed bonus is TIERED, not a continuous decay curve: `+10` inside 5
 * minutes, `+5` inside 30, `+0` after. A tiered bonus is something a student
 * can state back ("answer fast and you get more") — a curve that also depends
 * on exactly how many seconds elapsed is not, and the daily challenge's
 * publish-to-solve window can span many hours in practice (whoever is asleep
 * when it goes live), so precision below "roughly how fast" buys nothing.
 *
 * Pure and synchronous, same reasoning as `applyAttempt` in `./streak.js`:
 * the whole rule is three numbers and no fakes.
 */
export interface CalculatePointsInput {
  readonly isCorrect: boolean;
  readonly difficultyLevel: number;
  readonly timeTakenSeconds: number;
}

const FAST_BONUS_SECONDS = 5 * 60;
const FAST_BONUS_POINTS = 10;
const MODERATE_BONUS_SECONDS = 30 * 60;
const MODERATE_BONUS_POINTS = 5;
const POINTS_PER_DIFFICULTY_LEVEL = 10;

export function calculatePoints(input: CalculatePointsInput): number {
  if (!input.isCorrect) return 0;

  const basePoints = input.difficultyLevel * POINTS_PER_DIFFICULTY_LEVEL;

  const speedBonus =
    input.timeTakenSeconds <= FAST_BONUS_SECONDS
      ? FAST_BONUS_POINTS
      : input.timeTakenSeconds <= MODERATE_BONUS_SECONDS
        ? MODERATE_BONUS_POINTS
        : 0;

  return basePoints + speedBonus;
}
