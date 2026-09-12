#!/bin/sh
#
# Container entrypoint for the API.
#
# ── WHY `exec` ON THE LAST LINE ─────────────────────────────────────────────
# It hands PID 1 over to node. Without it the shell stays PID 1, SWALLOWS
# SIGTERM, and the orchestrator ends up killing the process with SIGKILL after
# its grace period — which is exactly what the graceful shutdown in
# `src/main.ts` (app.close() -> stop scheduler -> abort in-flight -> disconnect
# the pool) exists to avoid.
#
# The symptom of getting this wrong is not an error. It is connections dangling
# against the pooler after every deploy, and a ten-second pause on every
# restart. Do not replace `exec node ...` with `node ...`.
set -eu

# ── MIGRATIONS: OPT-IN, AND OFF BY DEFAULT ──────────────────────────────────
# Running `migrate deploy` on every container start is convenient and it is how
# a rolling deploy applies the same migration N times concurrently. It is
# acceptable for a single-instance deployment and NOT acceptable once there is
# more than one replica.
#
# `migrate deploy` is the safe command — it applies pending migrations and never
# generates, resets or drops. `migrate dev` MUST NEVER run here: it can reset
# the database.
#
# ⚠ The ORM CLI is a devDependency and the `prod-deps` stage prunes it, so this
# only works if you add `prisma` to the production dependencies. If you do not
# want that weight in the image, leave RUN_MIGRATIONS unset and migrate from CI
# or from a maintenance task against DIRECT_URL. See docs/deployment.md.
case "${RUN_MIGRATIONS:-false}" in
  true|1)
    if ! command -v prisma >/dev/null 2>&1 && [ ! -x ./node_modules/.bin/prisma ]; then
      echo "ERROR: RUN_MIGRATIONS is set but the ORM CLI is not in this image." >&2
      echo "       It is a devDependency and the prod-deps stage prunes it." >&2
      echo "       Either add it to dependencies or migrate outside the container." >&2
      echo "       Procedure: docs/deployment.md" >&2
      exit 1
    fi
    echo "==> Applying pending migrations (migrate deploy)"
    ./node_modules/.bin/prisma migrate deploy
    ;;
esac

echo "==> Starting the API (NODE_ENV=${NODE_ENV:-development}, PORT=${PORT:-unset})"
# Identical to the `start` script in package.json. `--env-file-if-exists` does
# not fail when the file is absent, which is always the case in the container:
# configuration arrives as environment variables from the compose.
exec node --env-file-if-exists=.env dist/main.js
