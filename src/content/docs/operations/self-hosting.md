---
title: Self-Hosting (Kustomize)
description: Deploy the whole PaloNexus control layer with one kubectl apply — prerequisites, the dev/kind/selfhost overlays, the opt-in hardening components and how they compose, and the secrets you provide out-of-band.
sidebar:
  order: 3
---

Deploy the whole control layer — gateway, control plane, identity (Dex +
agent-idp), policy (OPA), model broker, the demo agents, observability (Grafana
LGTM), and the portal — with one `kubectl apply -k`. Local **kind** is the
primary target; **DOKS** is one command via [Terraform](/docs/operations/terraform-doks/).

## Prerequisites (once per cluster)

The gateway pillar depends on the **Gateway API CRDs** and **Envoy Gateway** (the
`GatewayClass` controller that implements `SecurityPolicy.extAuth` — the
enforcement point that routes every request through `/authz`):

```bash
# 1. Gateway API CRDs
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.1.0/standard-install.yaml

# 2. Envoy Gateway (GatewayClass controller + SecurityPolicy)
helm install eg oci://docker.io/envoyproxy/gateway-helm --version v1.1.0 \
  -n envoy-gateway-system --create-namespace
```

You also need `kubectl` + `kustomize` (or `kubectl kustomize`), Docker/Podman, and
a cluster (kind/minikube/k3d locally, or DOKS). If you enable the `postgres`
component, install the [CloudNativePG](https://cloudnative-pg.io) operator first
(see [Persistence](/docs/operations/persistence/)).

## Render with `LoadRestrictionsNone`

The OPA Rego ConfigMap is **generated** from the canonical
`policy/rego/authz.rego` at the repo root (single source of truth), so the build
must allow loading files outside the kustomization directory:

```bash
kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/kustomize/overlays/dev \
  | kubectl apply -f -
```

`make render` prints the full set without applying; `make deploy` applies the dev
overlay.

## kustomize layout

```
deploy/kustomize/
  base/                  # the whole control layer, one apply
    namespace.yaml       # trust zones: palonexus · apps · agent-idp · observability
    gateway/             # GatewayClass/Gateway/HTTPRoute + SecurityPolicy.extAuth (keystone)
    control-plane/       # the decision engine + Services + NetworkPolicy
    policy/opa.yaml      # OPA (org Rego, deny-overrides veto)
    identity/dex.yaml    # Dex OIDC issuer (human SSO)
    observability/       # Grafana LGTM + OTel collector + provisioning + telemetry env
    audit/audit.yaml     # hash-chained audit shipper DaemonSet + cluster audit policy
    agent-idp/           # did:web anchor + onboarding + delegation + revocation
    model-broker/        # LiteLLM proxy holding the provider key; per-agent token/cost
    agents/              # the demo SRE agents + their egress lockdown NetworkPolicies
    portal/              # Next.js operator console (+ Tailscale node)
  overlays/
    dev/                 # local: pins palonexus/control-plane:dev, disables OIDC
    kind/                # single-node kind: dev + numeric UIDs, 1 replica, echo backend
    selfhost/            # cluster-agnostic prod overlay; composes hardening components
  components/            # opt-in: postgres, egress-*, agent-admission, egress-identity-vc
```

## The overlays

| Overlay | Use | Notable behaviour |
|---|---|---|
| `dev` | local cluster (kind/minikube/k3d) | pins the locally-built `palonexus/control-plane:dev`; **strips the three `OIDC_*` env vars** → anonymous passthrough (policy still enforces public-vs-private) |
| `kind` | single-node kind / live demo | dev behaviour + numeric UIDs for restricted PSS, `replicas: 1`, adds the `echo` demo backend. Note kind's default CNI (kindnet) does **not** enforce NetworkPolicy — the egress lockdown is advisory there; the `/authz` gate still enforces |
| `selfhost` | your cluster (DOKS/EKS/GKE/on-prem) | cluster-agnostic; defaults images to `ghcr.io/palonexus/*:dev`; anonymous-passthrough egress; the place you turn on the hardening **components** |

The dev/kind/selfhost overlays all strip the same three env entries (`OIDC_ISSUER`,
`OIDC_JWKS_URL`, `OIDC_AUDIENCE`) to enter anonymous passthrough. Same image
everywhere — only the overlay differs.

:::note[Wire your own IdP for production]
Anonymous passthrough is fine for evaluation, but production should verify human
identity against your workforce IdP. Enable the `oidc` component (below) to point the
control plane at **your** issuer — **Logto** (the first supported IdP), Okta, Entra ID, or
any OIDC provider. Agent *egress* identity (DID/VC) is independent and already on. Full
steps: [Bring your own IdP](/docs/operations/bring-your-own-idp/).
:::

## The opt-in hardening components

Production hardenings ship as Kustomize **components** you list in the selfhost
overlay's `components:` block. They compose; enable as many as you want:

```yaml
# deploy/kustomize/overlays/selfhost/kustomization.yaml
components:
  - ../../components/postgres            # durable registry + agent-idp store (CloudNativePG)
  - ../../components/egress-identity-vc  # require a verified VP on agent egress (AGENT_IDENTITY_MODE=vc)
  - ../../components/egress-enforcement  # route ALL agent egress through the proxy -> /authz + proxy-only netpol
  - ../../components/egress-sidecar      # per-agent localhost sidecar (langchain model-egress fix), fresh 12h revocable VP
  - ../../components/egress-gateway      # OPTIONAL Envoy egress data plane (ext_authz -> /authz)
  - ../../components/agent-admission     # webhook: inject proxy env + reject un-provisioned agent pods
  - ../../components/oidc                # wire YOUR IdP (Logto/Okta/Entra); DELETE the OIDC-strip patch when enabled
```

| Component | What it does |
|---|---|
| `postgres` | provisions two CloudNativePG `Cluster`s (one per component) and wires the DSN from the generated `*-app` secret. Requires the CNPG operator. → [Persistence](/docs/operations/persistence/) |
| `egress-identity-vc` | sets `AGENT_IDENTITY_MODE=vc`: every agent egress call must carry a verified Verifiable Presentation; the spoofable `X-Palonexus-Actor` header is no longer trusted alone |
| `egress-enforcement` | the floor: control-plane exposes the `egress-proxy` (pod port `9092`, Service alias `:80`); agents get `HTTPS_PROXY`/`HTTP_PROXY` pointing at it; egress NetworkPolicies flip to **proxy-only** |
| `egress-sidecar` | adds a localhost `egress-sidecar` to each agent pod so `langchain_openai`'s `base_url` (which it can't strip) routes through the proxy; mints a fresh long-TTL (12h) revocable VP per request. **Pair with `egress-enforcement`** |
| `egress-gateway` | optional transparent Envoy forward-proxy (`egress-gw.apps.svc:3128`) deciding every call via the `ext_authz` filter — the egress mirror of the ingress keystone |
| `agent-admission` | mutating + validating webhook: injects the proxy env at admission and **rejects** agent pods whose agent isn't registered+provisioned at the IdP. Self-contained TLS-bootstrap Job (no cert-manager) |
| `oidc` | wires your enterprise IdP (Logto first-supported / Okta / Entra / any OIDC) as human sign-in — re-adds `OIDC_ISSUER`/`OIDC_JWKS_URL`/`OIDC_AUDIENCE` pointing at your issuer. **Enabling it requires deleting the anonymous-passthrough strip patch** (they conflict). → [Bring your own IdP](/docs/operations/bring-your-own-idp/) |

### Order matters

- List **`egress-sidecar` after / alongside `egress-enforcement`** — the sidecar
  forwards to the `egress-proxy` Service that `egress-enforcement` provides.
- List **`egress-gateway` after `egress-enforcement`** so the gateway's
  `HTTPS_PROXY`/`NO_PROXY` patch wins (last patch applied) and agents dial the
  Envoy gateway instead of the control-plane proxy.
- `agent-admission` needs its TLS-bootstrap Job (self-contained).

Render-check the composed stack before applying:

```bash
kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/kustomize/overlays/selfhost
```

Full operational detail in [Credential-safe action enforcement (ops)](/docs/operations/egress-enforcement-ops/).

## Secrets to provide out-of-band

These are intentionally **gitignored** and not in the rendered set — apply them
separately. The deploy still succeeds without them (the broker won't serve model
calls; agent-idp generates an ephemeral dev key).

| Secret | Namespace | What |
|---|---|---|
| `model-broker-secrets` (`OPENAI_API_KEY`) | `palonexus` | the real provider key for the broker — the only place it lives. No provider key is ever in an agent pod |
| agent-idp issuer key (`ISSUER_PRIVATE_KEY_B64`) | `agent-idp` | the `did:web` issuer Ed25519 private key — must be stable across restarts. If unset, agent-idp generates one and warns (dev only) |
| `portal-ts-auth` (`TS_AUTHKEY`) | `palonexus` | optional Tailscale auth key for portal tailnet ingress; deploy succeeds without it (use port-forward) |

```bash
cp deploy/kustomize/base/model-broker/secret.example.yaml \
   deploy/kustomize/base/model-broker/secret.yaml          # edit OPENAI_API_KEY
kubectl apply -f deploy/kustomize/base/model-broker/secret.yaml
```

## Local: kind

```bash
make test          # policy matrix + audit hash-chain (no cluster)
make smoke         # boots the binary, exercises allow(200)/deny(403)

make image                                            # palonexus/control-plane:dev
kind load docker-image palonexus/control-plane:dev    # or push to your registry
make deploy                                           # kubectl apply -k overlays/dev
make render                                            # print full manifest set (no apply)
```

`make demo-up` brings the whole platform up on a local kind cluster in one shot.

## Troubleshooting common deploy failures

Most first-deploy failures are one of a handful of fail-closed gates doing their
job. Symptom → cause → fix:

| Symptom | Likely cause | Fix |
|---|---|---|
| `kubectl apply` errors on `Gateway`/`HTTPRoute`/`SecurityPolicy` kinds; `/authz` never on the path | Gateway API CRDs / Envoy Gateway not installed first | Run the [Prerequisites](#prerequisites-once-per-cluster) — CRDs **then** the Envoy Gateway helm release, before any platform manifest |
| `kustomize` build fails reading `policy/rego/authz.rego` | rendered without `LoadRestrictionsNone` (the Rego ConfigMap is generated from outside the kustomization dir) | Add `--load-restrictor LoadRestrictionsNone` to the `kubectl kustomize` call |
| Pod `CrashLoopBackOff` / `exec format error` | image arch mismatch — amd64 DOKS nodes pulling an arm64 build | Build `--platform linux/amd64` (or multi-arch `buildx`); the DOKS pool is amd64 |
| Allowed model call returns no completion though deploy is green | `model-broker-secrets` (`OPENAI_API_KEY`) absent — **fail-closed by design** | Apply the model-broker Secret; deploy intentionally succeeds without it |
| VCs stop verifying after an agent-idp restart | no stable `ISSUER_PRIVATE_KEY_B64` → ephemeral dev key regenerated | Provide the `agent-idp-secrets` issuer Secret (see [Secrets](/docs/operations/secrets/)) |
| `kubectl get gateway` ADDRESS blank / Service stuck `<pending>` | LoadBalancer still provisioning on DO (can take minutes) | Wait, or `kubectl port-forward` to stay moving; confirm `PROGRAMMED=True` |
| Portal `/settings/seed` → `ENOENT` on `python3` (only when using the optional Logto demo seed) | plain `node:*` portal image without the bundled `seed-logto` + Python | Use the bundled portal image, or seed from the CLI ([DOKS runbook Step 4](/docs/operations/doks-runbook/#step-4--seed-the-demo-identity-model)) — or skip the demo seed entirely and bring your own OIDC/SCIM IdP ([IdP Support Model](/docs/concepts/enterprise-iam/#idp-support-model)) |
| Egress lockdown not enforced on `kind` | kindnet CNI doesn't enforce NetworkPolicy (advisory only) | Expected on kind; the `/authz` gate still enforces. Use a NetworkPolicy-enforcing CNI (DOKS = Cilium) in production |

## DOKS / any cluster

```bash
# One command: build+push images, deploy the selfhost overlay, create secrets,
# register agents/tools/model — against the current kube-context.
REGISTRY="registry.digitalocean.com/<your-docr>" OPENAI_API_KEY="sk-..." \
  make install-selfhost
```

`install-selfhost` works against **any** cluster (the current kube-context), not
just DOKS. To provision the DOKS cluster + registry itself, see
[Terraform / DOKS](/docs/operations/terraform-doks/).
