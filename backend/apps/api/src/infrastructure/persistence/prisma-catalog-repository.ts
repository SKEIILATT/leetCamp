import {
  err,
  ok,
  repository,
  type Category,
  type CategoryRepository,
  type Difficulty,
  type DifficultyRepository,
  type NewCategory,
  type NewDifficulty,
  type Result,
} from '@leetcamp/domain';

import type { PrismaClient } from './prisma-client.js';

type Logger = { error: (obj: unknown, msg: string) => void };

export function createPrismaCategoryRepository(
  prisma: PrismaClient,
  logger?: Logger,
): CategoryRepository {
  return {
    async findById(id: string): Promise<Result<Category | null>> {
      try {
        const row = await prisma.category.findUnique({ where: { id } });
        return ok(row);
      } catch (error) {
        logger?.error({ err: error }, 'failed to read the category by id');
        return err(repository('Could not read the category'));
      }
    },

    async findByName(name: string): Promise<Result<Category | null>> {
      try {
        // Case-insensitive: "SQL" and "sql" are the same category to an admin
        // picking from a dropdown, and a case-only duplicate helps nobody.
        const row = await prisma.category.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
        });
        return ok(row);
      } catch (error) {
        logger?.error({ err: error }, 'failed to read the category by name');
        return err(repository('Could not read the category'));
      }
    },

    async list(): Promise<Result<readonly Category[]>> {
      try {
        const rows = await prisma.category.findMany({ orderBy: { name: 'asc' } });
        return ok(rows);
      } catch (error) {
        logger?.error({ err: error }, 'failed to list categories');
        return err(repository('Could not list categories'));
      }
    },

    async create(category: NewCategory & { id: string; createdAt: Date }): Promise<Result<Category>> {
      try {
        const row = await prisma.category.create({ data: category });
        return ok(row);
      } catch (error) {
        logger?.error({ err: error }, 'failed to create the category');
        return err(repository('Could not create the category'));
      }
    },
  };
}

export function createPrismaDifficultyRepository(
  prisma: PrismaClient,
  logger?: Logger,
): DifficultyRepository {
  return {
    async findById(id: string): Promise<Result<Difficulty | null>> {
      try {
        const row = await prisma.difficulty.findUnique({ where: { id } });
        return ok(row);
      } catch (error) {
        logger?.error({ err: error }, 'failed to read the difficulty by id');
        return err(repository('Could not read the difficulty'));
      }
    },

    async findByName(name: string): Promise<Result<Difficulty | null>> {
      try {
        const row = await prisma.difficulty.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
        });
        return ok(row);
      } catch (error) {
        logger?.error({ err: error }, 'failed to read the difficulty by name');
        return err(repository('Could not read the difficulty'));
      }
    },

    async list(): Promise<Result<readonly Difficulty[]>> {
      try {
        const rows = await prisma.difficulty.findMany({ orderBy: { level: 'asc' } });
        return ok(rows);
      } catch (error) {
        logger?.error({ err: error }, 'failed to list difficulties');
        return err(repository('Could not list difficulties'));
      }
    },

    async create(
      difficulty: NewDifficulty & { id: string; createdAt: Date },
    ): Promise<Result<Difficulty>> {
      try {
        const row = await prisma.difficulty.create({ data: difficulty });
        return ok(row);
      } catch (error) {
        logger?.error({ err: error }, 'failed to create the difficulty');
        return err(repository('Could not create the difficulty'));
      }
    },
  };
}
