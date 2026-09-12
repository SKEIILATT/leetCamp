# ONBOARDING — leetcamp

What you need to know on day one, and what you need to know the day something
fails in a way that makes no sense.

---

## 1. Getting it running

```bash
# Node: the minimum version is in `engines.node` of the root package.json
corepack enable
pnpm install --frozen-lockfile

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
$EDITOR apps/api/.env apps/web/.env

bash health.sh    # it has to come out green BEFORE you write anything
pnpm dev
```

- API: `http://localhost:5090`
- Web: `http://localhost:5173`
- OpenAPI spec: `http://localhost:5090/openapi`
  *(only with `ENABLE_OPENAPI_ENDPOINT=true` and `NODE_ENV != production`)*

---

## 2. The mental model in five minutes

Four layers, and the dependency direction **only points inward**:

```
apps/web  ─(OpenAPI codegen)─►  apps/api  ──►  application  ──►  domain
```

- **`domain`** — the business, and nothing else. No frameworks, no database, no
  `process`. It declares **ports**: interfaces the outside world must satisfy.
- **`application`** — use cases. Orchestrates the domain through the ports.
  It knows nothing of infrastructure either.
- **`apps/api`** — the only layer allowed to know Fastify, the ORM and the
  authentication provider. This is where the **adapters** (concrete
  implementations of the ports) and the **composition root** live.
- **`apps/web`** — imports nothing from the workspace. Its contract is the
  OpenAPI document the API publishes.

**Why bother.** Because the business stops being coupled to whatever looks
definitive today. Swapping ORM, auth provider or HTTP framework touches
`apps/api/src/infrastructure/` and nothing else — and, above all, use cases are
tested by calling them directly, without starting a server or a database.
That is what makes the tests fast and keeps them that way.

### `Result`, not exceptions

```ts
const result = await createOrder({ ... });
if (!result.ok) return err(result.error);
//     ^ the compiler forces you to look at it
```

An order that does not exist, an expired deadline, a missing permission: **these
are not exceptions**, they are expected business outcomes and they travel as
`err(...)`. Exceptions are reserved for programming errors and unrecoverable
infrastructure failures.

The concrete gain is that every failure path is **in the signature**. You do not
need to read a function's body to know how it can fail.

### Identity

Two layers, and the separation matters:

1. The **token verifier** says *who you are* (cryptography). It says nothing
   about permissions.
2. The **authorization repository** reads from the database *what you can do
   right now*. Always fresh.

That is why the role **never** comes out of a token claim: a role claim goes
stale the moment someone changes that role, and stays valid until the token
expires. It would be authorization with arbitrary lag.

---

## 3. Adding a feature slice

In this order:

1. **Entity + errors** in `packages/domain/src/entities/`
2. **Port** in `packages/domain/src/ports/`
3. **Use cases + bundle** in `packages/application/src/<feature-slice>/`
4. **Adapter** in `apps/api/src/infrastructure/`
5. **Schema/DTO** and **route** in `apps/api/src/interfaces/http/`
6. **Tests**

**Never the other way round.** The adapter before the port produces a port
shaped like the ORM: the name says "order repository" and the signature says
`findMany(where)`. From that point the core depends on the database schema even
though no import confesses it.

---

## 4. Known pitfalls

Every one of these has cost hours on a real project. None of them produces a
readable error.

### 4.1 The green lint that verifies nothing

`eslint-plugin-boundaries` v7 uses **folder prefixes**, not globs. A v6-style
element pattern (`packages/domain/src/**/*`) matches nothing: every file ends up
unclassified and **every rule passes vacuously**. The lint comes out green
without enforcing anything at all.

The same happens if the native `unrs-resolver` binary was not built (pnpm blocks
postinstall scripts not listed in `allowBuilds`), or if the lint runs from inside
a package instead of from the root.

**How to detect it:** the negative test. Put a forbidden import in the core and
check that the lint fails **citing `boundaries/dependencies`**:

```bash
printf "import 'zod';\nexport const probe = 1;\n" > packages/domain/src/__probe.ts
pnpm exec eslint packages/domain/src/__probe.ts   # must FAIL
rm packages/domain/src/__probe.ts
```

CI's `quality` job does exactly this on every push. Do not delete it.

### 4.2 The workspace that skips the gate silently

`pnpm -r <script>` **silently omits** any workspace that does not declare that
script. A new package without `typecheck` stays outside the gate forever while
`pnpm -r typecheck` keeps coming out green.

The `coverage` step of `health.sh` covers this. If you add a workspace, declare
the four scripts (`typecheck`, `build`, `test`, `lint`) or register the
exemption **with its reason** in `scripts/check-coverage.mjs`.

### 4.3 `sub` is not the application id

The token's `sub` claim is the **identity provider's** id. The application id is
a different column. Looking up the profile with `WHERE id = sub` throws no
error: it simply finds nothing, and **everybody** stops resolving their role
while their token remains valid.

That is why `RequestIdentity` carries `userId` and `subject` separately.

### 4.4 The 401 that signs out the whole company

A database failure while reading the profile **cannot** answer 401. If it does,
the frontend logs everybody out over an infrastructure incident, and the ticket
says "everyone got signed out" instead of "the database is down". It propagates
as `REPOSITORY` → 500. There is a test pinning this.

### 4.5 OpenAPI 3.0 breaks the types silently

`fastify-type-provider-zod` emits JSON Schema draft 2020-12. OpenAPI 3.1 accepts
it; 3.0 does not. The `@fastify/swagger` default is 3.0.x, and under 3.0 several
Zod 4 constructs serialize **wrongly and without error**: the document is
generated, nothing fails, and the types the frontend derives come out wrong.

That is why `openapi: '3.1.0'` is explicit in `app.ts`, and why
`apps/web/scripts/openapi.ts` verifies it again when downloading the spec.

### 4.6 The SPA that 404s on refresh

Client routes are real HTTP routes. Navigating inside the app the router
resolves them and nginx never hears about it; **refreshing** any route other
than the root, the browser asks the server for it, where no file by that name
exists.

`try_files $uri $uri/ /index.html` in `apps/web/nginx.conf` fixes it. **It is
not visible in development**: the Vite dev server does that fallback on its own.

### 4.7 The healthcheck that checks nothing

With the SPA fallback active, **any** path returns 200. A probe against `/`
cannot tell a healthy nginx from one with an empty static directory. That is why
`/nginx-health` exists and why the compose points there.

And on the other side: the API healthcheck uses `/health` (liveness), which
**does not touch the database**. If it depended on it, a database blip would
kill and restart the container — which fixes nothing and adds a restart loop to
an incident that already exists. `/health/ready` (readiness, which does query)
is for deciding whether to send traffic, not whether to kill the process.

### 4.8 The password that is not percent-encoded

A password containing `@ : / ? #` unescaped produces a connection string that
does not parse. It reaches the driver intact and fails with an authentication
error that wastes hours hunting the wrong password. Use `%40 %3A %2F %3F %23`.
The environment validator catches it at startup and names the variable.

### 4.9 The Docker build context

`docker build -f apps/api/Dockerfile .` — **the dot is the repository root**.
With `apps/api/` as the context, pnpm cannot find the workspace and fails with
`ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`, which looks like a dependency problem and is
not.

### 4.10 The entrypoint's `exec`

`exec node dist/main.js`, not `node dist/main.js`. Without `exec`, the shell
stays as PID 1, **swallows SIGTERM**, and the orchestrator ends up killing the
process with SIGKILL — exactly what graceful shutdown exists to avoid. The
symptom is not an error: it is hung connections against the pooler after every
deploy.

### 4.11 Two replicas, every job twice

The scheduler runs **in process** and has no distributed coordination.
`SCHEDULER_ENABLED=true` on more than one instance runs every job once per
replica. That is data corruption, not a performance problem, and it does not
show up until someone reads a number that does not add up.

---

## 5. Where to go next

| Document | What for |
|---|---|
| [`docs/architecture-guide.md`](docs/architecture-guide.md) | The layers in detail, with examples |
| [`docs/ENV_VARIABLES.md`](docs/ENV_VARIABLES.md) | Which variable lives where and why |
| [`docs/deployment.md`](docs/deployment.md) | Deploy, migrate, roll back |
| [`CLAUDE.md`](CLAUDE.md) | Navigation map for AI agents |
