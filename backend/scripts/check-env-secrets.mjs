/**
 * Step 3 of health.sh — no client-exposed variable holds a privileged
 * credential.
 *
 * ── THE BUG THIS EXISTS FOR ─────────────────────────────────────────────────
 * A key named `*_ANON_KEY` whose value was actually a service-role JWT — a
 * credential that bypasses row-level security by design — carrying a `VITE_`
 * prefix, and therefore baked into the public browser bundle. The NAME said
 * public, the CONTENT did not, and nothing in the repository ever looked inside
 * the value. This looks inside the value.
 *
 * ── TWO REDUNDANT LAYERS, ON PURPOSE ────────────────────────────────────────
 * The same rule lives in `apps/web/src/env.schema.ts`
 * (`describePrivilegedCredential`), where it guards the BUILD and the RUNTIME.
 * This script guards the REPOSITORY'S FILES, before anyone builds anything, and
 * it runs in a Bash step that cannot import TypeScript. Neither one subsumes the
 * other: a value can be committed without ever being built, and a value can be
 * built from CI without ever being committed.
 *
 * ⚠ IF YOU CHANGE THE RULE, CHANGE IT IN BOTH PLACES. They are meant to agree,
 * and `--self-test` is what proves this half still works.
 *
 * ── WHAT IS REJECTED AND WHAT IS NOT ────────────────────────────────────────
 * The asymmetry is intentional. The rule answers "is this PROVABLY a privileged
 * credential?", not "is this a valid key?".
 *
 *   REJECTED: a known secret-key prefix; a JWT whose `role` claim is not a
 *             public role.
 *   ACCEPTED: anything else, including obvious placeholders like
 *             `ci-placeholder-key`.
 *
 * Hardening it into the second question would break CI — which builds with
 * placeholders deliberately — without having caught one real secret. Only the
 * provider can say whether a key is legitimate; this can only say whether we are
 * publishing privileges.
 *
 * Usage:
 *   node scripts/check-env-secrets.mjs             scan every .env* in the repo
 *   node scripts/check-env-secrets.mjs --self-test verify the detector itself
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Prefixes that expose a variable to the client bundle. Add your framework's. */
const CLIENT_PREFIXES = ['VITE_', 'NEXT_PUBLIC_', 'PUBLIC_'];

/** Known secret-key formats. Extend for your provider. */
const SECRET_PREFIXES = ['sk_live_', 'sk_test_', 'sb_secret_', 'service_role_'];

/** JWT `role` claims that are legitimately public. */
const PUBLIC_ROLES = ['anon', 'public', 'anonymous'];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);

/**
 * Returns the reason a value is a privileged credential, or `null` if it passes.
 * Mirror of `describePrivilegedCredential` in apps/web/src/env.schema.ts.
 */
export function describePrivilegedCredential(value) {
  for (const prefix of SECRET_PREFIXES) {
    if (value.startsWith(prefix)) {
      return `starts with "${prefix}", which marks a SECRET key`;
    }
  }

  const parts = value.split('.');
  if (parts.length !== 3) return null; // not a JWT: nothing to inspect

  let role;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload !== 'object' || payload === null) return null;
    role = payload.role;
  } catch {
    return null; // unreadable: we cannot claim it is privileged
  }

  if (typeof role !== 'string' || PUBLIC_ROLES.includes(role)) return null;
  return `is a JWT carrying role="${role}", which is not a public role`;
}

function* walkEnvFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkEnvFiles(path.join(dir, entry.name));
      continue;
    }
    // `.env`, `.env.local`, `.env.example`, `.env.production`… The .example
    // files are scanned too, on purpose: a real secret pasted into an example
    // file is a real secret in the repository.
    if (entry.name === '.env' || entry.name.startsWith('.env.')) {
      yield path.join(dir, entry.name);
    }
  }
}

function parseEnvFile(contents) {
  const pairs = [];
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    // Strip one layer of matching quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    pairs.push([key, value]);
  }
  return pairs;
}

function selfTest() {
  // A JWT-shaped value whose payload declares a privileged role. Not a real
  // token: only the middle segment is ever decoded.
  const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  const privilegedJwt = `header.${payload}.signature`;
  const publicPayload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url');
  const publicJwt = `header.${publicPayload}.signature`;

  const cases = [
    ['privileged JWT is rejected', privilegedJwt, true],
    ['secret-prefixed key is rejected', 'sk_live_abc123', true],
    ['public JWT is accepted', publicJwt, false],
    ['placeholder is accepted', 'ci-placeholder-key', false],
    ['empty value is accepted', '', false],
  ];

  let failures = 0;
  for (const [label, value, shouldReject] of cases) {
    const rejected = describePrivilegedCredential(value) !== null;
    if (rejected !== shouldReject) {
      console.error(`    self-test FAILED: ${label}`);
      failures++;
    }
  }

  if (failures > 0) {
    // A safeguard that has forgotten how to fail gives confidence without
    // giving protection. Both directions are tested for exactly that reason.
    console.error('    The detector is broken. A green scan would mean nothing.');
    process.exit(1);
  }
  console.log(`    self-test OK (${cases.length} cases, both directions)`);
}

function scan() {
  const findings = [];
  let scanned = 0;

  for (const file of walkEnvFiles(ROOT)) {
    scanned++;
    const contents = fs.readFileSync(file, 'utf8');
    for (const [key, value] of parseEnvFile(contents)) {
      if (!CLIENT_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
      if (!value) continue;
      const reason = describePrivilegedCredential(value);
      if (reason) {
        findings.push({ file: path.relative(ROOT, file), key, reason });
      }
    }
  }

  if (findings.length > 0) {
    console.error('');
    for (const finding of findings) {
      console.error(`    ${finding.file}: ${finding.key} ${finding.reason}.`);
    }
    console.error('');
    console.error('    A client-prefixed variable is baked into the bundle the browser');
    console.error('    downloads. Publishing this hands the credential to anyone who opens');
    console.error('    devtools. Move the secret to the server env file and use the public key.');
    process.exit(1);
  }

  console.log(`    scanned ${scanned} .env* file(s), no privileged credential exposed`);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  scan();
}
