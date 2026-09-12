# Architecture guide — leetcamp

How the code is organized and **why**. Read it before creating a new file or a
feature slice.

> Skeleton: the section structure and the whys are written; the concrete
> examples from your domain you add yourself as they show up.

---

## 1. The layers

```
apps/web  ─(OpenAPI codegen)─►  apps/api  ──►  application  ──►  domain
```

The dependency direction points **inward only**, and
`eslint-plugin-boundaries` enforces it, not good intentions.

| Layer | May import | Never imports |
|---|---|---|
| `domain` | nothing (only itself) | frameworks, ORM, zod, React, `node:*` |
| `application` | `domain` | the same |
| `apps/api` | `domain`, `application`, itself | — |
| `apps/web` | only itself | any workspace package |

### Why

This is not purism. There are three measurable consequences:

1. **Core tests need no infrastructure.** A use case is tested by calling it
   with hand-written fakes. No server, no database, no container. The tests take
   milliseconds and keep taking milliseconds when there are three hundred of them.
2. **Swapping a provider touches one directory.** ORM, authentication, queue:
   they are adapters behind a port.
3. **Business rules read without noise.** A use case has no `req`/`res`, no
   transactions, no column mapping.

### The cost, said out loud

There are more files and there is indirection. For a three-table CRUD that is
never going to grow, this is over-engineering and the honest answer is not to use
it. The break-even point arrives with the second non-trivial business rule, or
the second consumer of the same use case.

---

## 2. Where each thing goes

| What you are writing | Its place |
|---|---|
| A business type, an invariant | `packages/domain/src/entities/` |
| An interface the outside must satisfy | `packages/domain/src/ports/` |
| A business failure | Factory in `<aggregate>-errors.ts`, with a code from the catalog |
| Orchestration of several steps | `packages/application/src/<feature-slice>/` |
| A concrete implementation | `apps/api/src/infrastructure/<area>/` |
| A route, an HTTP schema | `apps/api/src/interfaces/http/` |
| Instantiating something concrete | **Only** `apps/api/src/composition-root.ts` |

Rule of thumb: **if you need to import a library to write it, it does not belong
in the core.**

---

## 3. The `Result` pattern

```ts
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };
```

Use cases return `Result<T>`. Exceptions are reserved for the genuinely
exceptional.

### Propagation idiom

```ts
const found = await repo.findById(id);
if (!found.ok) return err(found.error);
// from here on `found.value` is narrowed
```

Always the same, in every file. **There are no combinators** (`map`,
`flatMap`): a chain reads differently in every place and hides where the failure
came from.

### The three sanctioned exceptions to no-throw

1. **Wiring errors.** Registering two jobs with the same name is a developer
   error at startup. It must kill the process, not be handled.
2. **Impossible conversions.** `fromBigInt` on a value outside the safe range
   throws, because silently returning a wrong number is worse.
3. **The infrastructure safety net.** The scheduler catches whatever a job
   throws and records it as a failed run. That is the net, not the contract: the
   job must return `Result`.

---

## 4. The error catalog

**Closed, seven codes, one single catalog for the whole project:**

| Code | HTTP | When |
|---|---|---|
| `UNAUTHENTICATED` | 401 | We do not know who you are, or the credential no longer works |
| `FORBIDDEN` | 403 | We know who you are and you cannot do *this* |
| `VALIDATION` | 400 | The input is not valid |
| `NOT_FOUND` | 404 | It does not exist |
| `CONFLICT` | 409 | It exists and the state does not allow it |
| `EXTERNAL_SERVICE` | 502 | A third party failed |
| `REPOSITORY` | 500 | Our persistence failed |

**Do not add codes.** An enum per feature forces a mapping table per feature,
and the day someone forgets one, the response is a 500 with a leaking message.
What distinguishes one failure from another is the **message**, not a new code.

⚠ The message is a **wire contract**: `errorBody()` sends it as-is. Never build
it by interpolating a raw driver error.

The mapping lives in **one single place**, `result-to-http.ts`, and the `switch`
is exhaustive with a `default: 500` in case the catalog grows before the table
does.

---

## 5. Ports and adapters

A **port** is an interface in `domain` describing a capability in business
terms. An **adapter** is its implementation in `apps/api/infrastructure/`.

### How to write a port that does not lie

- **In the language of the business**, not the provider's.
  `findActiveProfileBySubject`, not `findMany(where)`.
- **Return `Result`** when it can fail for infrastructure reasons.
- **Distinguish "does not exist" from "failed"**: `ok(null)` and `err(...)` are
  different answers, because upstream they turn into a 401 and a 500.
- **Invariants go in the doc-comment**, and they are binding on any
  implementation: what it guarantees, what it does not, what it must not leak.

### The row → entity seam

The adapter **translates**. It never returns the ORM row as-is.

Concretely: a `bigint` breaks `JSON.stringify`, and a `Decimal` serializes as an
object with internal fields that reaches the client as garbage no schema
rejects. Both show up at the worst possible moment — while serializing the
response, inside the framework. See
`apps/api/src/infrastructure/persistence/type-mappers.ts`.

### When to split a port

When a method starts meaning two things depending on who calls it. The
scaffold's example is the two schedulers: one-shot deferred work and recurring
work are separate ports, because forcing them into one would make `cancel(id)`
mean either "cancel this job" or "cancel the next round" depending on the case.

---

## 6. Use cases

A factory that returns a function:

```ts
export function makeCreateOrder(deps: CreateOrderDeps) {
  return async (input: CreateOrderInput): Promise<Result<Order>> => { ... };
}
```

Dependencies are bound once, at composition; the returned function only takes
the input. That is what makes it testable in three lines.

### The bundle is a security decision

Every feature slice exports a `buildXUseCases(deps)`. **Whatever you export
there is one step away from being invocable over HTTP.** A use case that only an
internal job should call does not go in the bundle: it is wired directly where
it is used. "Export everything and restrict later" is how an internal operation
ends up one route away from being public.

---

## 7. The HTTP layer

`buildHttpApp(deps)` receives **ports** and **opens no connection**. That
property is what allows mounting the whole app with stubs in a test.

⚠ **The registration order in `app.ts` is numbered and commented.** Each step
explains why it is where it is. Several ordering mistakes produce no readable
error: the Zod compilers after a route make that route silently fall back to
Ajv; the auth plugin after the routes blows up at startup with
`FST_ERR_DEC_UNDECLARED`.

### Route conventions

- `operationId` always — without it, the frontend codegen emits an empty map.
- `security` on every protected route.
- Errors with `ErrorResponseSchema`.
- The status is decided by `statusForError`, never a literal in the handler.
- The `/api` prefix is part of the path and the proxy does not strip it.

---

## 8. The composition root

The **only** file that sees the abstractions and the implementations at the same
time. The only one that instantiates clients, opens pools and picks providers.

It registers a **single** `onClose` hook, and the order inside it is the order
you read: stop the scheduler → abort in-flight outbound work → disconnect the
database. They could be three hooks; they are not, because the order in which
the framework runs several `onClose` hooks is not something to bet shutdown
integrity on.

---

## 9. Tests

| Layer | How it is tested | With what |
|---|---|---|
| `domain` | Pure functions, direct assertions | nothing |
| `application` | Use case + fakes of its ports | object literals |
| `apps/api` (unit) | Pure functions extracted from the HTTP layer | stubs |
| `apps/api` (integration) | App mounted with `inject()` | stubs of the ports |

### The fake is written by hand

An object literal satisfying the port. **Not a mocking library**: it lets you
assert on calls the port does not promise, and those assertions break on every
refactor without having caught a single bug.

When a fake needs more, add the minimum: a `calls` array to verify what was
asked for, and a `failWith` to force the error branch. Nothing else.

### What deserves a test

Whatever **would fail silently**. In this scaffold, for example: that a database
failure does not turn into a 401; that an unknown `role_id` does not degrade to
a default role; that the code → status table does not move on its own.

---

## 10. Boundary enforcement

Three layers of defense, and the third exists because the first two can switch
themselves off without anyone noticing:

1. **Zero dependencies** in the core's `package.json`.
2. **`"types": []`** in its tsconfig: no `process`, no `node:*`.
3. **`eslint-plugin-boundaries`** with `default: 'disallow'`.

⚠ **The negative test is mandatory.** Boundaries v7 fails silently in three
different ways (glob-style patterns, native resolver not built, wrong CWD) and
in all three the lint comes out green without enforcing anything. The only real
protection is planting a violation and demanding the lint reject it
**citing `boundaries/dependencies`**. CI's `quality` job does it on every push;
see also section 4.1 of `ONBOARDING.md`.
