---
title: The authorization model
description: The authority graph behind every decision, the five pillars — accountable ownership, authority-bound delegation, just-in-time access, lifecycle-linked revocation, verifiable authority trail — the three enforcement modes, and the implementation mechanisms beneath them.
sidebar:
  order: 1
---

PaloNexus connects every agent action to an accountable human or service owner, verifies that the delegation is valid, issues narrowly scoped runtime credentials, and enforces that authority when an agent calls a model, tool, application programming interface, sandbox, or another agent.

Agent runtimes decide *how an agent works*. Sandboxes decide *where its code runs*.
**PaloNexus decides what an agent is authorized to do and whose authority it is using.**
It is the authorization and accountability layer between agents and the systems they
act upon — not a runtime, not a sandbox, not an agent framework.

## The authority graph behind every decision

Many systems can intercept a call — gateways, meshes, framework middleware. What makes
a PaloNexus decision different is the **authority graph** it resolves before answering:

```text
human identity
  → organizational role
  → ownership of resource/service
  → authority to delegate
  → agent identity
  → task mandate
  → permitted operation
  → target resource
  → time/risk/budget constraints
  → issued runtime credential
  → recorded action
```

Every **allow** is a statement that this whole chain held at the moment of the call: a
real person (or service owner) with current authority delegated this agent, for this
task, to perform this operation on this resource, within these constraints — and the
decision, the credential it produced, and the outcome are recorded as one verifiable
trail. Every **deny** is a link in that chain failing.

## The five pillars

| Pillar | What it guarantees |
|---|---|
| **Accountable ownership** | Every production agent has an active accountable owner and an organizational sponsor. |
| **Authority-bound delegation** | An agent may receive only authority that an entitled human, group, or service owner is permitted to delegate. |
| **Just-in-time access** | No standing enterprise credentials. Access is issued for one task, target, action set, and short time window. |
| **Lifecycle-linked revocation** | Human and organizational changes cascade immediately into agent access and ownership state. |
| **Verifiable authority trail** | Every action can be traced from the agent to the task, delegation, approver, policy, runtime credential, and target outcome. |

Network enforcement, signed credentials, Decentralized Identifiers, Verifiable
Credentials, Open Policy Agent, Envoy, and Kubernetes are **implementation mechanisms
beneath these pillars** — the how, not the product.

## Three enforcement modes

Authorization is only real if it is enforced where the action happens. PaloNexus is
designed around three enforcement modes:

| Mode | How it works | Status |
|---|---|---|
| **Governed tool** | PaloNexus hosts or wraps a tool; credentials never reach the agent. | SDK governed-tool adapters (LangChain / LangGraph / Deep Agents) work today; a hosted tool gateway is planned. |
| **Token exchange** | PaloNexus issues an ephemeral, scoped token to a trusted runtime component. | The STS in `agent-idp` ships today (short-lived, audience-bound runtime credentials); downstream cloud/SaaS connectors are planned. |
| **Egress gateway** | The agent makes an outbound request through PaloNexus, which authorizes it and injects credentials after the untrusted boundary. | **Shipped — today's primary enforcement.** The Kubernetes egress proxy/gateway below is one implementation of this mode. |

Today's shipped enforcement is **mode 3 (the egress gateway)** plus the SDK adapters;
the Kubernetes forward-proxy/Envoy stack documented in
[Credential-Safe Action Enforcement](/docs/concepts/egress-enforcement/) is one
implementation of it, not the product's identity.

## Enforcement adapters

The decision service is one; the enforcement points are many. Kubernetes is one
adapter, not the product:

```text
PaloNexus authorization service
        |
        +-- SDK enforcement (LangChain / LangGraph / Deep Agents)   works today
        +-- API gateway enforcement (Envoy ext_authz)               works today
        +-- Kubernetes sidecar / service-mesh egress enforcement    works today
        +-- MCP gateway enforcement                                 planned
        +-- sandbox egress enforcement (Agent Sandbox, OpenAI)      planned
        +-- cloud credential broker                                 planned
```

**Working today:** the SDK adapters, Envoy `ext_authz` (ingress and egress), and the
Kubernetes network-layer egress enforcement. **Planned, not yet built:** the MCP
gateway, dedicated sandbox-egress adapters, and the cloud credential broker.

## Implementation mechanisms: one decision point

Beneath the pillars sits a concrete decision engine. The trick is that six
implementation concerns — gateway, identity, registry, policy, observability, and
audit — all meet on a **single question**, answered at the control-plane component's
`/authz` endpoint: *may this agent make this outbound call, on behalf of this human,
for this task, right now?* Every outbound action an agent takes — a model call, a tool
call, or an agent→agent hop — is decided at that `/authz`, carrying the agent identity
and the user it acts for. Identity, the registry, and policy converge to answer it;
recording the answer is the authority trail; counting it is observability.

The same decision point **also** governs **ingress**: every north-south request asks
the same `/authz` — *may this caller reach this service?* That inbound capability is
the foundation egress is built on, not the headline.

| Mechanism | What it is here | Kubernetes object(s) |
|---|---|---|
| **Gateway** | L7 edge routing; the enforcement point that routes every request through `/authz` | `GatewayClass` / `Gateway` / `HTTPRoute` (Gateway API), implemented by **Envoy Gateway** + `SecurityPolicy.extAuth` |
| **Identity** | **human** SSO (OIDC/JWT) **+** **agent** identity (DID/VC is the supported credential format) | **Dex** for human OIDC; **agent-idp** issues each agent a `did:key` under a `did:web` org anchor |
| **Registry** | source of truth for services, upstreams, scopes, agent allowlists, budgets | control-plane `/v1/registry/services` API |
| **Policy** | the allow/deny decision | inline rules in the control plane **+** **OPA** for org-wide Rego (deny-overrides) |
| **Observability** | metrics + traces | control-plane `/metrics`; **OTel Collector** → Prometheus / Tempo / Loki (Grafana LGTM) |
| **Audit** | the verifiable authority trail (hash-chained, tamper-evident) | hash-chained JSON records (`/v1/audit`) |

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

## Two directions: egress and ingress

A request that carries the `X-Palonexus-Actor` header is treated as an **agent egress**
call and takes the egress decision path — the headline case; everything else is
ordinary north-south **ingress**, the foundation it is built on.

```
 agent ──egress──▶ egress proxy ──▶ /authz ──▶ model broker / tool / peer agent
                                       │  egress: actor + on-behalf-of + task
                                       │  + allowlist + budget + delegation + OPA

 client ──HTTP──▶ Envoy Gateway ──ext_authz──▶ /authz ──▶ upstream (apps)
                                                  │  ingress: who / what / may
```

- **Egress** answers *may THIS agent, acting for THIS user on THIS task, reach THIS
  target right now?* — it resolves both the calling agent and the target from the
  registry, then runs an **allowlist → budget → delegation (TBAC) → OPA** decision.
  Agent identity is proven cryptographically (a Verifiable Presentation), not taken
  from a header. See [Credential-Safe Action Enforcement](/docs/concepts/egress-enforcement/) and
  [Agent identity & credentials](/docs/concepts/identity-and-credentials/).
- **Ingress** answers *may this user/client reach this service?* — identity →
  registry → policy. It is the same `/authz`, and the foundation egress builds on.

## Design invariants

- **Deny-by-default / fail-closed.** Unknown service, invalid token, target not in
  the agent's allowlist, over budget, missing delegation, or an unreachable OPA all
  deny. Policy is **deny-overrides**: an inline allow plus an OPA deny is a deny.
- **Identity propagation, not token forwarding.** Upstreams trust the edge; they
  read the stamped subject/actor headers and never re-parse tokens.
- **Verifiable authority trail.** Each record hash-chains to its predecessor, so
  editing or deleting an entry breaks the chain — tamper-evident, verifiable by
  recomputation.
- **Same image everywhere.** All configuration is environment-driven; only the
  Kustomize overlay changes between dev and prod. See
  [Environment variables](/docs/reference/env-vars/).

## Where to go next

- [Security model](/docs/concepts/security-model/) — the enterprise security overview: trust boundaries, what we verify, data handling, and compliance posture.
- [Architecture](/docs/concepts/architecture/) — the decision service's internal shape, listeners, and trust zones.
- [Credential-Safe Action Enforcement](/docs/concepts/egress-enforcement/) — the egress-gateway enforcement mode.
- [Agent identity & credentials](/docs/concepts/identity-and-credentials/) — durable state + cryptographic identity.
- [Consoles](/docs/concepts/architecture/#consoles) — the operator portal and Grafana.
- [Feature matrix](/docs/concepts/feature-matrix/) — everything the platform does, with status.
