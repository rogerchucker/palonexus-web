---
title: Architecture overview
description: The six pillars converging on one /authz decision, the request flow (identity → registry → policy → audit → metrics), and both directions of traffic — ingress and agent egress.
sidebar:
  order: 1
---

PaloNexus is a Kubernetes-native **control layer**: gateway, registry, identity,
policy, observability, and audit unified onto **one request decision**. The trick to
"one control layer" is that all six concerns meet on a **single question** —
*may this caller reach this service?* — answered at the control plane's `/authz`
endpoint. Identity, the registry, and policy converge to answer it; recording the
answer is audit; counting it is observability.

The same decision point governs **agent egress**: every outbound action an agent
takes — a model call, a tool call, or an agent→agent hop — is decided at the *same*
`/authz`, carrying the agent identity and the user it acts for.

## The six pillars, one decision

| Pillar | What it is here | Kubernetes object(s) |
|---|---|---|
| **Gateway** | L7 edge routing; the enforcement point that routes every request through `/authz` | `GatewayClass` / `Gateway` / `HTTPRoute` (Gateway API), implemented by **Envoy Gateway** + `SecurityPolicy.extAuth` |
| **Identity** | **human** SSO (OIDC/JWT) **+** **agent** identity (DID/VC) | **Dex** for human OIDC; **agent-idp** issues each agent a `did:key` under a `did:web` org anchor |
| **Registry** | source of truth for services, upstreams, scopes, agent allowlists, budgets | control-plane `/v1/registry/services` API |
| **Policy** | the allow/deny decision | inline rules in the control plane **+** **OPA** for org-wide Rego (deny-overrides) |
| **Observability** | metrics + traces | control-plane `/metrics`; **OTel Collector** → Prometheus / Tempo / Loki (Grafana LGTM) |
| **Audit** | tamper-evident trail | hash-chained JSON records (`/v1/audit`) |

## The request flow

Envoy's HTTP `ext_authz` filter forwards each incoming request to `/authz` on the
control plane's decision listener (`:9191`). A `200` means allow (the gateway then
routes to the upstream); a `403` means deny. Inside `/authz`
([`internal/authz/authz.go`](https://github.com/)), the six concerns meet in order:

```
 identity  verify the bearer token         (who)
 registry  resolve the target service      (what)
 policy    inline rules + OPA veto         (may they)
 audit     hash-chained record             (prove it)
 metrics   decision counter + latency      (observe it)
```

On an allow, the control plane stamps `X-Palonexus-Subject` and `X-Palonexus-Upstream`
response headers; the gateway forwards those so upstreams trust the edge and never
re-parse the raw token. See [Headers](/docs/reference/headers/) for the full set.

## Two directions: ingress and egress

A request that carries the `X-Palonexus-Actor` header is treated as an **agent egress**
call and takes the egress decision path; everything else is ordinary north-south
**ingress**.

```
 client ──HTTP──▶ Envoy Gateway ──ext_authz──▶ /authz ──▶ upstream (apps)
                                                  │  ingress: who / what / may

 agent ──egress──▶ egress proxy ──▶ /authz ──▶ model broker / tool / peer agent
                                       │  egress: actor + on-behalf-of + task
                                       │  + allowlist + budget + delegation + OPA
```

- **Ingress** answers *may this user/client reach this service?* — identity →
  registry → policy.
- **Egress** answers *may THIS agent, acting for THIS user on THIS task, reach THIS
  target?* — it resolves both the calling agent and the target from the registry,
  then runs an **allowlist → budget → delegation (TBAC) → OPA** decision. Agent
  identity is proven cryptographically (a Verifiable Presentation), not taken from a
  header. See [Egress enforcement](/docs/concepts/egress-enforcement/) and
  [Persistence & identity](/docs/concepts/persistence-and-identity/).

## Design invariants

- **Deny-by-default / fail-closed.** Unknown service, invalid token, target not in
  the agent's allowlist, over budget, missing delegation, or an unreachable OPA all
  deny. Policy is **deny-overrides**: an inline allow plus an OPA deny is a deny.
- **Identity propagation, not token forwarding.** Upstreams trust the edge; they
  read the stamped subject/actor headers and never re-parse tokens.
- **Tamper-evident audit.** Each record hash-chains to its predecessor, so editing
  or deleting an entry breaks the chain — verifiable by recomputation.
- **Same image everywhere.** All configuration is environment-driven; only the
  Kustomize overlay changes between dev and prod. See
  [Environment variables](/docs/reference/env-vars/).

## Where to go next

- [Security & Trust](/docs/concepts/security-and-trust/) — the enterprise security overview: trust boundaries, what we verify, data handling, and compliance posture.
- [Architecture](/docs/concepts/architecture/) — the control-plane spine, listeners, and trust zones.
- [Egress enforcement](/docs/concepts/egress-enforcement/) — the network-layer design.
- [Persistence & identity](/docs/concepts/persistence-and-identity/) — durable state + cryptographic identity.
- [Consoles](/docs/concepts/consoles/) — the operator portal and Grafana.
- [Feature matrix](/docs/concepts/feature-matrix/) — everything the platform does, with status.
