---
title: Operations Overview
description: Operating PaloNexus — one Go binary with three listeners, four trust-zone namespaces, and all configuration as environment variables driven by Kustomize overlays.
sidebar:
  order: 1
---

This section is the **operator's view** of PaloNexus: how the control plane is
built and configured (Go), how it is deployed (Kustomize), how durable state and
cryptographic agent identity are turned on, how agent egress is enforced at the
network layer, how the cloud is provisioned (Terraform on DOKS), and how it is
observed (Grafana LGTM).

If you are *integrating* an agent rather than running the platform, start with
[Deploy an agent](/docs/develop/deploy-an-agent/) instead.

## One binary, three listeners

The whole control layer is a single Go program (`control-plane/main.go`, Go
1.25) that runs as one Deployment but binds **three** HTTP listeners, each with a
different exposure and threat model:

| Listener | Default addr | Env var | Role |
|---|---|---|---|
| **Decision plane** | `:9191` | `DECISION_ADDR` | Envoy `ext_authz` calls `/authz` here on the hot path. A `200` is allow, a `403` is deny. Locked down mesh-only. |
| **Management plane** | `:8181` | `MGMT_ADDR` | Registry API, `/healthz`, `/readyz`, `/metrics`. Exposed to operators and CI separately from the data path. |
| **Egress forward-proxy** | `:9092` | `EGRESS_PROXY_ADDR` | Every outbound agent call (`HTTP(S)_PROXY` in the pod) flows through here, gets a `/authz`-equivalent egress decision, and is forwarded only on allow. **Only started when `AGENT_IDP_URL` is set** — without an identity verifier the proxy can't soundly prove the caller. |

Splitting the listeners lets the data path be mesh-only/mTLS while the management
API is reachable by operators, and keeps the egress proxy off entirely in
configurations that don't gate egress.

Read more in [Control plane (Go)](/docs/operations/control-plane/).

## The trust-zone namespaces

The base manifests lay the platform across four namespaces that double as trust
zones:

| Namespace | What runs there |
|---|---|
| `palonexus` | control-plane, OPA, Dex (human OIDC), the model-broker (LiteLLM), the portal |
| `apps` | the governed agent workloads (the four demo SRE agents) + their egress NetworkPolicies |
| `agent-idp` | the `did:web` agent identity provider (its own namespace so the Service DNS matches its DID) |
| `observability` | Grafana LGTM + the standalone OTel Collector |

## Config is all env vars; overlays do the rest

The **same image is promoted unchanged** across dev/staging/prod. Every behavioural
switch is an environment variable (`OIDC_*`, `OPA_URL`, `AGENT_IDP_URL`,
`REGISTRY_BACKEND`/`REGISTRY_DB_URL`, `AGENT_IDENTITY_MODE`, …). Only the Kustomize
overlay changes:

- **`overlays/dev`** and **`overlays/kind`** strip the three `OIDC_*` env vars →
  anonymous-passthrough (policy still enforces public-vs-private from the
  registry).
- **`overlays/selfhost`** is the cluster-agnostic production overlay; it composes
  the opt-in hardening **components** (`postgres`, `egress-identity-vc`,
  `egress-enforcement`, `egress-sidecar`, `egress-gateway`, `agent-admission`).

See [Self-hosting](/docs/operations/self-hosting/) for the deploy flow,
[Persistence](/docs/operations/persistence/) for durable backends, and
[Egress enforcement](/docs/operations/egress-enforcement-ops/) for the egress
data plane.

## Deployment modes — pick by enforcement fidelity

PaloNexus runs at three fidelities. The same decision spine underlies all three;
what changes is how much of the *enforcement plane* is real. Use this matrix to
pick: evaluate on the left, run production on the right.

| Capability | Offline SDK (`PaloNexus.offline()`) | Docker Compose | DOKS / Kustomize `selfhost` |
|---|---|---|---|
| **Enforcement fidelity** | in-process decision simulation | real control-plane `/authz` decision | real `/authz` **plus** Envoy request forwarding |
| **Envoy `ext_authz` forwarding** | — | decision only (no L7 proxy) | ✅ `SecurityPolicy.extAuth` forwards on allow |
| **OIDC workforce identity** | — | optional (set `OIDC_*`) | ✅ (any OIDC IdP — e.g. Dex, Logto, Okta, Entra ID) |
| **OPA org veto** | — | inline policy only | ✅ `OPA_URL` deny-overrides bundle |
| **Regulated egress / needs-approval (TBAC)** | simulated | ✅ real agent-idp delegation check | ✅ |
| **Cryptographic agent identity (VC mode)** | — | header-trust (`AGENT_IDENTITY_MODE=header`) | ✅ `egress-identity-vc` (VP required) |
| **Network-enforced egress (proxy-only netpol)** | — | — | ✅ `egress-enforcement` + sidecar + admission |
| **Durable Postgres state** | — | ✅ (one instance, two DBs) | ✅ CloudNativePG (HA) |
| **High availability** | — | — | ✅ HA control plane + autoscale pool |
| **Best for** | unit tests, the hero flow, CI | local evaluation, demos | staging / production |

Compose and DOKS share **every env var** — only the orchestration and the opt-in
hardening components differ, so what you prove locally holds in production. Start
with [Docker Compose](/docs/operations/docker-compose/) to evaluate, then graduate
via the [DOKS runbook](/docs/operations/doks-runbook/).

## Pages in this section

1. [Control plane (Go)](/docs/operations/control-plane/) — architecture, ports, the full env-var reference, build/test, fail-closed invariants.
2. [Self-hosting](/docs/operations/self-hosting/) — deploy with Kustomize: prereqs, overlays, opt-in components, secrets.
3. [Docker Compose](/docs/operations/docker-compose/) — the non-Kubernetes evaluation path: the full stack via `docker compose up`, with the allow/deny/needs-approval smoke test.
4. [Persistence](/docs/operations/persistence/) — pluggable registry + agent-idp backends (memory/postgres/mysql/sqlite/mongodb), CloudNativePG.
4. [Egress enforcement (ops)](/docs/operations/egress-enforcement-ops/) — the forward-proxy, proxy-only NetworkPolicies, the admission webhook, the Envoy egress gateway.
5. [Terraform / DOKS](/docs/operations/terraform-doks/) — provision the cluster + DOCR + VPC, costs, ghcr.io alternative.
6. [DOKS runbook — zero to governed agent](/docs/operations/doks-runbook/) — the cold-start path: cluster → Gateway/Envoy CRDs → `kubectl apply -k` → seed → deploy a governed agent → verify allow/deny/needs-approval in ≤30 min.
7. [Observability](/docs/operations/observability/) — Grafana LGTM, the OTel collector, the overview dashboard, DID/VC traces.
