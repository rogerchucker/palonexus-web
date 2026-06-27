---
title: Migrations
description: The Postgres schema behind PaloNexus — the control-plane registry, the agent-idp store, and the LangGraph checkpointer — all created idempotently on first use (CREATE TABLE IF NOT EXISTS / setup()), with a safe re-apply and backend-switch runbook.
sidebar:
  order: 9
---

PaloNexus's persistent state lives in three places, and **all three create their own schema
idempotently** — there is no separate migration tool to run, and a re-apply is safe. This page
documents what gets created and how to operate it. See [Persistence](/docs/operations/persistence/)
for choosing a backend.

## The three schemas

| Owner | Backend selected by | Schema creation |
|---|---|---|
| **Control-plane registry** | `REGISTRY_BACKEND` + `REGISTRY_DB_URL` | one document table created on startup (`CREATE TABLE IF NOT EXISTS`) |
| **agent-idp store** | `IDP_STORE_BACKEND` + `IDP_DB_URL` | per-feature tables created on first use (`CREATE TABLE IF NOT EXISTS`) |
| **LangGraph checkpointer** (per agent) | `PALONEXUS_AGENT_DB_URL` | `AsyncPostgresSaver.setup()` creates its own tables on entry |

### Control-plane registry

A single JSON-document table keyed by service name. The table/database names are overridable with
`REGISTRY_DB_TABLE` and `REGISTRY_DB_DATABASE`. One SQL implementation serves Postgres / MySQL /
SQLite (dialect-aware upsert); MongoDB uses a document collection.

```bash
REGISTRY_BACKEND=postgres \
REGISTRY_DB_URL='postgres://palonexus:pw@pg-rw.palonexus.svc:5432/palonexus?sslmode=disable'
# On boot: CREATE TABLE IF NOT EXISTS <REGISTRY_DB_TABLE|registry_services> (...)
```

### agent-idp store

The store and the enterprise-IAM features create these tables automatically on first use (no
migration step):

```text
agents                 governed agent records (provisioning, owner/sponsor)
delegations            task-scoped delegation grants + status
revocations            revoked JTIs / StatusList state
idp_employees          directory employees (F1)
idp_groups             directory groups (F1)
idp_syncs              per-sync reconcile reports (F1)
idp_agent_governance   agent ownership/governance records (F3)
idp_gov_delegations    authorized governance delegations (F4/F5)
idp_revocations_log    durable revocation log with reason codes (F4)
idp_tokens             STS token audit log — metadata only (F6)
```

```bash
IDP_STORE_BACKEND=postgres \
IDP_DB_URL='postgresql://palonexus:pw@pg-rw.agent-idp.svc:5432/agentidp'
```

### LangGraph checkpointer

Agents that need durable threads + HITL pause/resume use `AsyncPostgresSaver`. On startup the
agent calls `await checkpointer.setup()`, which creates LangGraph's checkpoint tables
(`checkpoints`, `checkpoint_writes`, `checkpoint_blobs`, …). With no DB URL the agent falls back
to a non-durable `MemorySaver`.

```bash
PALONEXUS_AGENT_DB_URL='postgresql://palonexus:pw@pg-rw.agent-idp.svc:5432/agentidp'
# AsyncPostgresSaver.from_conn_string(...).setup() — creates the checkpoint tables
```

:::caution[HITL needs a durable checkpointer]
Without `PALONEXUS_AGENT_DB_URL`, an `interrupt()` for approval cannot survive a pod restart —
the approval flow can't complete. Use Postgres for any agent that uses delegations/approvals. See
the [LangGraph adapter](/docs/sdk/langgraph/#the-durable-checkpointer-requirement).
:::

## Idempotent re-apply

Because every schema uses `CREATE TABLE IF NOT EXISTS` / `setup()`, **restarting or redeploying
re-runs creation harmlessly** — existing data is preserved, missing tables are added. There is no
"migrate up/down" command and no version table to babysit for the MVP schema.

## Provisioning with the `postgres` component

The `deploy/kustomize/components/postgres/` component provisions a CloudNativePG `Cluster` per
component (`palonexus`, `agent-idp`) and wires each DSN in from the generated `*-app` secret —
you don't create databases or write passwords by hand:

```yaml
# deploy/kustomize/overlays/selfhost/kustomization.yaml
components:
  - ../../components/postgres        # requires the CNPG operator installed first
```

The apps point `REGISTRY_DB_URL` / `IDP_DB_URL` at the `*-rw` Service; tables are created on
their first boot against it.

## Switching backends (a real migration)

Changing `*_BACKEND` does **not** copy data — the new backend starts empty. To move from memory
or SQLite to Postgres without losing state:

1. **Quiesce writes** — scale the writer (control-plane / agent-idp) to read-only or pause
   registrations/approvals.
2. **Export** the current store. For the registry, re-`POST` services from your source of truth
   (registrations are declarative); for agent-idp, dump and re-insert the JSON documents, or
   replay provisioning + delegations.
3. **Re-point** `*_DB_URL` at Postgres and restart — tables are created on boot.
4. **Verify** — list services (`GET /v1/registry/services`), check agent provisioning, and run
   `pn.audit.verify_chain()`.

Because registrations and provisioning are declarative and re-runnable, the simplest "migration"
is often just to re-seed against the new backend.

## Fail-closed

If a durable backend is misconfigured or unreachable **at startup**, the process **exits** rather
than silently dropping to in-memory — a DSN typo must never quietly lose every registration. This
is the same fail-closed posture as the [security model](/docs/concepts/security-model/#2-fail-closed-on-every-dependency).

## Related

- [Persistence](/docs/operations/persistence/) — backends and the `postgres` component.
- [Backups](/docs/operations/backups/) — backing up and restoring these schemas.
- [Upgrades](/docs/operations/upgrades/) — handling schema changes across versions.
