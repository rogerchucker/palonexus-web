---
title: Control Plane (Go)
description: The PaloNexus control-plane binary — the authz spine, the three listeners, the full environment-variable reference, build/test commands, and the fail-closed invariants you must not break.
sidebar:
  order: 2
---

The control plane is one Go binary (`control-plane/`, module
`github.com/palonexus/platform/control-plane`, Go 1.25). It is the decision
engine where six concerns converge on **one request**: identity, registry,
policy, audit, metrics — plus the egress decision for agent outbound calls.

## The authz spine

Read `internal/authz/authz.go` first — it is the spine; every other package is a
dependency of it. Envoy's HTTP `ext_authz` filter forwards each incoming request
to `/authz`; the handler runs, in order:

1. **`identity.Verify`** — who (bearer JWT vs OIDC JWKS).
2. **`registry.Get`** — what (resolve the target service from the
   `X-Palonexus-Service` header, falling back to Host).
3. **`policy.Evaluate`** — may they (inline rules **then** OPA veto).
4. **`audit.record`** — prove it (hash-chained record).
5. **`metrics`** — observe it (count the decision).

A `200` means allow — the gateway then routes to the upstream and the control
plane stamps `X-Palonexus-Subject` / `X-Palonexus-Upstream` so upstreams trust
the edge and never re-parse raw tokens. Any `403` is a deny.

Agent **egress** calls take a parallel decision path. They are recognised by the
`X-Palonexus-Actor` / `-On-Behalf-Of` / `-Task` / `-Target-Kind` headers (set by
the agent's middleware); the egress evaluator adds agent-specific gates
(allowlist, budget, delegation/TBAC) on top of the same deny-overrides shape. See
[Egress enforcement](/docs/operations/egress-enforcement-ops/) and the
[concept page](/docs/concepts/egress-enforcement/).

## Internal packages

| Package | Responsibility |
|---|---|
| `internal/authz` | the `/authz` handler — the spine |
| `internal/identity` | OIDC/JWKS + bearer-JWT verification (`NewVerifier`) |
| `internal/registry` | service registry + pluggable `Store` backend factory (`NewStore`) |
| `internal/policy` | inline rules + OPA veto (`NewEngine`); egress evaluator |
| `internal/delegation` | delegation/TBAC verifier over HTTP to the agent-idp |
| `internal/agentid` | verifies agent Verifiable Presentations via the agent-idp (`POST /v1/agents/verify-presentation`) |
| `internal/audit` | tamper-evident hash-chained audit log |
| `internal/metrics` | Prometheus counters/histograms |
| `internal/egressproxy` | the `:9092` forward proxy (CONNECT tunnel + reverse-proxy) |
| `internal/egressreq` | the pending egress-approval queue |
| `internal/server` | the management-plane API (registry CRUD, approvals, metrics) |

## The three listeners

```go
decisionAddr    = env("DECISION_ADDR", ":9191")     // ext_authz hot path: /authz, /authz/, /healthz
mgmtAddr        = env("MGMT_ADDR", ":8181")          // registry API + /metrics + probes
egressProxyAddr = env("EGRESS_PROXY_ADDR", ":9092")  // agent forward-proxy (only if AGENT_IDP_URL set)
```

The decision handler is registered on both `/authz` and the `/authz/` subtree:
Envoy's HTTP `ext_authz` prepends its configured path as a prefix, so a request
for `/echo` arrives as `/authz/echo`. The target is resolved from the
header/Host, not the URL path, so any `/authz*` path routes to the handler.

The egress proxy is started **only when `AGENT_IDP_URL` is set** — identity comes
from a Membership VP that the agent-idp verifies, so without that verifier the
proxy cannot make a sound allow and stays disabled (the binary logs
`egress proxy disabled (AGENT_IDP_URL unset)`).

## Environment-variable reference

All configuration is via env vars so the same image runs everywhere. Empty values
generally mean "feature off / fail-closed default".

| Variable | Default | Effect |
|---|---|---|
| `DECISION_ADDR` | `:9191` | decision-plane (`ext_authz`) listen address |
| `MGMT_ADDR` | `:8181` | management-plane listen address (API, `/metrics`, probes) |
| `EGRESS_PROXY_ADDR` | `:9092` | egress forward-proxy listen address |
| `OIDC_ISSUER` | *(empty)* | OIDC issuer URL. Empty → **anonymous passthrough** (dev) |
| `OIDC_AUDIENCE` | *(empty)* | required token audience |
| `OIDC_JWKS_URL` | *(empty)* | JWKS endpoint for token signature verification |
| `OPA_URL` | *(empty)* | OPA data API URL. Empty → **inline policy only** (no OPA veto) |
| `AGENT_IDP_URL` | *(empty)* | agent-idp base URL. Enables VP verification, the delegation verifier, and the egress proxy. Empty → regulated egress needs approval (fail-closed) |
| `AGENT_IDENTITY_MODE` | `header` | `header` trusts `X-Palonexus-Actor` (verifies a VP if present); `vc` **requires** a verified VP |
| `REGISTRY_BACKEND` | *(empty → `memory`)* | registry store backend: `memory` / `postgres` / `mysql` / `sqlite` / `mongodb` |
| `REGISTRY_DB_URL` | *(empty)* | DSN for the chosen registry backend |
| `REGISTRY_DB_TABLE` | *(empty → default)* | table/collection name override |
| `REGISTRY_DB_DATABASE` | *(empty → default)* | database name override |

The `OIDC_ISSUER`/`OIDC_JWKS_URL`/`OIDC_AUDIENCE` trio is what the dev/kind/selfhost
overlays strip (they are the first three env entries) to drop into
anonymous-passthrough. See [Persistence](/docs/operations/persistence/) for the
`*_BACKEND`/`*_DB_URL` details (including the parallel `IDP_STORE_BACKEND`/`IDP_DB_URL`
on the agent-idp).

## Build, test, run

From the repo root (`Makefile`):

```bash
make test     # go test ./...  — policy matrix + audit hash-chain unit tests
make build    # build the control-plane binary
make smoke    # build, boot the binary, exercise allow(200)/deny(403) over ext_authz
make image    # docker build (distroless static, non-root) -> ghcr.io/palonexus/control-plane:dev
make render   # kustomize render the full manifest set (no apply)
make deploy   # kubectl apply -k overlays/dev
```

Run a single Go test:

```bash
cd control-plane && go test ./internal/policy -run TestName -v
```

The image is a static, non-root **distroless** build (`CGO_ENABLED=0`; the
`modernc.org/sqlite` driver is pure Go, so the binary stays static even with the
SQL backends compiled in). It `EXPOSE`s `9191` and `8181`.

## Fail-closed invariants (do not break these)

- **Deny-by-default / fail-closed.** Unknown service, invalid token, unreachable
  OPA all deny. A misconfigured/unreachable **durable registry backend exits the
  process at startup** rather than silently dropping to memory (which would lose
  every registration on a typo).
- **Deny-overrides policy.** Inline allow + OPA deny = deny. Any deny is final.
- **Identity propagation, not token forwarding.** On allow the control plane
  stamps `X-Palonexus-Subject` / `-Upstream`; upstreams trust the edge.
- **Tamper-evident audit.** Each record hash-chains to its predecessor; editing
  or deleting an entry breaks the chain (guarded by the `audit_test.go` chain
  test).
- **Regulated egress without an IdP fail-closed.** With `AGENT_IDP_URL` unset, the
  egress evaluator keeps its `deny + NeedsApproval` default for regulated targets,
  and the egress proxy doesn't even start.
