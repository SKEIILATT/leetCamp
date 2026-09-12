# leetcamp

> pnpm monorepo with hexagonal architecture and the `Result` pattern.
> Generated with the `clean-arch` skill.

## Getting started

```bash
pnpm install

cp apps/api/.env.example apps/api/.env   # server secrets
cp apps/web/.env.example apps/web/.env   # public frontend configuration
$EDITOR apps/api/.env apps/web/.env

pnpm dev
```

Before touching anything:

```bash
bash health.sh
```

If it comes out red, fix it before writing code. Read **the summary**, not just
the exit code: it states explicitly what a green run does NOT cover.

## Dependency versions

The generated `package.json` files declare **conservative `^` ranges**, not exact
versions. Before the first install, verify the real versions with
**Context7 MCP** (`resolve-library-id` → `query-docs`) and pin what needs pinning.
The scaffolding deliberately carries no embedded version knowledge: it expires
and nobody reviews it.

## Structure

```
packages/domain        zero runtime dependencies, "types": []
     ↑
packages/application   only → domain
     ↑
apps/api               → domain + application. The ONLY layer that touches
                         Fastify, the ORM and authentication.
apps/web               imports nothing from the workspace. Consumes the
                         contract via OpenAPI codegen.
```

The arrows are the **allowed** direction of dependency, and they are not a
convention: `eslint-plugin-boundaries` enforces them and the lint fails if they
are broken.

| Path | What it contains |
|---|---|
| `packages/domain/` | Entities, errors, `Result`, ports |
| `packages/application/` | Use cases, organized by business feature slice |
| `apps/api/` | Fastify + OpenAPI 3.1 + ORM. Adapters and composition |
| `apps/web/` | SPA. Typed client generated from the spec |
| `deploy/` | `docker-compose.yml` and `Caddyfile` |
| `docs/` | Architecture guide, deployment, variable matrix |

## Commands

All from the root.

| Command | What it does |
|---|---|
| `pnpm dev` | Starts api and web in parallel |
| `pnpm build` | `pnpm -r build` — **every** workspace, with `tsc` |
| `pnpm typecheck` | `pnpm -r typecheck` |
| `pnpm test` | `pnpm -r test` |
| `pnpm lint` | eslint from the root. **Not recursive** — see below |
| `bash health.sh` | The full quality gate, 7 steps |
| `pnpm gen:api` | Regenerates the frontend's typed client |

For a single workspace: `pnpm --filter @leetcamp/api <script>`.

**`pnpm lint` is not `pnpm -r lint` on purpose.** `eslint-plugin-boundaries` has
to see the whole tree to classify imports crossing package boundaries; running
it package by package it cannot, and the rules pass without enforcing anything.

## The three rules everything else rests on

1. **Expected failures are not thrown, they are returned.** Use cases return
   `Result<T>`. Exceptions are reserved for programming errors and
   unrecoverable infrastructure failures. A record that does not exist or a
   missing permission are business outcomes, not exceptions.
2. **The core knows nothing of the outside world.** `domain` and `application`
   do not import Fastify, nor the ORM, nor zod, nor React. The linter enforces it.
3. **Identity never comes from the client.** Neither `userId`, nor role, nor
   scope ever come out of the body or the query string: they come from
   `request.identity`, which the authentication plugin populates. A handler that
   accepts that data from the client does not have a bug, it has an
   authorization hole.

## Environment variables

Split **by trust boundary**. Full matrix in
[`docs/ENV_VARIABLES.md`](docs/ENV_VARIABLES.md).

- `apps/api/.env` → server secrets. `@t3-oss/env-core` validates them at
  startup; the process **does not boot** if something required is missing.
- `apps/web/.env` → **public values only**. The bundler prefix means "this
  travels to the browser": anyone can read it in devtools.
- `deploy/.env` → Docker Compose deployment configuration.

⚠ Vite resolves its `envDir` next to `vite.config.ts`. A `.env` at the
repository root is **not read by the frontend**.

## Contract between api and web

There is no shared types package, and that is deliberate: the moment the
frontend can import from the backend's workspace, nothing stops the next import
from being a use case.

The contract is the **OpenAPI document** the server itself publishes:

```
Zod schemas of the routes → GET /openapi → apps/web/scripts/openapi.ts
→ apps/web/src/generated/api.d.ts → typed client
```

Regenerating it requires the API running with the endpoint enabled:

```bash
cd apps/api && ENABLE_OPENAPI_ENDPOINT=true pnpm dev   # leave it alive
pnpm gen:api                                            # in another terminal
```

`apps/web/src/generated/` **is committed**: a static typecheck cannot depend on
a server being up and listening.

## Deployment

Docker Compose: `caddy` terminates TLS and routes, `web` serves the SPA with
nginx, `api` runs Fastify. A single domain, which removes CORS entirely.

⚠ **The build context is the REPOSITORY ROOT**, never the app directory:
`docker build -f apps/api/Dockerfile .`. Without `pnpm-workspace.yaml`, the root
lockfile and `packages/*` inside the context, `workspace:*` dependencies do not
resolve.

⚠ **The `api` service runs as a SINGLE INSTANCE.** It hosts the cron scheduler
in process, with no distributed coordination: two replicas run every job twice.

Full runbook: [`docs/deployment.md`](docs/deployment.md).

## Documentation

| Document | When to read it |
|---|---|
| [`docs/architecture-guide.md`](docs/architecture-guide.md) | Before creating a new file or a feature slice |
| [`docs/deployment.md`](docs/deployment.md) | When deploying or diagnosing production |
| [`docs/ENV_VARIABLES.md`](docs/ENV_VARIABLES.md) | Before adding any variable |
| [`ONBOARDING.md`](ONBOARDING.md) | Day one, and when something fails strangely |
| [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md) | If you work with AI agents in this repo |
