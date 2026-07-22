---
title: Operate the Command Center
description: The portal Overview as the Authority Command Center — the verifiable authority trail badge, the agent fleet joined to accountable owners via SCIM, the live enforcement feed with deciding-layer and delegation chips, the allow/deny counters, plus access paths and current scope limits.
---

The portal's **Overview** tab is the **Authority Command Center**: one screen that
answers, for the whole governed fleet, the questions an enterprise security team
actually asks — **which agent** acted, on **whose authority**, **who approved** it,
**was the approver entitled** to approve, **what credential** was issued, and **was
it later revoked**. Every number on the screen is derived from live control-plane
and agent-idp state; nothing is a cached report.

This page is the operator's guide to reading it: the four panels, what each number
means, the chip vocabulary on the enforcement feed, what the verify badge does (and
does not) prove, how to reach the portal, and the current scope limits.

## The four panels

### 1. Verifiable authority trail

The strip at the top runs a **live hash-chain verification** — `GET /v1/audit/verify`
on the control plane recomputes the chain over the decision records it holds and the
badge reports one of three states:

| State | Meaning | Operator action |
|---|---|---|
| **Chain verified** (green) | every held record hash-links correctly to its predecessor | none — steady state |
| **Chain broken at seq N** (red) | the recomputation failed at sequence `N` — a record was edited, deleted, or corrupted after the fact | treat as an integrity incident; correlate seq `N` against the durable Loki copy |
| **Verification unavailable** (amber) | the verify endpoint could not be reached or did not answer | investigate control-plane health; **do not** read this as "verified" |

The badge is **fail-closed**: an unreachable verify endpoint is never rendered as
green. Amber means *unknown*, and unknown is not verified.

### 2. Agent fleet & accountable ownership

Backed by agent-idp's governance summary (`GET /v1/governance/summary`), which joins
the agent fleet to the **SCIM-synced workforce directory** live — owners and
departments come from the same directory sync that drives the
[revocation cascade](/docs/concepts/enterprise-iam/), not from a static label.

- **Totals** — agents overall, **governed** (accountable owner resolved and active)
  vs **ungoverned**.
- **Posture** — each agent lands in exactly one bucket, with a fixed precedence:
  **`owner_inactive` wins** over the others (an agent whose accountable human has
  left or been suspended is the finding you act on first), then **`blocked`**, then
  **`active_healthy`**. **Retired agents are excluded** from posture — they are not a
  risk finding, they are done.
- **By owner / by department** — bar breakdowns from the live directory join, with
  three deliberate sentinel buckets rather than silent misattribution:

| Sentinel bucket | Meaning |
|---|---|
| **`(unattributed)`** | the agent's owner reference could not be resolved in the directory — an accountability gap to close |
| **`(team-owned)`** | the owner is a **group**, counted as the group; ownership is **never inferred from group members** |
| **`(unassigned)`** | the owning employee resolved but carries no department in the directory |

If `(unattributed)` is non-zero, that is the panel's headline finding: an agent is
running without a resolvable accountable human. See
[Connect agents to enterprise authority](/docs/concepts/enterprise-iam/) for how
ownership is established and enforced.

### 3. Live enforcement feed

A rolling feed of decision records, each carrying chips that name *which layer
decided* and *on what authority*:

- **Rule chip** — the deciding layer for the record, one of:

| Chip | The decision turned on |
|---|---|
| `identity` | credential verification — the JWT / Verifiable Presentation (VP) itself |
| `registry` | caller or target resolution — unknown service, agent, or target |
| `inline` | the control plane's inline rules — scope, allowlist, budget |
| `opa` | the org-wide Open Policy Agent (OPA) Rego veto (deny-overrides) |
| `delegation` | the task-scoped, human-approved delegation check |

- **Task chip** — the task the action was scoped to (e.g. `INC-4821`).
- **Delegation chip** — on **delegation-allowed egress** records only, the record
  carries the delegation id and expiry (`delegationId` / `delegationExp`, epoch
  seconds). The chip shows the short delegation id, links into the **Authority
  Delegation** tab, and renders a **live countdown to expiry** — you can watch a
  temporary elevation approach its cutoff in real time. This is the same delegation
  minted in the [temporary elevation walkthrough](/docs/develop/guides/temporary-elevation-walkthrough/).

A deny with an `opa` chip and a deny with a `delegation` chip are different
conversations — the chip tells you which layer to go look at before you touch
anything.

### 4. Allow / deny counters

The footer counts allows and denies from the control plane's Prometheus decision
counters (`palonexus_authz_decisions_total`). Deny-by-default means a flat, non-zero
deny baseline is *normal*; a **change** in the rate is the signal — see
[Observability](/docs/operations/observability/) for the PromQL, SLO baselines, and
alert examples.

## What the verify badge proves — and what it does not

The green badge proves **hash-chain integrity of the decision records the control
plane currently holds**: each record links to its predecessor, so any after-the-fact
edit or deletion inside that window breaks the chain at a named sequence number.

It is explicitly **not** a claim of "tamper-proof audit of everything":

- It covers the control plane's **in-memory ring of the last 1000 records** — the
  durable copies are shipped to Loki by the audit-shipper (see
  [Observability](/docs/operations/observability/)) and are not what the badge
  recomputes.
- It proves the records were not altered **after being written**; it says nothing
  about events that never produced a decision record.
- Amber (unavailable) is an unknown, never an implicit pass — the badge fails
  closed, matching the platform-wide
  [deny-by-default invariant](/docs/concepts/architecture/#design-invariants).

## Access

The portal is **not exposed to the public internet** and has **no login of its own
today**. Reachability is the access control:

- **Tailnet (production path)** — the portal ships a Tailscale node manifest; with
  `TS_AUTHKEY` set it joins your tailnet and is reachable at its tailnet name
  (e.g. `http://portal.<your-tailnet>.ts.net`).
- **Port-forward (always-available fallback):**

```bash
kubectl -n palonexus port-forward svc/portal 8080:3000
# → http://localhost:8080
```

See [Self-hosting](/docs/operations/self-hosting/) for the full exposure model and
the rest of the consoles.

## Scope limits

Stated plainly, so you can plan around them:

- **The explorer window is the ring.** The in-portal audit explorer reads the
  control plane's in-memory ring — the **last 1000 decision records**. Durable
  history lives in **Loki** (`service.name=control-plane-audit`); query it through
  Grafana for anything older.
- **No alerting or paging.** The Command Center is a live console, not an alerting
  system — nothing pages you. Build alerts on the Prometheus metrics
  ([Observability](/docs/operations/observability/) has samples).
- **No portal sign-in / SSO yet.** Access is tailnet-or-port-forward only; portal
  SSO is planned (see the [feature matrix](/docs/concepts/feature-matrix/)). Do not
  expose the portal Service publicly.

## Related

- [Architecture § Consoles](/docs/concepts/architecture/#consoles) — every portal tab and what backs it
- [Temporary elevation walkthrough (INC-4821)](/docs/develop/guides/temporary-elevation-walkthrough/) — the flow whose delegation chip and countdown you see on the feed
- [Observability](/docs/operations/observability/) — metrics, Loki audit shipping, alert baselines
- [Connect agents to enterprise authority](/docs/concepts/enterprise-iam/) — ownership, SCIM sync, and the revocation cascade behind the fleet panel
