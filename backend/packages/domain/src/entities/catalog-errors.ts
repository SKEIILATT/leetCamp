import { conflict, notFound } from '../errors.js';

export const duplicateCategoryName = (name: string) =>
  conflict(`A category named "${name}" already exists`);

export const duplicateDifficultyName = (name: string) =>
  conflict(`A difficulty named "${name}" already exists`);

export const categoryNotFound = (id: string) => notFound(`Category ${id} not found`);

export const difficultyNotFound = (id: string) => notFound(`Difficulty ${id} not found`);
