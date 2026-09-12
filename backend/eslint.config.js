// @ts-check
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

/**
 * Flat config + eslint-plugin-boundaries v7.
 *
 * ONE configuration at the root, because boundaries has to classify imports
 * that cross package borders: it cannot do that from inside a single package.
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │ THREE THINGS ARE LOAD-BEARING AND FAIL IN COMPLETE SILENCE IF WRONG.      │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * 1. `settings['import/resolver'].typescript` — without it, boundaries cannot
 *    map a workspace name (`@leetcamp/domain`) to its source files, and imports
 *    between packages go unclassified. See also the `unrs-resolver` note in
 *    pnpm-workspace.yaml: the resolver depends on a native binary whose absence
 *    produces exactly this failure.
 *
 * 2. THE MEANING OF `pattern` IN THE ELEMENTS. In v7 the patterns are FOLDER
 *    PREFIXES, not globs. The v6 style `packages/domain/src/**\/*` matches
 *    NOTHING under v7: every file goes unclassified and every rule passes
 *    VACUOUSLY. A green lint that enforces nothing is worse than no lint,
 *    because it grants false confidence.
 *
 * 3. THE CWD. boundaries computes file paths relative to
 *    `boundaries/root-path` (default `process.cwd()`). Run the lint from inside
 *    a package and the paths stop starting with `packages/…`, reproducing
 *    failure 2. That is why `root-path` and the resolver's `project` entries are
 *    pinned ABSOLUTELY with `import.meta.dirname`, and why each package's `lint`
 *    script does `cd ../..` before invoking eslint.
 *
 * None of the three produces a visible error. `boundaries/no-unknown-files:
 * 'error'` is the permanent guard against 2 and 3 — it fails when a file cannot
 * be classified, instead of letting the rules go quiet. The other protection is
 * the NEGATIVE TEST in the `quality` job of .github/workflows/ci.yml, which
 * plants a forbidden import and fails if the lint does not reject it citing
 * `boundaries/dependencies`. Do not delete either.
 */
const repoRoot = import.meta.dirname;

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.config.js',
      '**/*.config.ts',
      '**/*.config.mjs',
      // Node-side scripts. They are tooling, not application code, and they are
      // outside the layered architecture by definition.
      'scripts/**',
      'apps/*/scripts/**',
      // ORM schema and migrations: SQL and DSL, not TypeScript.
      'apps/api/prisma/**',
      // GENERATED ORM client. Not written by anyone: `prisma generate` produces
      // it, it is git-ignored, and it is regenerated on every typecheck. Linting
      // it would mean asking a code generator to respect the conventions of a
      // project it knows nothing about, and `boundaries/no-unknown-files` would
      // turn every regeneration into a coin flip.
      'apps/api/src/generated/**',
      // GENERATED API types on the web side. Same reasoning.
      'apps/web/src/generated/**',
    ],
  },

  ...tseslint.configs.recommended,

  {
    // ⚠ apps/web IS INCLUDED. Excluding the frontend from the shared gate on day
    // one produces a frontend that is still excluded three years later, with
    // hundreds of accumulated warnings and no budget to fix them. It costs
    // nothing on an empty project.
    files: ['packages/**/*.ts', 'apps/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: {
          project: [`${repoRoot}/packages/*/tsconfig.json`, `${repoRoot}/apps/*/tsconfig.json`],
          // Separate projects on purpose (apps/web does not share the Node base);
          // the "use references" warning does not apply here.
          noWarnOnMultipleProjects: true,
        },
      },
      'boundaries/root-path': repoRoot,
      'boundaries/include': ['packages/**/*', 'apps/**/*'],

      // ELEMENTS ARE FOLDER PREFIXES, NOT GLOBS. See note 2 in the header.
      // SCAFFOLD: keep only the elements whose directories the preset creates.
      // An element pointing at a non-existent folder does not error — it just
      // classifies nothing, which is failure mode 2.
      'boundaries/elements': [
        { type: 'domain', pattern: 'packages/domain/src' },
        { type: 'application', pattern: 'packages/application/src' },
        { type: 'app', pattern: 'apps/api/src' },
        { type: 'web', pattern: 'apps/web/src' },
      ],
    },
    rules: {
      'boundaries/no-unknown': 'off',
      // Permanent guard over the classification itself: if an element pattern
      // stops matching, this errors instead of letting the rules go mute.
      'boundaries/no-unknown-files': 'error',

      /**
       * The dependency graph. `boundaries/dependencies` is the v7 rule that
       * replaces `element-types` and `external` at once, so a single list of
       * policies covers both workspace layers and npm packages.
       *
       *   domain       -> domain
       *   application  -> domain, application
       *   app          -> domain, application, app
       *   web          -> (nothing from the workspace)
       *
       * `default: 'disallow'` is what makes this real rather than decorative.
       * `checkAllOrigins: true` is required for the external-package policies to
       * be evaluated at all.
       */
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          checkAllOrigins: true,
          policies: [
            // External packages: allowed in general, except what is explicitly
            // forbidden below for the pure layers.
            {
              from: { element: { type: '*' } },
              allow: [{ to: { module: { origin: ['external', 'core', 'builtin'] } } }],
            },

            // THE HEXAGONAL CORE: no frameworks, no infrastructure. This is the
            // rule that keeps the domain portable and testable, and it is the
            // one worth defending in review.
            {
              from: { element: { type: ['domain', 'application'] } },
              disallow: [
                { to: { module: { source: 'fastify' } } },
                { to: { module: { source: '@fastify/*' } } },
                { to: { module: { source: 'fastify-plugin' } } },
                { to: { module: { source: 'fastify-type-provider-zod' } } },
                { to: { module: { source: '@prisma/client' } } },
                { to: { module: { source: '@prisma/*' } } },
                { to: { module: { source: 'prisma' } } },
                { to: { module: { source: 'pg' } } },
                // No concrete logger belongs in the core.
                { to: { module: { source: 'pino' } } },
                { to: { module: { source: 'pino-pretty' } } },
                // Input validation belongs at the boundary, not in the core. The
                // domain expresses invariants in types and in `Result`, not in a
                // schema library — otherwise the schema becomes the model.
                { to: { module: { source: 'zod' } } },
                { to: { module: { source: '@t3-oss/*' } } },
                // Not one line of UI inside the core.
                { to: { module: { source: 'react' } } },
                { to: { module: { source: 'react-dom' } } },
                // Date libraries: the core takes time from the `Clock` port.
                { to: { module: { source: 'date-fns' } } },
                { to: { module: { source: 'dayjs' } } },
                { to: { module: { source: 'luxon' } } },
              ],
              message:
                'domain/application must not depend on frameworks or infrastructure (hexagonal boundary).',
            },

            // The frontend must not import the workspace core either. Its
            // contract with the backend is the generated OpenAPI client, and
            // nothing else. One direct import is all it takes for the browser
            // bundle to start pulling in server code.
            {
              from: { element: { type: 'web' } },
              disallow: [{ to: { element: { type: ['domain', 'application', 'app'] } } }],
              message:
                'apps/web must not import from the workspace. Its contract is the generated OpenAPI client (src/generated/).',
            },

            // Workspace layer graph.
            {
              from: { element: { type: 'domain' } },
              allow: [{ to: { element: { type: 'domain' } } }],
            },
            {
              from: { element: { type: 'application' } },
              allow: [{ to: { element: { type: ['domain', 'application'] } } }],
            },
            {
              from: { element: { type: 'app' } },
              allow: [{ to: { element: { type: ['domain', 'application', 'app'] } } }],
            },
            {
              from: { element: { type: 'web' } },
              allow: [{ to: { element: { type: 'web' } } }],
            },
          ],
        },
      ],

      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'Import the client only from apps/api/src/infrastructure/persistence/prisma-client.ts, which re-exports what repositories need. One import path to change when the ORM moves.',
            },
            // Zod 4 ships v3 and v4 entry points side by side. Importing a
            // pinned one produces two Zod instances in the same process:
            // `instanceof` checks fail across them and schemas from one are
            // silently rejected by the other. Always the bare specifier.
            {
              name: 'zod/v3',
              message: "Import from 'zod'. A pinned entry point creates a second Zod instance.",
            },
            {
              name: 'zod/v4',
              message: "Import from 'zod'. A pinned entry point creates a second Zod instance.",
            },
          ],
        },
      ],
    },
  },

  // The one file allowed to import the generated ORM client. See the boundary
  // note at the top of that file.
  {
    files: ['apps/api/src/infrastructure/persistence/prisma-client.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // Test files: the dependency graph is relaxed, because in specs it is noise —
  // a test legitimately reaches for whatever it needs to build a fake. The
  // no-restricted-imports rules stay on: the two-Zod-instances problem is just
  // as real in a test, and harder to diagnose there.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    rules: {
      'boundaries/dependencies': 'off',
    },
  },
);
