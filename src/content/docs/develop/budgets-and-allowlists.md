---
title: Budgets and Allowlists
description: Registry-level controls — the Allow* lists (models/tools/agents), the Budget (tokens/calls/cost), and deny-by-default egress.
sidebar:
  order: 7
---

An agent's egress permissions are declarative registry data, not code. The
control plane decides every outbound call against the agent's **allowlists** and
**budget**, deny-by-default. This page covers those two registry-level controls.

## The agent registry entry

An agent is registered `kind: agent` with its allowlists and budget inline:

```bash
curl -fsS -XPOST localhost:8181/v1/registry/services -H 'content-type: application/json' -d '{
  "name":"triage-agent",
  "upstream":"triage-agent.apps.svc.cluster.local:80",
  "owner":"sre",
  "kind":"agent",
  "requireScope":"agent:triage:invoke",
  "allowModels":["model-openai"],
  "allowTools":["runbooks-api"],
  "allowAgents":["access-broker"],
  "budget":{"tokensPerHour":2000000,"callsPerHour":500}
}'
```

`requireScope` governs **ingress** (which callers may invoke the agent). The
`Allow*` lists and `budget` govern **egress** (what the agent may reach, and how
much).

## The Allow* lists

The egress decision resolves the target to a registry Service, then checks the
matching allowlist by kind:

| Target `kind` | Checked against | A target not on the list… |
|---|---|---|
| `model` | `allowModels` | …denies (`model "…" is not in <agent>'s egress allowlist`) |
| `tool` | `allowTools` | …denies |
| `agent` | `allowAgents` | …denies |

`MayReach` is **deny-by-default**: an empty list, a target absent from the list, or
an **unknown kind** all return false. There is no implicit allow. Widening an
agent's reach means adding the target to the right `Allow*` list — an audited
`registry.upsert`.

This is the *coarse* gate enforced at the egress proxy. The *fine* gate — a
human-approved, resource-scoped delegation — layers on top for `regulated` and
server-gated targets; see
[Delegations and approvals](/docs/develop/delegations-and-approvals/) and the
[layering note](/docs/develop/egress-enforcement/#the-layering-coarse-at-the-proxy-fine-at-the-server).

## The Budget

`budget` caps the agent's consumption over a rolling window. Exceeding any ceiling
**denies** the call:

| Field | Caps |
|---|---|
| `callsPerHour` | number of egress calls per hour |
| `tokensPerHour` | LLM tokens per hour |
| `costPerHour` (USD) | metered provider spend per hour |

The budget meter is fed by the model broker: on each successful completion the
broker POSTs `/v1/usage {agent, model, tokens, costUsd}` to the control plane,
which both updates the rolling counters and emits the `palonexus_token_usage_total`
and `palonexus_agent_cost_usd_total` metrics. So budget enforcement and cost
observability come from the same single choke point — another reason model calls
must go through the [broker](/docs/develop/deploy-an-agent/#the-model-broker), never
a key in the pod.

## Tool and model entries

The targets an agent reaches are themselves registry entries. Their `dataClass`
decides whether a human-approved delegation is also required:

```bash
# A tool with a server-side DID/VC gate -> internal (allowlist at the proxy,
# fine-grained delegation enforced at the resource).
curl -fsS -XPOST localhost:8181/v1/registry/services -d '{
  "name":"runbooks-api","upstream":"runbooks.apps.svc.cluster.local:8080",
  "owner":"sre","kind":"tool","dataClass":"internal"}'

# A target with NO server-side gate -> regulated (the proxy HOLDS it for human
# approval via the Egress Approvals console).
curl -fsS -XPOST localhost:8181/v1/registry/services -d '{
  "name":"scale-deployment","upstream":"ops.apps.svc.cluster.local:8080",
  "owner":"sre","kind":"tool","dataClass":"regulated"}'

# The model broker (holds the provider key; agents never do).
curl -fsS -XPOST localhost:8181/v1/registry/services -d '{
  "name":"model-openai","upstream":"model-broker.palonexus.svc.cluster.local:8080",
  "owner":"platform","kind":"model"}'
```

## Verify deny-by-default

```bash
# The agent cannot reach a model/tool/peer not in its Allow* set:
#   403 + an egress.proxy allow=false audit row + a metric increment.
curl -s localhost:8181/v1/audit?limit=10 | jq '.[] | select(.action=="egress.proxy")'

# Exceeding the token/call ceiling denies the same way.
curl -s localhost:8181/metrics | grep -E 'palonexus_(token_usage|agent_cost)'
```

For the complete Service schema and the egress decision order (allowlist → budget →
delegation/TBAC → OPA) see the
[HTTP API reference](/docs/reference/http-api/). In production, drive these entries
from a GitOps reconciler or `Agent` CRDs rather than `curl`; the per-agent
`register-services.sh` template is the starting point —
[Deploy an agent](/docs/develop/deploy-an-agent/#4-register-the-agent-and-its-egress-allowlist).
