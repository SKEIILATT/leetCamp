import { describe, expect, it } from 'vitest';
import { err, ok, repository, type Category, type CategoryRepository, type Clock } from '@leetcamp/domain';

import { makeCreateCategory } from './create-category.js';

const fixedClock: Clock = { now: () => new Date('2026-03-15T08:00:00Z'), timeZone: 'UTC' };

const existing: Category = { id: 'cat-1', name: 'SQL', createdAt: new Date('2026-01-01T00:00:00Z') };

function fakeRepository(overrides: Partial<CategoryRepository> = {}): CategoryRepository {
  return {
    findById: async () => ok(null),
    findByName: async () => ok(null),
    list: async () => ok([]),
    create: async (category) => ok({ ...category }),
    ...overrides,
  };
}

describe('createCategory', () => {
  it('creates a category and returns its id', async () => {
    let idPassedToCreate: string | undefined;
    const createCategory = makeCreateCategory({
      categoryRepository: fakeRepository({
        create: async (category) => {
          idPassedToCreate = category.id;
          return ok({ ...category });
        },
      }),
      idGenerator: { generate: () => 'new-id' },
      clock: fixedClock,
    });

    const result = await createCategory({ name: 'JavaScript' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.categoryId).toBe('new-id');
    expect(idPassedToCreate).toBe('new-id');
  });

  it('rejects a duplicate name with CONFLICT, without writing', async () => {
    let createCalled = false;
    const createCategory = makeCreateCategory({
      categoryRepository: fakeRepository({
        findByName: async () => ok(existing),
        create: async () => {
          createCalled = true;
          return ok(existing);
        },
      }),
      idGenerator: { generate: () => 'new-id' },
      clock: fixedClock,
    });

    const result = await createCategory({ name: 'SQL' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('CONFLICT');
    expect(createCalled).toBe(false);
  });

  it('propagates a repository failure from the name lookup', async () => {
    const createCategory = makeCreateCategory({
      categoryRepository: fakeRepository({
        findByName: async () => err(repository('connection refused')),
      }),
      idGenerator: { generate: () => 'new-id' },
      clock: fixedClock,
    });

    const result = await createCategory({ name: 'JavaScript' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('REPOSITORY');
  });
});
