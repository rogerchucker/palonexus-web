---
title: HTTP API
description: The control-plane decision and management APIs, the egress forward-proxy and egress-request APIs, and the agent-idp onboarding/delegation/revocation/VP-verification APIs — method, path, body, and response for each.
sidebar:
  order: 2
---

Reach for this page when you're calling the platform directly — wiring a gateway, scripting
the registry, approving an egress hold, or onboarding an agent — and you need the exact
method, path, body, and status code. It's the complete HTTP contract for every plane, so you
can integrate without reading the source.

The contracts are grouped by plane. All bodies are JSON unless noted. For the headers these
endpoints read and stamp, see [Headers](/docs/reference/headers/).

## 1. The decision endpoint — `/authz`

The single decision point, on the control plane's **decision listener `:9191`**. Its
primary job is the **agent-egress question** — *may this agent make this call, on behalf
of this human, for this task, right now?* A request carrying `X-Palonexus-Actor` takes
that **egress** path. The *same* endpoint also serves the **foundational ingress**
decision (the north-south request the gateway calls via Envoy HTTP `ext_authz`);
everything without `X-Palonexus-Actor` takes the ingress path. Either way: a `200` means
allow (the gateway routes to the upstream); `403` means deny; `401` means an invalid
credential or a needs-approval egress.

| Method | Path | Purpose |
|---|---|---|
| any | `/authz` | the ext_authz decision (ingress or egress) |

**Status codes**

| Code | Meaning |
|---|---|
| `200` | allow; `X-Palonexus-Subject`/`-Upstream` stamped (`-Actor`/`-Agent-DID` on egress) |
| `401` | invalid credential, **or** (egress) needs human-approved delegation with `X-Palonexus-Needs-Approval: true` |
| `403` | deny — unknown service/agent/target, not in allowlist, over budget, or a policy/OPA deny |

**Ingress decision order:** `identity.Verify` → `registry.Get` → `policy.Evaluate`
(inline then OPA veto) → audit → metrics.

**Egress decision order:** `identity.Verify` the agent token → verify the
`X-Palonexus-Agent-VP` (required in `vc` mode) → resolve actor + target in the
registry → `policy.EvaluateEgress` (**allowlist → budget → delegation/TBAC → OPA
veto**) → audit (`model.invoke` / `tool.read` / `agent.invoke`) → metrics.

```bash
# Egress decision for a regulated runbook read
curl -s -o /dev/null -w "%{http_code} needs-approval=%header{x-palonexus-needs-approval}\n" \
  -XPOST localhost:9191/authz \
  -H 'Authorization: Bearer <agent-token>' \
  -H 'X-Palonexus-Actor: triage-agent' \
  -H 'X-Palonexus-On-Behalf-Of: sre@corp' \
  -H 'X-Palonexus-Task: INC-123' \
  -H 'X-Palonexus-Service: runbooks-api' \
  -H 'X-Palonexus-Target-Kind: tool' \
  -H 'X-Palonexus-Action: runbook:read' \
  -H 'X-Palonexus-Resource: runbooks-api:/runbooks/db-failover'
# before delegation: 401 needs-approval=true   ·   after approval: 200 needs-approval=
```

## 2. The egress forward-proxy

A standard HTTP forward proxy on `EGRESS_PROXY_ADDR` (default `:9092`), fronted by
`egress-proxy.palonexus.svc:80`. It accepts a plaintext absolute-URI request or
`CONNECT host:port`, reads identity from `Proxy-Authorization: Bearer <Membership-VP>`,
and runs the same egress decision before forwarding. Audited as `egress.proxy`.

| Condition | Result |
|---|---|
| missing `Proxy-Authorization` | **407** Proxy Authentication Required |
| invalid / revoked VP | **403** |
| allow | forward + stream the response |
| deny | **403** with `X-Palonexus-Deny-Reason` |
| needs-approval / external | create a pending egress request and hold (up to `ApprovalTimeout`, default 120s); approved → forward, denied/expired → **403** |

## 3. Control-plane management API (`:8181`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz`, `/readyz` | `200` liveness/readiness |
| GET | `/v1/registry/services` | list all services (sorted by name) |
| POST | `/v1/registry/services` | upsert a service (audited `registry.upsert`) |
| GET | `/v1/registry/services/{name}` | get one service (`404` if absent) |
| POST | `/v1/usage` | broker reports per-call token/cost usage (telemetry; no audit row) |
| GET | `/v1/audit` | recent hash-chained decision records; `?limit=N` (default 200) |
| GET | `/v1/audit/verify` | recompute the chain; tamper-evidence |
| GET | `/v1/egress/requests` | list egress-approval requests; `?status=` filter, newest first |
| POST | `/v1/egress/requests/{id}/approve` | approve a held egress request `{approver}` |
| POST | `/v1/egress/requests/{id}/deny` | deny a held egress request `{approver, reason}` |
| GET | `/metrics` | Prometheus exposition |

### Registry Service schema

The first block is north-south fields; the second is the additive agent-governance
block (all `omitempty`).

| Field | Type | Meaning |
|---|---|---|
| `name` | string | **required.** Unique registry key. |
| `upstream` | string | **required.** In-cluster DNS target, e.g. `orders.apps.svc.cluster.local:8080`. |
| `owner` | string | Owning team (audit + paging). |
| `requireScope` | string | OAuth scope a caller must hold; `""` = any authenticated. |
| `public` | bool | If true, unauthenticated callers allowed. |
| `registeredAt` | RFC3339 | Set by the store if zero. |
| `kind` | string | `""` · `service` · `agent` · `model` · `tool`. |
| `allowModels` | []string | `kind=agent`: model names it may invoke. |
| `allowTools` | []string | `kind=agent`: tool names it may call. |
| `allowAgents` | []string | `kind=agent`: peer agents it may hop to. |
| `budget` | Budget | `kind=agent`: egress rate ceilings (below). |
| `dataClass` | string | `""` · `public` · `internal` · `regulated`. `regulated` → TBAC (delegation required). |

**Budget** (a zero field means no limit on that dimension):

| Field | Type | Meaning |
|---|---|---|
| `tokensPerHour` | int64 | rolling LLM-token ceiling |
| `callsPerHour` | int64 | rolling call-count ceiling |
| `costUsdPerDay` | float64 | rolling USD-spend ceiling |

**Allowlist semantics (`MayReach`)** — deny-by-default: for a `model`/`tool`/`agent`
target the caller must list the target's name in the matching `allow*` list.

```bash
curl -fsS -XPOST localhost:8181/v1/registry/services -H 'content-type: application/json' -d '{
  "name":"triage-agent",
  "upstream":"triage-agent.apps.svc.cluster.local:80",
  "owner":"sre",
  "requireScope":"agent:triage:invoke",
  "kind":"agent",
  "allowModels":["model-openai"],
  "allowTools":["runbooks-api"],
  "budget":{"tokensPerHour":2000000,"callsPerHour":500}
}'
# -> 200, echoes the stored Service; also appends a registry.upsert audit row.
```

### `POST /v1/usage`

The model broker's per-call token/cost report. It feeds the agent's rolling budget
meter and bumps the Prometheus token + cost counters. It is telemetry, not a decision,
so it emits **no audit record**.

```json
{ "agent": "triage-agent", "model": "model-openai", "tokens": 1234, "costUsd": 0.0123 }
```

Response `200 {"ok": true}`; a malformed body → `400 {"error":"invalid body"}`.

### `GET /v1/audit`

Returns the most recent hash-chained records (newest last); `?limit=N` caps the count.
Each record carries: `seq`, `action` (`authz` / `egress` / `model.invoke` /
`tool.read` / `agent.invoke` / `egress.proxy` / `egress.approval` / `registry.upsert`),
`subject`, `actor` (egress only), `task`, `service`, `allow`, `reason`, `rule`, plus
the chained `hash`/`prevHash`.

### `GET /v1/audit/verify`

Recomputes the chain and reports tamper-evidence:

```json
{ "ok": true, "brokenAtSeq": -1 }
```

`ok=false` with `brokenAtSeq` set to the sequence where the chain first breaks.

### Egress-approval requests

The pending-egress queue the forward-proxy parks a needs-approval request on (an
external/unmatched host, or a `regulated` registry target with no standing
delegation). Record JSON:

```json
{ "id": "uuid", "status": "pending|approved|denied|expired",
  "actor": "incident-triage", "actorDid": "did:key:z…",
  "target": "hooks.acme.io:443", "service": "external|<registry-name>",
  "action": "egress.invoke", "resource": "https://hooks.acme.io/incident",
  "reason": "post incident summary", "requestedAt": "ISO8601",
  "approver": null, "decidedAt": null }
```

```bash
curl -s 'localhost:8181/v1/egress/requests?status=pending'
curl -s -XPOST localhost:8181/v1/egress/requests/$ID/approve -d '{"approver":"sre@corp"}'
curl -s -XPOST localhost:8181/v1/egress/requests/$ID/deny    -d '{"approver":"sre@corp","reason":"not allowed"}'
```

Approve/deny each appends an `egress.approval` audit row and wakes the proxy's hold
(forward on approve, **403** on deny/expiry). A timed-out hold transitions to
`expired` (fail-closed). If the egress queue is disabled, approve/deny return `503`.

## 4. agent-idp API (`:8090`)

FastAPI service. Issuer/root is `did:web:agent-idp.agent-idp.svc`; agents are
`did:key:z…` subjects. Errors use the envelope `{"error":{"code","message"}}`.

### Discovery

| Method | Path | Result |
|---|---|---|
| GET | `/healthz`, `/readyz` | `{"status":"ok"}` / `{"status":"ready"}` |
| GET | `/.well-known/did.json` | the issuer `did:web` DID document |
| GET | `/v1/issuer` | `{issuerDid, issuerPubMultibase}` |

### Onboarding

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/v1/agents` | `{name, role, capabilities:[{action,resource,constraints?}]}` | `201 {name, status:"registered"}` (idempotent on name) |
| POST | `/v1/agents/{name}/provision` | — | `200 {name, did, privateKeyB64, membershipVc, capabilityVcs, issuerDid}` — `privateKeyB64` returned **once** (`404` if unknown) |
| GET | `/v1/agents` | — | `[{name, role, did, capabilities, provisioned}]` (no private keys) |
| GET | `/v1/agents/{name}` | — | one record (no private key; `404` if absent) |

```bash
curl -s -XPOST localhost:8090/v1/agents -H 'content-type: application/json' -d '{
  "name":"triage","role":"incident-triage",
  "capabilities":[{"action":"runbook:read","resource":"runbooks-api:/runbooks/*"}]}'
curl -s -XPOST localhost:8090/v1/agents/triage/provision
```

### VP verification (cryptographic egress identity)

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/v1/agents/verify-presentation` | `{vp, audience?}` | `{ok, agentName, agentDid, reason}` |

It (1) verifies the holder `did:key` signature + audience (default `palonexus-egress`)
+ nonce, (2) finds the issuer-signed Membership VC, verifies it chains to the issuer
for this holder and is **not revoked**, and (3) maps the proven `did:key` back to the
registered agent name. Fail-closed: any failure → `ok=false` with a `reason`.

```bash
curl -s -XPOST localhost:8090/v1/agents/verify-presentation \
  -H 'content-type: application/json' -d '{"vp":"<membership-vp-jwt>"}'
# -> {"ok":true,"agentName":"triage","agentDid":"did:key:z6Mk…","reason":"ok"}
```

### Delegations

| Method | Path | Body / Query | Result |
|---|---|---|---|
| POST | `/v1/delegations/request` | `{actorName, task, action, resource, reason, ttlSeconds?}` | `201` record (`404` if agent unknown/unprovisioned) |
| GET | `/v1/delegations` | — | all, newest first |
| GET | `/v1/delegations/{id}` | — | one (`404` if absent) |
| POST | `/v1/delegations/{id}/approve` | `{approver}` | issues the Delegation VC → `{id, status:"approved", vc, vcJti, notAfter}` (`409` if not pending) |
| POST | `/v1/delegations/{id}/deny` | `{approver, reason}` | `{… status:"denied"}` (`409` if not pending) |
| GET | `/v1/delegations/{id}/vc` | — | `{vc}` (the JWT to present at the resource gate; `409` if not approved) |
| GET | `/v1/delegations/check` | `?actor=&task=&action=&resource=` | `{ok, reason, vcJti, notAfter}` — called by the control plane on every regulated egress |

`/v1/delegations/check` returns `ok=true` iff an **approved**, **non-expired**
(`notAfter > now`), **non-revoked** delegation exists matching `actor`, `task`,
`action`, and `resource` (trailing `/*` glob). Otherwise `ok=false` with a `reason`:
`no approved delegation` / `delegation expired` / `delegation revoked`.

```bash
ID=$(curl -s -XPOST localhost:8090/v1/delegations/request -H 'content-type: application/json' -d '{
  "actorName":"triage","task":"INC-42","action":"runbook:read",
  "resource":"runbooks-api:/runbooks/db-failover","reason":"sev1","ttlSeconds":300}' | jq -r .id)
curl -s -XPOST localhost:8090/v1/delegations/$ID/approve -d '{"approver":"alice@oncall"}'
curl -s "localhost:8090/v1/delegations/check?actor=triage&task=INC-42&action=runbook:read&resource=runbooks-api:/runbooks/db-failover"
# -> {"ok":true,"reason":"","vcJti":"…","notAfter":"…"}
```

### Revocation

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/status/{list}` | — | `{"revoked":[<vcJti>,…]}` (default list `default`) |
| POST | `/v1/revoke` | `{vcJti}` | `{revoked:true, vcJti}` |
| GET | `/v1/revocations` | — | `{revoked:[…]}` |

```bash
JTI=$(curl -s localhost:8090/v1/delegations/$ID | jq -r .vcJti)
curl -s -XPOST localhost:8090/v1/revoke -d "{\"vcJti\":\"$JTI\"}"
# the next /v1/delegations/check (and /authz) for that delegation now denies.
```

## 5. Model-broker usage contract (`:8080`)

A thin LiteLLM proxy that holds the provider key and is the choke point for model
egress. Agents call it with a **logical** model name and an OpenAI-compatible payload;
after each completion it POSTs usage back to the control plane's `/v1/usage`.

```bash
curl localhost:8080/v1/chat/completions -H 'content-type: application/json' \
  -H 'x-palonexus-actor: triage-agent' \
  -d '{"model":"model-openai","messages":[{"role":"user","content":"hi"}]}'
```

Logical models: `model-openai` (`openai/gpt-4o-mini`), `model-openai-large`
(`openai/gpt-4o`). Health probes: `GET /health/liveliness`, `GET /health/readiness`.

## Metrics

Exposed on `:8181/metrics`:

| Metric | Type | Labels |
|---|---|---|
| `palonexus_authz_decisions_total` | counter | `service`, `decision` (allow/deny), `rule` |
| `palonexus_authz_duration_seconds` | histogram | `service` |
| `palonexus_token_usage_total` | counter | `agent`, `model` |
| `palonexus_agent_cost_usd_total` | counter | `agent` |

## Related

- [Headers](/docs/reference/headers/)
- [Environment variables](/docs/reference/env-vars/)
- [Credential-safe action enforcement](/docs/concepts/egress-enforcement/)
