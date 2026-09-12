/**
 * Version reported by `GET /health`.
 *
 * A constant and not a read of `package.json` on purpose: importing JSON in ESM
 * requires `resolveJsonModule` plus an import attribute, and `package.json`
 * falls OUTSIDE this workspace's `rootDir: "src"`. `tsc -p tsconfig.build.json`
 * would therefore emit `dist/` with a different folder layout and the import
 * would break in the build only — not in development, where tsx reads from
 * `src/`. A failure that appears only in production is not worth the saving.
 *
 * ⚠ KEEP IN SYNC with the `version` field of this workspace's package.json.
 */
export const API_VERSION = '0.0.0';
