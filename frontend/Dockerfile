# @leetcamp/frontend — multi-stage production image.
#
# Unlike apps/api, this is a standalone npm project, NOT part of the backend's
# pnpm workspace — see docs/DECISIONS.md, "Frontend: proyecto Angular
# independiente". The build context for this Dockerfile is `frontend/`
# itself, not the repository root:
#
#     docker build -f Dockerfile -t leetcamp-web .   (run from frontend/)
#
# ── NO BUILD ARGS ────────────────────────────────────────────────────────────
# `environment.ts` (the config `ng build`'s production configuration uses by
# default) sets `apiBaseUrl: '/api/v1'` — a relative path. Caddy puts the SPA
# and the API behind the same origin (see deploy/Caddyfile), so there is
# nothing environment-specific to bake in at build time. If that ever needs to
# change per-deployment, prefer Angular's file-replacement mechanism (already
# wired in angular.json) over reintroducing Vite-style build args — this
# project does not use Vite.

FROM node:22-alpine AS build
WORKDIR /app

# Manifests only first, so this layer is reused while dependencies don't change.
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
RUN npm run build

# ── runtime · nginx serving the static bundle ────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
# The application builder outputs the browser bundle under
# dist/<project>/browser/, not dist/<project>/ directly — copying the wrong
# level serves a directory listing instead of the app.
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 80
