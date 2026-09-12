# Deployment — leetcamp

Runbook. Read it in full before the first deployment; after that, jump to the
section you need.

> Skeleton: the topology, the commands and the known pitfalls are written. The
> specifics of your server, your registry and your database provider you fill
> in yourself wherever it says `<...>`.

---

## 1. Topology

```
Internet ──► caddy (80/443, automatic TLS)
               ├── /api/*, /health*  ──► api:5090   (Fastify)
               └── /*                ──► web:80             (nginx + SPA)
```

Three services on one bridge network. **Only the proxy publishes ports**; `web`
and `api` are not reachable from outside the internal network, not even from
the host.

### Why a single domain

It is the decision everything else rests on. The browser loads the SPA from
`https://domain/` and the bundle requests `/api/v1/...` — **same origin**.
There is no preflight, no `Access-Control-Allow-Origin` to tune per
environment, and the day the session moves to cookies they will be first-party.

### ⚠ Single instance

The `api` service hosts the **cron scheduler in process**, with no distributed
coordination. `--scale api=2` does not double capacity: it doubles **every run
of every job**. That is data corruption, not a performance problem, and it does
not surface until someone reads a number that does not add up.

`deploy.replicas: 1` documents it but **does not enforce it** (Compose ignores
that key outside Swarm). What actually enforces it is `SCHEDULER_ENABLED`,
which may only be `true` on one instance.

If horizontal scaling is ever needed: split the scheduler into its own
single-replica service and leave the HTTP servers without it.

---

## 2. Prerequisites

- Docker and Docker Compose on the server.
- **DNS A/AAAA record** for the domain pointing at the server's IP.
- **Ports 80 and 443 open.** ACME HTTP-01 validates by connecting back on 80:
  if it is closed, certificate issuance fails and the site is left without
  HTTPS.
- The database reachable from the server, with both connection strings.

---

## 3. First deployment

```bash
git clone <repo> && cd leetcamp

cp deploy/.env.example deploy/.env
$EDITOR deploy/.env      # SITE_ADDRESS=<domain>, credentials, images

docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d

docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps
curl -fsS https://<domain>/health
```

### Local verification, without TLS

```bash
# SITE_ADDRESS=:80 in deploy/.env
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up --build -d
# → http://localhost
```

---

## 4. Building the images

⚠ **THE BUILD CONTEXT IS THE REPOSITORY ROOT**, never the app directory:

```bash
docker build -f apps/api/Dockerfile -t leetcamp-api .
docker build -f apps/web/Dockerfile \
  --build-arg VITE_AUTH_CLIENT_ID=<...> \
  --build-arg VITE_AUTH_ISSUER=<...> \
  -t leetcamp-web .
```

This is a pnpm workspace: without `pnpm-workspace.yaml`, the root lockfile and
`packages/*` inside the context, `workspace:*` dependencies do not resolve and
the build fails with `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` — which looks like a
dependency problem and is not.

### `VITE_*` gets baked in

There is no way to configure them afterward: the bundler substitutes those
values textually into the JavaScript. **Changing environment = rebuilding the
image**, not restarting the container.

They are public by definition, so passing them via `--build-arg` does not
expose them any more than they already are. **Never pass a server secret this
way**: it would end up written into the layer history, and `docker history`
recovers it.

The API image, by contrast, does **not** take build-args: it reads
`process.env` at startup. The same image serves every environment; what
changes is the `env_file`.

---

## 5. Updating

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

⚠ **Pin tags by commit SHA, never `latest`.** That is what makes a rollback
deterministic: `latest` points at something different after every publish, so
"going back to latest" means nothing.

## 6. Rollback

```bash
$EDITOR deploy/.env    # WEB_IMAGE / API_IMAGE to the previous SHA
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

If the deployment included a destructive migration, rolling back the images
does **not** revert the schema. That is why migrations are applied as a
conscious, separate step — see the next section.

---

## 7. Migrations

**By default, the container does NOT migrate on startup.** That is deliberate:

1. A `migrate deploy` on every boot applies the same migration N times
   concurrently during a rolling deployment.
2. The ORM's CLI is a devDependency and the `prod-deps` stage prunes it.

Recommended procedure — from the repository, against `DIRECT_URL` (session
mode; transaction mode does not support migrations):

```bash
pnpm --filter @leetcamp/api db:status    # what is pending
pnpm --filter @leetcamp/api db:deploy    # apply
```

`migrate deploy` is the safe command: it applies what is pending and never
generates, resets or drops anything. **Never `migrate dev` in production** —
it can reset the database.

If you still want the container to migrate, the entrypoint supports it with
`RUN_MIGRATIONS=true`, and fails with a clear message if the CLI is not in the
image. It is only acceptable with a single instance.

---

## 8. Health probes

**They are two distinct routes on purpose**, and collapsing them produces a
restart loop:

| Route | What it answers | Who uses it |
|---|---|---|
| `/health` | "the process is alive". **Does not touch the database** | The container healthcheck: decides whether to KILL |
| `/health/ready` | "I can serve traffic". Does query the database | Decides whether to SEND TRAFFIC |

If liveness depended on the database, a database blip would kill and restart
the container — which fixes nothing and adds a restart loop to an incident
that already exists.

On the web side, the healthcheck uses **`/nginx-health`, not `/`**: with the
SPA fallback active any path returns 200, so a probe against `/` could not
tell a healthy nginx from one with an empty static directory.

---

## 9. Certificates

Caddy requests them, renews them and stores them in the `caddy_data` and
`caddy_config` volumes.

⚠ **`docker compose down -v` deletes them.** Let's Encrypt limits issuance to
5 certificates per domain per week: a careless `-v` can leave the site without
HTTPS for days. Back up `caddy_data` before any operation that touches
volumes.

---

## 10. Diagnostics

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f api
docker compose -f deploy/docker-compose.yml --env-file deploy/.env ps
```

| Symptom | Usual cause |
|---|---|
| The API restarts in a loop | A required variable is missing. The log says so at startup |
| Everything returns 404 except the root | Missing the SPA fallback, or the `handle` order in the Caddyfile |
| The API returns the SPA's HTML | `/api/*` is AFTER `/*` in the Caddyfile |
| The API answers 404 on `/v1/...` | Someone added `strip_prefix /api`. The prefix is not stripped |
| No HTTPS | DNS or port 80. ACME validates by connecting back over it |
| The API's `healthcheck` fails | Does `PORT` match the one in the compose file and the healthcheck? |
| Jobs run twice | More than one instance with `SCHEDULER_ENABLED=true` |
| Hung connections after every deploy | The entrypoint lost `exec`: SIGTERM never reaches node |
| `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND` while building | The build context is not the repository root |

---

## 11. What this runbook does NOT cover

Write it in when you decide, instead of leaving the gap:

- Database backups and restore.
- Log aggregation and alerting.
- Secrets strategy beyond a file on the server.
- Zero-downtime deployment (today there is a brief restart).
