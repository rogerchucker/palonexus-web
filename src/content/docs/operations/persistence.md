---
title: Persistence
description: Pluggable durable backends for the control-plane registry and the agent-idp store — memory, Postgres, MySQL, SQLite, MongoDB — selected by environment, provisioned by CloudNativePG, fail-closed at startup.
sidebar:
  order: 4
---

By default the control-plane **registry** and the **agent-idp store** (agents,
delegations, revocations / StatusList) are in-process maps — a pod restart wipes
every registration, delegation, and revocation. The in-memory default is also
per-replica, so any multi-replica/HA deployment needs a shared backend. The
opt-in persistence layer makes them durable behind the *same* storage interface,
selected entirely by environment variables. This durability is what lets you
prove which agent acted on whose still-valid authority *across restarts* — the
identity and credential design it backs lives in
[Agent identity & credentials](/docs/concepts/identity-and-credentials/).

> Canonical design: `docs/persistence-and-identity.md` in the platform repo.

> Status: shipped and verified live on a managed Kubernetes cluster (DOKS example) with `REGISTRY_BACKEND=postgres` /
> `IDP_STORE_BACKEND=postgres` (Postgres via CloudNativePG). Registry and
> agent-idp store survive pod restarts.

## Backends

Both components keep their storage *interface* and gain a backend **factory**
chosen by env. Records are stored as a JSON document keyed by primary key, so one
SQL implementation serves Postgres / MySQL / SQLite (dialect-aware placeholders +
upsert) and a separate document implementation serves MongoDB. **Memory stays the
zero-config default.**

| | Control-plane (Go) | agent-idp (Python) |
|---|---|---|
| Interface | `registry.Store` (`Upsert/Get/List`) | `app.store.Store` (agents/delegations/revocations) |
| Backends | `memory` · `postgres` · `mysql` · `sqlite` · `mongodb` | same set |
| Select via | `REGISTRY_BACKEND` + `REGISTRY_DB_URL` | `IDP_STORE_BACKEND` + `IDP_DB_URL` |
| SQL drivers | `modernc.org/sqlite` (pure-Go — keeps the static distroless build), `lib/pq`, `go-sql-driver/mysql` | stdlib `sqlite3`, `psycopg` (pg), `PyMySQL` |
| Mongo driver | `go.mongodb.org/mongo-driver` | `pymongo` |
| Tested in CI | SQL path against SQLite (no server needed) | SQL path against SQLite |

The control-plane also accepts `REGISTRY_DB_TABLE` and `REGISTRY_DB_DATABASE` to
override the table/collection and database names.

## Selecting a backend

```bash
# Control-plane registry
REGISTRY_BACKEND=postgres  REGISTRY_DB_URL=postgres://palonexus:pw@pg-rw.palonexus.svc:5432/palonexus?sslmode=disable
REGISTRY_BACKEND=sqlite    REGISTRY_DB_URL=/var/lib/palonexus/registry.db
REGISTRY_BACKEND=mysql     REGISTRY_DB_URL='palonexus:pw@tcp(mysql.palonexus.svc:3306)/palonexus'
REGISTRY_BACKEND=mongodb   REGISTRY_DB_URL=mongodb://mongo.palonexus.svc:27017/palonexus

# agent-idp store
IDP_STORE_BACKEND=postgres IDP_DB_URL=postgresql://palonexus:pw@pg-rw.agent-idp.svc:5432/agentidp
```

SQLite (a PVC-backed file) is the zero-operator single-node option. Mongo uses the
document implementation; the rest share the SQL implementation.

## The `postgres` component (CloudNativePG)

Production Postgres is provisioned by **CloudNativePG** (CNPG). The
`deploy/kustomize/components/postgres/` component creates a `Cluster` CR per
component (`palonexus`, `agent-idp`), each giving a managed primary+replica with a
`*-rw` Service the apps point their `*_DB_URL` at, and patches the DSN in from the
generated `*-app` secret.

Enable it from the selfhost overlay (install the CNPG operator first):

```yaml
# deploy/kustomize/overlays/selfhost/kustomization.yaml
components:
  - ../../components/postgres
```

```bash
# Install the CloudNativePG operator before applying the component
# https://cloudnative-pg.io
```

> The component does not add a NetworkPolicy for Postgres today. If you later
> lock down control-plane / agent-idp egress, allow **TCP 5432** to pods labelled
> `cnpg.io/cluster=<palonexus-pg|agentidp-pg>`.

## Fail-closed

If a durable backend is **misconfigured or unreachable at startup**, the process
**exits** rather than silently falling back to memory — a typo in a DSN must not
quietly drop you to a store that loses every registration. This mirrors the
control plane's deny-by-default posture: see the
[control-plane invariants](/docs/operations/control-plane/#fail-closed-invariants-do-not-break-these).

Once durable, registrations, delegations, and revocations survive restarts — which
is what makes the live-revocation flow (`vc` mode) reliable rather than dependent
on an in-memory set. See [Credential-safe action enforcement (ops)](/docs/operations/egress-enforcement-ops/)
for `AGENT_IDENTITY_MODE=vc`.
