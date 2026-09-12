# Environment variables — leetcamp

Which variable lives where, who reads it, and why it is split the way it is.
**Read it before adding any variable.**

---

## 1. The rule

Variables are split **by trust boundary**, not for convenience.

| File | Contains | Read by |
|---|---|---|
| `apps/api/.env` | Server secrets and runtime configuration | The Node process, at startup |
| `apps/web/.env` | **Public values only** | The bundler, at build time |
| `deploy/.env` | Deployment configuration | docker compose |

⚠ **The client prefix (`VITE_`) means PUBLIC.** The bundler substitutes those
values **textually** inside the JavaScript the browser downloads. It is not
that it is hard to protect: it is that **it is not protected at all**. Anyone
can read it in devtools. Never give that prefix to a secret.

⚠ **Vite reads the `.env` next to `vite.config.ts`**, not the one at the
repository root. A `.env` at the root **is not read by the frontend**, and the
symptom is a build that fails validation for no apparent reason.

---

## 2. Matrix

### `apps/api/.env` — server

| Variable | Req. | Default | What it is |
|---|:---:|---|---|
| `NODE_ENV` | no | `development` | Configures the logger and closes `/openapi` in production |
| `PORT` | no | `5090` | Listening port |
| `LOG_LEVEL` | no | `info` | pino level |
| `CORS_ORIGINS` | **yes** | — | CSV of exact origins, **no trailing slash** |
| `ENABLE_OPENAPI_ENDPOINT` | no | `false` | Publishes `GET /openapi` |
| `DATABASE_URL` | **yes** | — | RUNTIME connection. Self-hosted, no pooler — same value as `DIRECT_URL` |
| `DIRECT_URL` | **yes** | — | DIRECT connection, used by migrations |
| `AUTH_ISSUER` | **yes** | — | `iss` claim this API stamps and requires (self-issued JWT) |
| `AUTH_AUDIENCE` | **yes** | — | `aud` claim, same reasoning |
| `JWT_SECRET` | **yes** | — | HMAC secret (32+ chars) used to sign AND verify tokens |
| `JWT_TTL_SECONDS` | no | `86400` | How long an issued token stays valid |
| `SCHEDULER_ENABLED` | no | `false` | ⚠ Only `true` on ONE instance |
| `SCHEDULER_BOOT_DELAY_MS` | no | `10000` | Delay before the first job after startup |
| `SCHEDULER_HEARTBEAT_MINUTES` | no | `15` | Cadence of the reference job |

### `apps/web/.env` — public

| Variable | Req. | Default | What it is |
|---|:---:|---|---|
| `VITE_API_BASE_URL` | no | `/api` | Where the API lives as seen from the browser |
| `VITE_AUTH_CLIENT_ID` | **yes** | — | **Public** identifier of the auth provider |
| `VITE_AUTH_ISSUER` | **yes** | — | Issuer URL |

### `deploy/.env` — deployment

| Variable | What it is |
|---|---|
| `SITE_ADDRESS` | `:80` locally; the real domain in production (triggers ACME) |
| `WEB_IMAGE` / `API_IMAGE` | Image references. **Pinned by SHA**, never `latest` |
| *(plus those in `apps/api/.env`)* | It is the `api` service's `env_file` |
| *(plus the `VITE_*` ones)* | Feed the frontend's build-args |

---

## 3. The decisions that are not obvious

### Why `CORS_ORIGINS` is required and has no default

A default on a CORS allow-list is a **silent security failure**: the day
someone deploys without setting it, the server boots happily accepting another
environment's origins. It is preferable for the process to die at startup with
an explicit message.

And no trailing slash: the `Origin` header the browser sends is always
`scheme://host[:port]`, so `https://app.example.com/` would never match and
would break CORS in production without anything flagging it.

### Why `DATABASE_URL` and `DIRECT_URL` are not the same

They are not a duplicate **in general**. The pooler in transaction mode **does
not support what migrations need**: statements that depend on session state,
advisory locks, DDL inside long transactions. Pointing both at the pooler
produces migration failures that look like corruption.

**In this project specifically**, both variables currently hold the identical
value: Postgres is self-hosted (see `docs/DECISIONS.md`) with no pooler in
front of it. The distinction still exists in the schema and in `env.ts` so that
adding a pooler later (PgBouncer, say) is a one-variable change, not a
refactor.

### Why the password is percent-encoded

A password containing `@ : / ? #` unescaped produces a connection string that
does not parse. It reaches the driver intact and fails with an authentication
error that wastes hours hunting the wrong password. Use
`%40 %3A %2F %3F %23`.

The environment validator runs `new URL()` on the string precisely to catch
this at startup, naming the variable.

### Why `VITE_API_BASE_URL` is validated with `.min(1)` and not `.url()`

Its default is **`/api`, a relative path**, and that default is the production
design: web and api share a domain behind the proxy, so the browser requests
the same origin and **there is no CORS**. `z.string().url()` requires an
absolute host and would reject `/api`, breaking exactly what the variable
exists to support.

### Why `deploy/.env` mixes public and secret values

Because it plays two roles at once: it feeds the compose file's `${...}`
interpolation (which is where the frontend's public build-args come from) and
it is the `api` service's `env_file` (which is where its runtime configuration
comes from).

The trust boundary **does not disappear** by sharing a file: the `VITE_*`
values are still public and secrets still cannot carry that prefix. The only
thing that changes is where they are written on the machine doing the
deployment.

---

## 4. When adding a variable

1. **Decide which side of the boundary it is on.** Can anyone read it with a
   browser? Then it is public. If not, it never carries the client prefix.
2. **Declare it in the schema** (`apps/api/src/shared/config/env.ts` or
   `apps/web/src/env.schema.ts`). An undeclared variable is silently ignored,
   and a misspelled value goes undetected for months.
3. **Required with no default**, or optional with documented degradation. A
   default on something security-relevant is a silent failure.
4. **Add it to the matching `.env.example`**, with the why. It is the contract
   with whoever deploys.
5. **If it is a secret, add its path to the logger's `redact`**
   (`apps/api/src/shared/logger.ts`). The cost of listing one that never shows
   up in a log is zero; the cost of remembering later is not.
6. **If the frontend needs it**, declare it too in the `env:` of
   `.github/workflows/ci.yml` — with a placeholder. The build validates the
   schema and will fail until it is there, which is exactly what is wanted.

---

## 5. Active safeguards

| Where | What it checks |
|---|---|
| `apps/api/src/shared/config/env.ts` | The whole server environment, at startup. Fails fast |
| `apps/web/src/env.schema.ts` | The public environment, at build and at runtime. Rejects privileged credentials |
| `vite.config.ts` | Runs the schema above at build time: **aborts the build** |
| `scripts/check-env-secrets.mjs` | Scans **every** `.env*` in the repo. Step 3 of `health.sh` |
| `apps/api/src/shared/logger.ts` | `redact` over the paths that carry credentials |

The redundancy between the schema and the script is deliberate: a value can be
committed without ever being built, and it can be built from CI without ever
being committed.

⚠ **Known limitation:** `redact` matches **object paths**, not substrings. It
cannot save a secret embedded inside a URL logged as a plain string. That is
why `DATABASE_URL` is listed as a path, and why no credential should ever
travel as a query param.
