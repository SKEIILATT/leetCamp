/**
 * Step 2 of health.sh — script coverage per workspace.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `pnpm -r <script>` SKIPS IN COMPLETE SILENCE any workspace that does not
 * declare the script. Add a new package without a `typecheck` and it sits
 * outside the quality gate forever, while `pnpm -r typecheck` keeps printing
 * green. Nothing in the output hints that a workspace was passed over.
 *
 * This script makes that silence a visible failure, and prints a table so the
 * true scope of every subsequent step is readable on each run.
 *
 * ── EXEMPTIONS ARE EXPLICIT AND CARRY A REASON ──────────────────────────────
 * If a workspace legitimately has no tests yet, it is listed in EXEMPT with the
 * reason written out. It then appears in the table as `test:exempt` instead of
 * disappearing. The point is that "we do not check X" stays READABLE rather than
 * becoming invisible — an undocumented gap is indistinguishable from an
 * oversight six months later.
 *
 * The exemption is evaluated BEFORE checking whether the script exists, so a
 * placeholder script cannot make the table claim something is verified when it
 * is not.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const REQUIRED = ['typecheck', 'build', 'test', 'lint'];

/**
 * Workspaces exempt from a specific script, with the reason.
 *
 * Keep this EMPTY for as long as possible. Every entry is a hole in the gate,
 * and the reason string is what a reviewer reads before deciding whether it is
 * still acceptable.
 *
 * Shape:
 *   '@scope/package': { test: 'why there are no unit tests, and what covers it instead' }
 */
const EXEMPT = {};

function collectManifests() {
  const manifests = [];
  for (const group of ['apps', 'packages']) {
    const base = path.join(ROOT, group);
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      const manifest = path.join(base, entry, 'package.json');
      if (fs.existsSync(manifest)) manifests.push(manifest);
    }
  }
  return manifests;
}

let missing = 0;
const rows = [];

for (const manifestPath of collectManifests()) {
  const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const scripts = pkg.scripts ?? {};
  const cells = [];

  for (const required of REQUIRED) {
    const reason = EXEMPT[pkg.name]?.[required];
    if (reason) {
      cells.push(`${required}:exempt`);
      continue;
    }
    if (scripts[required]) {
      cells.push(`${required}:yes`);
      continue;
    }
    cells.push(`${required}:MISSING`);
    missing++;
  }

  rows.push(`    ${(pkg.name ?? manifestPath).padEnd(24)}${cells.join('  ')}`);
}

if (rows.length === 0) {
  console.log('    (no workspaces found under apps/ or packages/)');
}
console.log(rows.join('\n'));

// Print every exemption with its reason. An exemption nobody reads is an
// exemption nobody revisits.
const exemptions = Object.entries(EXEMPT).flatMap(([name, byScript]) =>
  Object.entries(byScript).map(([script, reason]) => `    ${name} · ${script}: ${reason}`),
);
if (exemptions.length > 0) {
  console.log('\n    Registered exemptions:');
  console.log(exemptions.join('\n'));
}

if (missing > 0) {
  console.log('');
  console.log(`    ${missing} missing script(s). pnpm -r would skip them in silence:`);
  console.log('    either declare them, or add them to EXEMPT in this file with a reason.');
  process.exit(1);
}
