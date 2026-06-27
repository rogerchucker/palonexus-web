---
title: Consoles
description: The PaloNexus operator portal (Overview, Registry, Decisions, Audit, Identity, Approvals, Egress Approvals, Agents, Traces) and the embedded Grafana LGTM stack.
sidebar:
  order: 5
---

PaloNexus deliberately splits its UI into focused portals. **None is exposed to the
public internet.** Each is reachable only over your **Tailscale tailnet** (the
production path) or via `kubectl port-forward` (the local fallback). `make port-forward`
opens all of them at once.

| Portal | In-cluster | What it's for |
|---|---|---|
| **Control-plane console** | `svc/portal:3000` (ns `palonexus`) | the operator cockpit — the tabs below |
| **Grafana (LGTM)** | `svc/lgtm:3000` (ns `observability`) | traces with DID/VC attributes (Tempo), decision/latency/token/cost metrics (Prometheus), audit/log search (Loki) |
| **Incy** *(optional backdrop)* | `svc/web` (ns `incy`) | a realistic SRE incident-management app the agents can act against |

## Control-plane console — the tabs

| Tab | Shows | Backed by |
|---|---|---|
| **Overview** | KPIs (decisions, allow/deny, agents, active delegations, tokens/cost) + a live activity feed | `/metrics` + `/v1/audit`, agent-idp |
| **Registry** | every service / agent / model / tool: kind, allowlists, budgets, scopes, data-class | `/v1/registry/services` |
| **Decisions** | allow-vs-deny by target + a live decision table | `/v1/audit` |
| **Audit** | the hash-chained log + **Verify chain** (tamper-evidence) | `/v1/audit`, `/v1/audit/verify` |
| **Identity** | the **did:web** issuer anchor + each agent's **did:key**, capabilities, delegations, revocations | agent-idp `/v1/issuer`, `/v1/agents`, `/v1/delegations`, `/v1/revocations` |
| **Approvals** | the **human-in-the-loop console** — Approve / Deny pending delegations, **Revoke** active ones | agent-idp delegation + revoke APIs |
| **Egress Approvals** | held egress requests (actor DID, target, action, resource, reason, countdown) with Approve / Deny | `/v1/egress/requests` (+ `/approve`, `/deny`) |
| **Agents** | per-agent identity (`did:key`) + allowlist / budget + **what was delegated, by whom, when it expires** + usage | aggregated control-plane + agent-idp |
| **Traces** | embedded Grafana Tempo Explore for DID/VC-tagged spans | Grafana (`GRAFANA_PUBLIC_URL`) |

The **Approvals** and **Egress Approvals** tabs are the two human-in-the-loop
surfaces: Approvals resumes a *delegation* (the regulated DID/VC runbook gate); Egress
Approvals resumes a *held network call* at the egress proxy. Both poll every few
seconds and resume the waiting decision on approve.

The same console also carries the two enterprise-IAM surfaces — **Directory** and
**Governance** — documented under [Enterprise IAM](/docs/concepts/enterprise-iam/). The
Governance tab is where accountable ownership and the revocation cascade are visible: owners,
sponsors, risk and lifecycle per agent, plus delegation authority and token exchange.

![Governance console for tenant acme-corp showing five governed agents (three active, one orphaned, one draft), a governance-issue alert that hr-bot's owner is inactive, a governed-agents table with owner, sponsor, risk and lifecycle columns, and delegation-authority and token-exchange panels](/docs/screenshots/governance.png)

*The Governance console: accountable agent ownership and the revocation cascade — owners,
sponsors, delegations, and short-lived token exchange in one place.*

The **Decisions** tab derives an allow-versus-deny breakdown per target straight from the
audit trail — every bar is a real `ext_authz` verdict:

![Decisions view with an allow-versus-deny bar chart per target (model-openai, scale_deployment, echo, orders, runbooks-operator) above a detailed table of every ext_authz verdict with actor, subject, task, outcome and rule](/docs/screenshots/decisions.png)

*The Decisions console: allow versus deny per target, derived from the audit trail — every
bar is a real `ext_authz` verdict.*

Screenshots of each tab live in `docs/walkthrough/` in the platform repo (e.g.
`01-overview.png`, `04-audit-verify.png`, `05-approvals.png`,
`05b-egress-approvals.png`, `06-identity.png`, `08-traces.png`).

## Grafana (LGTM)

A single-binary `grafana/otel-lgtm` deployment bundles Tempo, Prometheus, and Loki.
The control-plane and agent-idp emit OTLP spans carrying **DID / VC attributes**
(`did`, `vcJti`, decision), so a single agent task shows its model + tool + A2A hops
on one timeline, each decided at the same `/authz` ("one trace, three gates"). The
portal's **Traces** tab embeds the Tempo Explore view.

## Exposure model

- **Tailscale** is the intended access path. The portal and incy ship Tailscale node
  manifests; set `TS_AUTHKEY` (a Secret) to join them to your tailnet. If the auth key
  is absent the deploy still succeeds — a failed/absent tailnet never blocks the
  platform.
- **Port-forward** is the always-available local fallback (`make port-forward`):
  portal `:3000`, control-plane mgmt `:8181`, egress `/authz` `:9191`, agent-idp
  `:8090`, Grafana `:3001`.
- The Envoy **Gateway** (north-south data plane) is a `LoadBalancer` Service — the
  only component intended to take external client traffic, and every request through
  it is gated by `/authz`.

## Related

- [Audit & the HTTP API](/docs/reference/http-api/)
- [Egress enforcement](/docs/concepts/egress-enforcement/)
- [Feature matrix](/docs/concepts/feature-matrix/)
