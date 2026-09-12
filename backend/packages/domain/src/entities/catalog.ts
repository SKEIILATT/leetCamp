import type { Result } from '../result.js';

/**
 * Category and Difficulty — the taxonomy challenges are filed under
 * (`docs/DECISIONS.md`: "lógica general, SQL, JS, Python", by difficulty
 * level). Deliberately DATABASE-BACKED, not a fixed code catalogue like
 * `../roles.ts`: nothing in the code branches on which category or difficulty
 * a challenge has (unlike `Role`, which gates authorization decisions), and
 * the product spec asks for admins to manage them from the panel — a value
 * only a deploy could add is the wrong shape for that.
 */
export interface Category {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
}

export interface NewCategory {
  readonly name: string;
}

export interface Difficulty {
  readonly id: string;
  readonly name: string;
  /** Sort order, lower = easier. Not unique on purpose: two difficulties can
   * legitimately share a level while the product decides on naming. */
  readonly level: number;
  readonly createdAt: Date;
}

export interface NewDifficulty {
  readonly name: string;
  readonly level: number;
}

export interface CategoryRepository {
  findById(id: string): Promise<Result<Category | null>>;
  /** Case-insensitive; `createCategory` pre-checks this before writing, the
   * same pattern `registerUser` uses for email. */
  findByName(name: string): Promise<Result<Category | null>>;
  list(): Promise<Result<readonly Category[]>>;
  create(category: NewCategory & { id: string; createdAt: Date }): Promise<Result<Category>>;
}

export interface DifficultyRepository {
  findById(id: string): Promise<Result<Difficulty | null>>;
  findByName(name: string): Promise<Result<Difficulty | null>>;
  list(): Promise<Result<readonly Difficulty[]>>;
  create(difficulty: NewDifficulty & { id: string; createdAt: Date }): Promise<Result<Difficulty>>;
}
