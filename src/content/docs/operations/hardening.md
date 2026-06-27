---
title: Production hardening
description: The checklist that turns the dev/demo overlay into a production posture — OIDC on, AGENT_IDENTITY_MODE=vc, OPA veto, NetworkPolicy egress-only-to-proxy, admission webhook, Postgres backends, audit retention, mTLS, and rate limits — each with the exact config that enables it.
sidebar:
  order: 12
---

The dev and demo overlays deliberately run **open** (anonymous passthrough, header-trust
identity, in-memory stores) so the platform is easy to narrate. Production flips each of those to
the strict setting. This is the checklist — every item links to the exact env var or Kustomize
component that turns it on, and to the invariant in the [security model](/docs/concepts/security-model/)
it enforces.

Hardenings ship as composable Kustomize **components** you list in the selfhost overlay; enable as
many as you want:

```yaml
# deploy/kustomize/overlays/selfhost/kustomization.yaml
components:
  - ../../components/postgres            # durable registry + agent-idp store
  - ../../components/egress-identity-vc  # AGENT_IDENTITY_MODE=vc — require a verified VP
  - ../../components/egress-enforcement  # route ALL agent egress through the proxy + proxy-only netpol
  - ../../components/egress-sidecar      # per-agent VP sidecar (langchain model-egress fix)
  - ../../components/egress-gateway      # optional transparent Envoy egress data plane
  - ../../components/agent-admission     # reject un-provisioned agent pods; inject proxy env
```

## The checklist

Tick each box as you flip it from the dev/demo default to the strict setting. The
**Owner** column is the responsibility split (Ops = cluster/secrets/rollout,
Dev = policy/identity wiring) per the platform's working model.

| ✓ | # | Harden | Owner | How | Enforces |
|---|---|---|---|---|---|
| ☐ | 1 | **OIDC on** (human auth) | Ops + Dev | Set `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL` on the control-plane (the dev/kind/selfhost overlays **strip** these → anonymous). Restore them for real human identity. | deny-by-default for ingress |
| ☐ | 2 | **Cryptographic agent identity** | Dev | `AGENT_IDENTITY_MODE=vc` (component `egress-identity-vc`): every agent egress must carry a verified Membership [VP](/docs/getting-started/glossary/#vp); the spoofable `X-Palonexus-Actor` header is no longer trusted alone. | identity propagation, not header-trust |
| ☐ | 3 | **OPA org veto** | Dev | Set `OPA_URL` so the inline allow is subject to the org Rego bundle (`policy/rego/authz.rego`, deny-overrides). Unreachable OPA **fails closed**. | policy is deny-overrides |
| ☐ | 4 | **Egress enforced at the network** | Ops | Component `egress-enforcement`: agents get `HTTPS_PROXY`/`HTTP_PROXY` at the proxy and egress NetworkPolicies flip to **proxy-only** (DNS + agent-idp + the proxy, nothing else). | every egress through `/authz` |
| ☐ | 5 | **langchain model-egress closed** | Ops + Dev | Component `egress-sidecar` (pair with #4): a localhost sidecar carries a fresh, revocable VP for `langchain_openai`, which strips proxy env. | no un-governed model calls |
| ☐ | 6 | **Admission guarantees the wiring** | Ops | Component `agent-admission`: a webhook injects the proxy env and **rejects** pods whose agent isn't registered + provisioned at agent-idp. | no un-provisioned agents run |
| ☐ | 7 | **Durable, shared state** | Ops | Component `postgres` (+ CNPG operator): `REGISTRY_BACKEND=postgres` / `IDP_STORE_BACKEND=postgres`. In-memory is per-replica and lost on restart — and revocation must survive. | revocation/registrations survive restarts |
| ☐ | 8 | **Audit retention** | Ops | Ship the hash-chained audit to durable storage with a retention window (Loki retention / object-storage lifecycle). | tamper-evident audit, kept |
| ☐ | 9 | **Backups + restore drill** | Ops + QA | Schedule CNPG backups; run the [restore drill](/docs/operations/backups/) so `verify_chain()` passes on restored data. | provable recovery |
| ☐ | 10 | **mTLS on the data path** | Ops | Run the decision/egress path mesh-only (the two-listener split lets you lock `:9191` to mesh and expose `:8181` separately); add mTLS via your mesh (Envoy/Istio/Linkerd). | edge-trust, no token re-parsing |
| ☐ | 11 | **Rate limits** | Ops + Dev | Apply per-agent **budgets** (`callsPerHour`/`tokensPerHour` on the registry entry) and gateway-level rate limits via Envoy `SecurityPolicy`. | contain runaway loops ([budget recipe](/docs/develop/recipes/budget-exhaustion/)) |
| ☐ | 12 | **Restricted PSS + numeric UIDs** | Ops | Run under the restricted Pod Security Standard (the `kind` overlay's numeric-UID pattern); non-root, read-only rootfs where possible. | least-privilege workloads |
| ☐ | 13 | **Secrets out-of-band** | Ops | No secret in an image; deliver via External Secrets / sealed-secrets; keep the **issuer key stable**. | [Secrets](/docs/operations/secrets/) |

## Verify the posture

After enabling the components, render-check and smoke-test:

```bash
# Composed stack renders cleanly:
kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/kustomize/overlays/selfhost

# Identity is now enforced: header-only egress must be denied in vc mode.
#   expect 403 X-Palonexus-Deny-Reason: verified agent credential required
# Raw curl through the proxy must be blocked:
#   expect 407 X-Palonexus-Deny-Reason: agent identity required
```

Cross-check each deny against the [troubleshooting catalog](/docs/develop/troubleshooting/) — in a
hardened cluster you should be able to *produce* `verified agent credential required`,
`agent identity required`, and `opa unavailable` on demand, proving each gate is live.

:::note[kind caveat]
kind's default CNI does **not** enforce NetworkPolicy, so #4's lockdown is advisory there — the
`/authz` gate still enforces, but use a NetworkPolicy-enforcing CNI in production.
:::

## Order matters

- List **`egress-sidecar` after/alongside `egress-enforcement`** (the sidecar forwards to the
  proxy that enforcement provides).
- List **`egress-gateway` after `egress-enforcement`** so its proxy-env patch wins.
- `agent-admission` brings its own self-contained TLS-bootstrap Job (no cert-manager).

## Related

- [Security & Trust](/docs/concepts/security-and-trust/) — the enterprise overview this checklist hardens toward.
- [Self-hosting — the opt-in hardening components](/docs/operations/self-hosting/#the-opt-in-hardening-components).
- [Security model](/docs/concepts/security-model/) — the invariants this checklist turns on.
- [Persistence](/docs/operations/persistence/) · [Secrets](/docs/operations/secrets/) · [Backups](/docs/operations/backups/).
