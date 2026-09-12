/**
 * Promotes an EXISTING user (registered normally through
 * `POST /api/v1/auth/register`) to admin.
 *
 * There is no "create an admin" endpoint on purpose — see the note on
 * `buildAuthUseCases` in @leetcamp/application: nothing reachable over HTTP
 * can mint an admin. Getting the first admin therefore has to be a local,
 * out-of-band operation, and this script is it.
 *
 * Usage (from apps/api/):
 *   node --env-file-if-exists=.env scripts/promote-to-admin.mjs someone@example.com
 *
 * Plain Node script (not TypeScript, not run through the workspace's
 * conditional exports) so it never depends on `@leetcamp/domain` having been
 * built first — see the note on `ROLE_ID_ADMIN` below.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/index.js';

// Hardcoded rather than imported from @leetcamp/domain's `ROLE_ID`: importing
// a workspace package from a plain .mjs script (no `--conditions=development`)
// resolves to its `dist/`, which means this script would silently need
// `pnpm build` to have run first. `roles.ts` is the source of truth — if that
// numbering ever changes, this constant has to change with it.
const ROLE_ID_ADMIN = 1;

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/promote-to-admin.mjs <email>');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — run with --env-file-if-exists=.env, or export it first.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

try {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  if (!user) {
    console.error(`No user with email "${email}". Register through the API first.`);
    process.exit(1);
  }

  if (user.roleId === ROLE_ID_ADMIN) {
    console.log(`"${email}" is already an admin.`);
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { roleId: ROLE_ID_ADMIN } });
    console.log(`"${email}" promoted to admin.`);
  }
} finally {
  await prisma.$disconnect();
}
