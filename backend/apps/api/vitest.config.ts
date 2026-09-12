import { defineConfig } from 'vitest/config';

/**
 * Vitest for the API workspace.
 *
 * One runner per workspace rather than one at the root: each package declares
 * its own `test` script, `pnpm -r test` fans out, and `health.sh` step 2 makes
 * a missing script a visible failure instead of a silent skip.
 *
 * `--conditions=development` is NOT needed here: Vite applies the `development`
 * export condition by default in dev/test, so the workspace packages resolve
 * straight to their TypeScript sources and the specs run without a prior build.
 *
 * `*.integration.test.ts` is excluded on purpose. Integration specs touch a real
 * database, so they cannot be part of a gate that must stay hermetic — the
 * `tests` step of `health.sh` is blocking, and a blocking step is only
 * acceptable while it has no prerequisite a developer might not have installed.
 * Run them with their own config when you add them.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
  },
});
