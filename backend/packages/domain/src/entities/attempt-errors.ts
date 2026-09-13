import { conflict } from '../errors.js';

export const alreadyAttempted = (dailyChallengeDate: string) =>
  conflict(`Already submitted an attempt for ${dailyChallengeDate}`);
