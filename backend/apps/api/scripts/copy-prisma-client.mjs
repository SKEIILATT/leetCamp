/**
 * Copies the generated ORM client into `dist/` after `tsc`.
 *
 * ── WHY IT IS NEEDED ─────────────────────────────────────────────────────────
 * The client lives in `src/generated/prisma/` and is already-compiled
 * JavaScript (plus `.wasm` and `.d.ts`). `tsc` only emits what it compiles —
 * `.ts` files — so it copies nothing from that directory into `dist/`.
 *
 * Without this step `pnpm start` (which runs `dist/main.js`) dies with
 * `ERR_MODULE_NOT_FOUND` resolving `./generated/prisma/index.js`, AND IT FAILS
 * ONLY IN PRODUCTION: in development tsx reads straight from `src/` and never
 * notices. That asymmetry is why this script exists as a build step rather than
 * as a line in a runbook.
 *
 * `fs.cpSync` and not `cp -R` so the build does not depend on a shell — the
 * same command has to work in the Docker build stage and on Windows.
 */
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const from = join(apiRoot, 'src', 'generated');
const to = join(apiRoot, 'dist', 'generated');

if (!existsSync(from)) {
  console.error(`[copy-prisma-client] ${from} does not exist. Run \`pnpm db:generate\` first.`);
  process.exit(1);
}

cpSync(from, to, { recursive: true });
console.log(`[copy-prisma-client] ${from} -> ${to}`);
