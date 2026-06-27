---
title: Egress Enforcement (Ops)
description: Operating the egress data plane — the control-plane forward-proxy on :9092, the proxy-only NetworkPolicies and the pod-port gotcha, the admission webhook, the Envoy egress-gateway option, and AGENT_IDENTITY_MODE.
sidebar:
  order: 5
---

The hard part of an agent control plane is **egress**: making every outbound
action an agent takes — model call, tool call, agent→agent hop, external HTTP —
pass through the *same* `/authz` decision carrying agent + on-behalf-of identity.
This page is how you operate that data plane. For the why and the conceptual
model, see [Egress enforcement (concept)](/docs/concepts/egress-enforcement/).

## The control-plane forward-proxy (`:9092`)

The control-plane binary runs a forward proxy on `EGRESS_PROXY_ADDR` (default
`:9092`). Every agent outbound call is routed to it via `HTTP(S)_PROXY` in the
pod. The proxy resolves the target against the registry, runs the **same egress
decision** as `/authz`, and only then forwards — plaintext via a reverse-proxy,
TLS via a `CONNECT` tunnel (TLS stays end-to-end; the proxy never sees plaintext).

The proxy is **only started when `AGENT_IDP_URL` is set** — identity comes from a
Membership VP that the agent-idp verifies (`POST /v1/agents/verify-presentation`),
and without that verifier no sound allow is possible. Decisions are recorded as
`egress.proxy` audit rows (`actor=<agent>`, `service=<target>`, `allow=…`) in the
hash chain, with **deny-by-default**: a target not in the agent's registry
`EgressAllow` list is rejected.

A needs-approval (regulated) target is parked: the proxy **holds** the request on
a pending-approval queue (default 120s) while an operator approves/denies it via
the management API or the portal.

## The `egress-enforcement` component (the floor)

`components/egress-enforcement` turns the app-level egress middleware into a
network guarantee:

- The control plane declares the `egressproxy` container port `9092` and exposes
  the **`egress-proxy` Service** (Service port `:80`, targetPort the pod's
  `9092`).
- All agents get `HTTPS_PROXY`/`HTTP_PROXY` pointing at
  `http://egress-proxy.palonexus.svc.cluster.local`, with the identity authority
  (`agent-idp`), the decision endpoint, DNS, and the kube API in `NO_PROXY`.
- Each agent's egress NetworkPolicy is flipped to **proxy-only**.
- It stamps the `palonexus.io/agent=true` label the admission webhook keys on.

It is framework-agnostic: any HTTP client routed by the proxy env is governed.

### The pod-port vs service-port gotcha

NetworkPolicy enforces the **pod port** (post-DNAT), **not** the Service port. The
`egress-proxy` Service is `:80` but the control-plane pod serves the proxy on
`:9092` — so the proxy-only egress rule must allow **both** ports to the
`palonexus` namespace:

```yaml
- to: [ { namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: palonexus } } } ]
  ports: [ { protocol: TCP, port: 80 }, { protocol: TCP, port: 9092 } ]
```

`9092` is the one that actually matters (the proxy hop); `80` covers the egress
decision alias. Omit `9092` and traffic is silently dropped even though the
Service appears reachable. The full proxy-only set also allows DNS (UDP/TCP 53)
and the agent-idp (`agent-idp` namespace, TCP `8090`).

## The `egress-sidecar` component (the LangChain fix)

`HTTP(S)_PROXY` does not cover everything: `langchain_openai`'s OpenAI client
talks to whatever `base_url` it is given and does **not** consistently honour the
process proxy env — so a model call can leave the pod without traversing the
proxy. The sidecar fixes this:

- Adds a localhost `egress-sidecar` container to each agent pod.
- The agent points its model `base_url` at it (`http://localhost:8788`) — a
  setting the client honours and can't strip.
- The sidecar reads the agent's identity from a shared `emptyDir`
  (`PALONEXUS_IDENTITY_FILE`), mints a **fresh, long-TTL (12h), revocable
  Membership VP per request**, and forwards to the real broker
  (`REAL_BROKER_URL`) **through the egress proxy → `/authz`** (`EGRESS_PROXY_URL`).

This closes two gaps at once: model calls that wouldn't traverse the proxy, and
short-lived VPs expiring mid-run (revocation is still enforced at `/authz`). It
binds `127.0.0.1` only (pod-local), so there is no HTTP readiness probe — the
agent container's readiness gates the pod. **Pair it with `egress-enforcement`**
(it forwards to that component's `egress-proxy`).

## The `agent-admission` webhook (the guarantee)

`components/agent-admission` is a mutating + validating admission webhook scoped to
namespace `apps` and pods labelled `palonexus.io/agent=true`:

- **Mutate (`/mutate`)** — if the agent container lacks `HTTPS_PROXY`, inject the
  egress env (`HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY`) — **byte-for-byte the values
  `egress-enforcement` stamps**, so an admission-mutated pod and a kustomize-patched
  pod are identical. Idempotent. `failurePolicy: Ignore` (a webhook outage won't
  wedge scheduling; the validating webhook + NetworkPolicy floor still apply).
- **Validate (`/validate`)** — resolve the agent name (env `PALONEXUS_AGENT_NAME`
  or label `palonexus.io/agent-name`) and call the agent-idp
  `GET /v1/agents/{name}`. Missing (404) or `provisioned != true` → **admission
  DENIED**. IdP unreachable → fail-open with a warning (a transient IdP outage
  must not block all agent scheduling). `failurePolicy: Fail` (webhook-server down
  → reject).

Server config (flags / env): `-addr` (`:8443`), `-health-addr` (`:8080`),
`-idp-url` (`AGENT_IDP_URL`, default `http://agent-idp.agent-idp.svc.cluster.local:8090`),
`-require-provisioned` (`REQUIRE_PROVISIONED`, default `true` — set `false` to skip
the provisioned check). TLS is self-contained: a one-shot Job generates a
self-signed CA + serving cert into Secret `agent-admission-tls` and patches the
webhook configs' `caBundle` (no cert-manager required).

## The Envoy egress-gateway option

`components/egress-gateway` is the "proper data plane" alternative: a dedicated
Envoy forward proxy in `apps` (`egress-gw.apps.svc:3128`) that decides every
outbound call at the control-plane `/authz` via the **ext_authz HTTP filter** —
the egress mirror of the ingress `SecurityPolicy.extAuth` keystone — and forwards
to any resolved host via a `dynamic_forward_proxy` (DNS) cluster. A non-200 from
`/authz` is a hard deny (fail-closed).

- `https://` targets → the client issues `CONNECT host:443`; Envoy runs ext_authz,
  then opens a raw TCP tunnel (TLS end-to-end).
- `http://` targets → absolute-URI request; ext_authz, then forward.
- `NO_PROXY` keeps the identity bootstrap (`agent-idp`), DNS, and the kube API
  direct — an agent has no VP until provisioned, so the agent-idp call must not be
  proxied (chicken-and-egg).

**Composition:** enable `egress-enforcement` alone for the control-plane
forward-proxy path (the 120s approval hold works there). Add `egress-gateway`
**after** it to re-point the agents' `HTTPS_PROXY` at the Envoy gateway; the
control-plane proxy Service stays up as the no-extra-component fallback. Order in
the overlay matters — list `egress-enforcement` first so the gateway's env patch
wins.

## `AGENT_IDENTITY_MODE`: `header` vs `vc`

| Mode | Behaviour |
|---|---|
| `header` *(default, demo)* | trust `X-Palonexus-Actor`; verify the VP if one is present (defence-in-depth) but don't require it |
| `vc` *(production)* | a verified `X-Palonexus-Agent-VP` is **required** — missing/invalid VP, or an actor-name mismatch, denies. Revoking the agent's Membership VC instantly cuts egress |

`vc` is set by the `egress-identity-vc` component. In `vc` mode, raw header-only
callers (e.g. `scripts/demo.sh`) are denied **by design** — flip back for the
narrated demo with:

```bash
kubectl -n palonexus set env deploy/control-plane AGENT_IDENTITY_MODE=header
```

## Net effect

With `egress-enforcement` + `egress-sidecar` + `agent-admission` (+ optionally
`egress-identity-vc`) on: every outbound agent action — model call (via the
sidecar), tool call, agent→agent hop, external HTTP — is decided at the same
`/authz`, recorded in the hash-chained audit, deny-by-default, with proxy-only
NetworkPolicies and admission-time provisioning checks. See
[Observability](/docs/operations/observability/) to watch the decisions, and
[Persistence](/docs/operations/persistence/) for the durable revocation store that
makes `vc`-mode revocation reliable.
