# @leetcamp/api — multi-stage production image.
#
# ⚠⚠ THE BUILD CONTEXT IS THE REPOSITORY ROOT, NOT THIS DIRECTORY:
#
#     docker build -f apps/api/Dockerfile -t leetcamp-api .
#                                                            ^ the dot matters
#
# This is a pnpm workspace and `apps/api` depends on `@leetcamp/domain` and
# `@leetcamp/application` with `workspace:*`. Without `pnpm-workspace.yaml`, the
# root `pnpm-lock.yaml` and `packages/*` inside the context, pnpm cannot resolve
# them and the build fails with ERR_PNPM_WORKSPACE_PKG_NOT_FOUND. Building with
# `apps/api/` as the context is the natural mistake and it does not work.
# See `.dockerignore` for what stays out.
#
# ── WHY ALL THREE WORKSPACES GET COMPILED ────────────────────────────────────
# `packages/domain` and `packages/application` use conditional exports:
#   development -> ./src/index.ts   (what tsx and vitest resolve)
#   default     -> ./dist/index.js  (what plain `node` resolves)
# This image's runtime is plain `node`, so it resolves `default` and needs each
# package's `dist/`. Hence `--filter @leetcamp/api...` in the build stage: the
# trailing `...` pulls in the workspace dependencies and pnpm compiles them in
# topological order (domain -> application -> api).
#
# ── CONFIGURATION IS NOT BAKED IN ────────────────────────────────────────────
# Unlike the web image, there are NO build args here: the process reads
# `process.env` at boot and validates it with @t3-oss/env-core. The image is the
# SAME for every environment; what changes is the compose `env_file`. A secret
# passed as `--build-arg` would be written into the image's layer history and
# recoverable with `docker history`.

# ── deps · install the workspace with the lockfile frozen ────────────────────
FROM node:22-slim AS deps
# corepack activates the pnpm pinned by `packageManager` in the root
# package.json. pnpm is NOT installed with `npm i -g`, so there is only one
# source of truth for its version.
RUN corepack enable \
  && apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Manifests only, so this layer is reused while dependencies do not change.
# ⚠ COPY EVERY WORKSPACE MANIFEST, even ones this image does not use:
# `--frozen-lockfile` compares the lockfile against the COMPLETE set of
# projects and fails with ERR_PNPM_OUTDATED_LOCKFILE if one is missing. Copying
# a package.json does not install its dependencies — the `--filter` below
# handles that.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/domain/package.json packages/domain/
COPY packages/application/package.json packages/application/
COPY apps/api/package.json apps/api/

# `--filter @leetcamp/api...` installs api + domain + application and SKIPS the
# whole frontend tree.
RUN pnpm install --frozen-lockfile --filter @leetcamp/api...

# ── build · generate the ORM client, then compile ────────────────────────────
FROM deps AS build
WORKDIR /app
# `tsconfig.base.json` is MANDATORY here: the tsconfigs of packages/* and
# apps/api extend it by relative path and without it tsc dies with TS5083
# before compiling a single line.
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/api/ apps/api/

# ⚠ THE ORM CLIENT IS GENERATED BEFORE tsc, NOT AFTER. The API's `build` script
# is `db:generate && tsc && copy-prisma-client`, in that order, because tsc
# needs the generated `.d.ts` to type-check the repositories. Reordering these
# produces a "cannot find module ./generated/prisma" that looks like a path bug
# and is not.
#
# `prisma generate` opens NO connection — it only emits code from schema.prisma —
# so no placeholder DATABASE_URL is required at build time.
RUN pnpm --filter @leetcamp/api... build

# ── prod-deps · prune the tree to production dependencies ────────────────────
FROM node:22-slim AS prod-deps
RUN corepack enable \
  && apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
# `pnpm deploy` materialises a flat node_modules in /prod/api containing ONLY
# the production dependencies of the API — workspace deps included, as real
# copies rather than symlinks into the store, which would not survive the stage
# change.
RUN pnpm deploy --filter=@leetcamp/api --prod --legacy /prod/api

# ── runtime · minimal image: node + pruned deps + dist ───────────────────────
FROM node:22-slim AS runtime
# The ORM's engines link against OpenSSL, which -slim images do not ship.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps /prod/api/node_modules ./node_modules
# `dist/` already contains `dist/generated/` thanks to copy-prisma-client.mjs.
COPY --from=build /app/apps/api/dist ./dist
# The schema travels with the image so `migrate status` can be run inside the
# container to see which model version is deployed.
COPY --from=build /app/apps/api/prisma ./prisma
# package.json next to dist/: its `"type": "module"` is what makes node treat
# the .js files in dist/ as ESM. Without it, `import` fails at startup.
COPY --from=build /app/apps/api/package.json ./package.json
# `pnpm deploy` copies the workspace packages' source but their `dist/` can fall
# outside the pruned tree. Copied explicitly because it is what each package's
# `exports.default` resolves to.
COPY --from=build /app/packages/domain/dist ./node_modules/@leetcamp/domain/dist
COPY --from=build /app/packages/application/dist ./node_modules/@leetcamp/application/dist

COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# node:22-slim already ships an unprivileged `node` user. The process writes
# nothing to the filesystem, so no chown is needed.
USER node

# Fixed port inside the compose network; it matches the `PORT` the compose
# injects. NOT published to the host: the only thing that talks to this
# container is the proxy.
EXPOSE 5090

ENTRYPOINT ["./docker-entrypoint.sh"]
