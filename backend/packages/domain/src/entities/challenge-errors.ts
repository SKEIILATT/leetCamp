import { conflict, notFound, validation } from '../errors.js';

export const challengeNotFound = (id: string) => notFound(`Challenge ${id} not found`);

export const challengeAlreadyPublished = (id: string) =>
  conflict(`Challenge ${id} is already published`);

export const invalidCategoryReference = (categoryId: string) =>
  validation(`Category ${categoryId} does not exist`);

export const invalidDifficultyReference = (difficultyId: string) =>
  validation(`Difficulty ${difficultyId} does not exist`);
