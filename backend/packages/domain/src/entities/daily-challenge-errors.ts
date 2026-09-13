import { conflict, notFound, validation } from '../errors.js';

export const dailyChallengeAlreadyScheduled = (date: string) =>
  conflict(`A daily challenge is already scheduled for ${date}`);

export const challengeNotPublished = (challengeId: string) =>
  validation(`Challenge ${challengeId} is not published yet`);

export const noDailyChallengeScheduled = (date: string) =>
  notFound(`No daily challenge is scheduled for ${date}`);
