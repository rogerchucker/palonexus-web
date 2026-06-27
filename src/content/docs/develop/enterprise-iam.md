---
title: Enterprise IAM — directory, governance, tokens
description: A hands-on walkthrough of the enterprise-IAM loop on a running agent-idp — sync the directory, resolve sign-ins, govern + activate agents, grant authorized delegations, cascade revocation on lifecycle changes, and mint short-lived agent tokens at the STS, all from the bundled CLIs.
sidebar:
  order: 8
---

The enterprise-IAM layer in `agent-idp` answers a different question than the egress
gate does: not *may this call go out?* but *who, in the org, is this agent acting for,
and does that human actually hold the authority being delegated?* It pulls the
enterprise directory in (SCIM), reconciles sign-ins against it, governs agent
ownership, ties every delegation to a real human authority, cascades revocation when
people leave, and mints short-lived agent tokens that separate the **agent** subject
from the **human** actor.

Each feature ships a small stdlib-only CLI you run against a live `agent-idp`. This
guide walks the whole loop end to end. For the data model and the decision rules see
[Enterprise IAM concepts](/docs/concepts/enterprise-iam/); for the raw endpoints see
the [Enterprise IAM API](/docs/reference/enterprise-iam-api/).

## What you'll do

1. Sync a mock enterprise directory (two tenants) and run lifecycle mutations.
2. Resolve employee sign-ins with token-vs-SCIM precedence.
3. Register, govern, and activate agents behind an activation gate.
4. Grant delegations that must be backed by real human authority.
5. Watch a lifecycle change cascade revocation across owners, delegations, and agents.
6. Mint a short-lived, audience-bound agent token at the STS — and watch denials.

## Prerequisites

A running `agent-idp` on `:8090` and its virtualenv. From the repo root:

```bash
cd agent-idp
python -m venv .venv && . .venv/bin/activate
pip install -e ".[test]"
.venv/bin/uvicorn app.main:app --port 8090
```

The CLIs are stdlib-only HTTP, so they run from the same venv against the local
server, a DOKS port-forward, or any reachable instance. Every CLI honours
`--base` and the `PALONEXUS_IDP_URL` environment variable (default
`http://localhost:8090`):

```bash
export PALONEXUS_IDP_URL=http://localhost:8090   # or a port-forward, e.g. :18090
```

All commands below are run from `agent-idp/` with the venv active.

## 1. Sync the directory

The directory sync pushes a mock SCIM 2.0 snapshot into the IdP and prints a
reconcile report. Two tenants render: **acme-corp** (22 employees, 7 departments,
10 groups, nested reporting lines) and **globex** (6 employees — same display names,
different `oid`s, proving cross-tenant isolation).

```bash
python -m app.directory_cli --tenant all --version 1          # baseline, both tenants
python -m app.directory_cli --tenant all --version 1 --show   # + employee/conflict summary
```

`--show` prints, per tenant, active/inactive counts and any open conflicts. Re-running
the same version is idempotent — everyone comes back `unchanged`, with no duplicate
employees, because each person is keyed by a stable IdP `oid` (the SCIM `externalId`),
never by email.

Eight named personas anchor the scenarios across all six features: **Alice Chen**
(Engineering Manager), **Bob Patel** (SRE), **Maya Singh** (Finance Approver),
**Carlos Rivera** (Security Admin), **Dana Kim** (contractor), **Jordan Lee** (email
change), **Priya Shah** (inactive former employee), and **Morgan Taylor** (manager who
changes departments).

**The v1 → v2 mutation set.** `--version 2` (acme-corp only) applies the lifecycle
events the rest of the demo depends on:

```bash
python -m app.directory_cli --tenant acme-corp --version 2 --show
```

| Event | Who | Effect |
|---|---|---|
| joiner | Priyanka Rao (`oid-1022`) | appears |
| mover | Morgan Taylor (`oid-1008`) | Sales → Data |
| leaver | Hassan Ali (`oid-1017`), Tom Becker (`oid-1015`) | `active=false` |
| rehire | Sofia Russo (`oid-1014`) | inactive → active |
| email change | Jordan Lee (`oid-1006`) | `jordan.lee@` → `jlee@` |
| manager change | Kevin Brooks (`oid-1019`) | re-parented Carlos → Sam Rivera |
| group/entitlement | Bob Patel (`oid-1002`) | leaves on-call, loses the `aws` entitlement |
| conflict | Tom Becker's reports | left `manager_inactive` |

Because the key is the `oid`, the email change updates the person in place — it does
not fork them — and re-running v2 never resurrects a deactivated employee.

## 2. Resolve a sign-in (token ↔ SCIM precedence)

When an employee signs in, the IdP resolves their OIDC token against the synced
directory and applies precedence: **the directory is the source of truth for status
and entitlements; the token never elevates.** The CLI replays decoded login-token
claim sets at `POST /v1/identity/resolve`:

```bash
python -m app.identity_cli                          # resolve every scenario
python -m app.identity_cli --scenario alice-clean   # one scenario
```

The five scenarios exercise each outcome:

| Scenario | Outcome |
|---|---|
| `alice-clean` | token agrees with the directory → resolves, no conflicts |
| `jordan-email-conflict` | token carries the **old** email after the directory changed it → `email_mismatch` conflict, directory wins |
| `carlos-group-conflict` | token asserts a privileged group not granted in the directory → conflict, group **not** honoured |
| `priya-stale-inactive` | token presented for someone the directory deactivated → resolves but `access=DENY (inactive in directory)` |
| `globex-okta` | Okta-format token (`iss`+`sub`) → different IdP subject shape, still links to the right employee |

The deny on `priya-stale-inactive` is the load-bearing one: a stale token must never
make a deactivated employee active.

## 3. Govern + activate agents

Every agent gets a governance record naming an owner (an employee or a team/group), a
business sponsor, a risk tier, and an approved runtime. The agent moves
`draft → pending_approval → approved → active`, and **activation is gated** on the
record being complete.

```bash
python -m app.governance_cli            # register all + drive the ready ones to active + show issues
python -m app.governance_cli --issues   # just the current governance issues
```

The fixtures register five agents and exercise every gate:

| Agent | Owner | Result |
|---|---|---|
| `incident-triage` | Alice Chen (active), full fields | activates |
| `sre-copilot` | team `grp-sre`, full fields | activates (team-owned) |
| `ml-pipeline` | Hassan Ali (active @v1) | activates — then **orphaned** by the v2 sync |
| `hr-bot` | Priya Shah (inactive) | `owner_inactive` — orphaned |
| `finance-helper` | Nina Alex, **missing** sponsor + risk tier | activation **blocked** |

Transfer an agent's ownership (used in §5 to restore an orphaned agent):

```bash
python -m app.governance_cli --transfer ml-pipeline employee entra:acme-corp:oid-1001
```

## 4. Grant authorized delegations

A delegation is an **authorization decision**, not a bare record. The human requester
and approver must both be active employees in the agent's tenant, and the approver must
actually hold authority over the resource/task. The first matching authority basis
wins, and the basis + its evidence are recorded on the delegation (and audited), so
every grant is explainable.

```bash
python -m app.authority_cli   # one grant attempt per authority basis, plus denials
```

The nine scenarios cover the full basis taxonomy and the deny paths:

| Basis | Example | Expect |
|---|---|---|
| `business_sponsor` | Riley Stone (sponsor) → `incident-triage` | allow |
| `service_owner` | Alice Chen (owner) → `incident-triage` | allow |
| `team_owner` | Bob Patel (`grp-sre`) → `sre-copilot` | allow |
| `palo_nexus_admin` | Carlos Rivera (Security = admin) → `incident-triage` | allow |
| `resource_owner` | Lena Park (owns `k8s:ml-namespace`) → `ml-pipeline` | allow |
| `manager_chain` | Alice Chen (manager of Grace) → `sre-copilot` | allow |
| `manual_break_glass` | Maya Singh (break-glass) → `incident-triage` | allow (audited) |
| no authority | Maya Singh → `incident-triage` | **deny** (`authority_denied`) |
| cross-tenant | globex approver → `incident-triage` | **deny** (`cross_tenant`) |

Each `ALLOW` prints the `authority_basis` and `authority_evidence` stamped on the
delegation. Inspect the live grants and the resource-owner map:

```bash
curl -s "$PALONEXUS_IDP_URL/v1/authority/delegations?tenant=acme-corp" \
  | jq '.[] | {agent_id, granted_by, authority_basis, authority_evidence}'
curl -s "$PALONEXUS_IDP_URL/v1/authority/resource-owners?tenant=acme-corp" | jq
```

## 5. Lifecycle revocation cascade

This is where the directory and the delegations meet. Grant delegations while everyone
is active, then run the v2 sync — which disables an owner and an approver — and watch
the cascade automatically revoke authority. Grant the fixture delegations first:

```bash
python -m app.revocation_cli              # grant the fixture delegations
python -m app.revocation_cli --delegations   # list delegations + status + reason
```

Now disable the owner with the v2 sync; the cascade runs automatically as part of the
sync:

```bash
python -m app.directory_cli --tenant acme-corp --version 2
python -m app.revocation_cli --delegations   # see what the cascade changed
python -m app.revocation_cli --log           # the durable revocation log + reason codes
```

The cascade emits exactly one reason code per durable revocation action. The ones the
engine actively emits:

| Reason code | When |
|---|---|
| `owner_inactive` | the agent's owner resolves but is now inactive → agent **suspended**, its active delegations **revoked** |
| `owner_missing` | owner no longer resolves → agent **quarantined** |
| `delegation_grantor_lost_authority` | the `granted_by` approver is now inactive → delegation **invalidated** |
| `group_removed` | the approver left a delegation's `required_group` → delegation **invalidated** |
| `agent_inactive` | the agent is suspended/quarantined/retired → its active delegations **invalidated** |
| `delegation_expired` | the delegation passed its `expires_at` |
| `manual_admin_revocation` | an explicit, attributable admin revoke |

In the fixture set, disabling **Hassan Ali** (owner of `ml-pipeline`) suspends that
agent and revokes its delegation with `owner_inactive`; disabling **Tom Becker** (an
approver) invalidates the delegation he granted with `delegation_grantor_lost_authority`.
The control delegations granted by still-active employees stay active. Governance is
restored only by an explicit ownership transfer (see §3).

## 6. Mint an agent token (STS)

The STS exchanges a valid, human-backed delegation plus the agent's proof-of-possession
for a short-lived, audience-bound EdDSA JWT. The token separates the **agent** subject
(`sub` = `agent:<tenant>:<agent>`) from the **human** actor (`act`), and carries the
`delegation_id`, `task_id`, and a `cnf` proof claim. It is signed with the **existing**
issuer Ed25519 key — there is no new signing key.

```bash
python -m app.sts_cli   # grant → exchange → decode claims → denials → revoke → deny
```

The runner grants a delegation, exchanges it at `POST /v1/sts/token`, decodes the
resulting JWT, then walks the denials. An issued token decodes to claims like:

```json
{
  "sub": "agent:acme-corp:incident-triage",
  "sub_type": "agent",
  "act": "entra:acme-corp:oid-1002",
  "act_type": "employee",
  "aud": "https://runbooks.acme.internal",
  "delegation_id": "…",
  "task_id": "INC-1001",
  "cnf": { "mock_pop_sha256": "…" }
}
```

The STS fails closed at every gate. The runner demonstrates the denials:

- **wrong audience** — the requested `aud` is not in the allowlist (`audience_not_allowed`).
- **bad proof** — the agent proof-of-possession does not bind to the agent (`invalid_proof`).
- **wrong task** — the requested task does not match the delegation (`task_mismatch`).
- **after revoke** — once the delegation is revoked, the STS refuses to mint
  (`delegation_revoked`) — the §5 cascade composes for free.

The default TTL is 600s, capped at 900s. Every outcome — issued or denied — is written
to the durable token audit log (metadata only, never token contents):

```bash
curl -s "$PALONEXUS_IDP_URL/v1/sts/tokens?tenant=acme-corp" \
  | jq '.[] | {decision, reason, agent_id, act, aud, jti}'
```

## The end-to-end demo

Each feature has a self-contained demo script under `scripts/` that sets up the
directory, governs the agents, and narrates the scenario. Point them at any reachable
IdP with `PALONEXUS_IDP_URL`:

```bash
PALONEXUS_IDP_URL=http://localhost:8090 ./scripts/directory-sync-demo.sh
PALONEXUS_IDP_URL=http://localhost:8090 ./scripts/authority-demo.sh
PALONEXUS_IDP_URL=http://localhost:8090 ./scripts/revocation-demo.sh
PALONEXUS_IDP_URL=http://localhost:8090 ./scripts/sts-demo.sh
```

### Running on DOKS

To run the whole loop against the DigitalOcean Kubernetes cluster, reset the demo data
to a clean, known state, then open the port-forwards:

```bash
./scripts/demo-doks-seed.sh      # truncate the demo tables, re-seed directory + governance + delegations
./scripts/demo-portforward.sh    # portal :3000, agent-idp :8090, control-plane :8181, Grafana :3001
```

`demo-doks-seed.sh` wipes **only** the enterprise-IAM demo tables (`idp_employees`,
`idp_groups`, `idp_syncs`, `idp_agent_governance`, `idp_gov_delegations`,
`idp_revocations_log`, `idp_tokens`) — the crypto-egress tables used by the agent hero
flow are left intact — then syncs the directory, governs + activates the agents, grants
a few authorized delegations, replays sign-ins, and runs an initial cascade so the
`hr-bot` orphan shows. The full runbook lives in `docs/DEMO.md` in the platform repo.

## Validating from a UI

The PaloNexus portal surfaces the same state the CLIs drive:

- **Directory** (`/directory`) — the F1 sync result and the F2 sign-in resolutions:
  active/inactive employees, group membership, and the token-vs-SCIM conflicts.
- **Governance** (`/governance`) — F3 ownership and the activation gate, the F4 cascade
  and its reason codes, the F5 authority bases on each delegation, and the F6 token
  audit log.

For the raw API, the `agent-idp` Swagger UI at `:8090/docs` lists every
`/v1/directory`, `/v1/identity`, `/v1/governance`, `/v1/authority`, `/v1/revocation`,
and `/v1/sts` endpoint, ready to try interactively.

## See also

- [Enterprise IAM concepts](/docs/concepts/enterprise-iam/) — the data model and decision rules.
- [Enterprise IAM API](/docs/reference/enterprise-iam-api/) — the endpoint reference.
- [Environment variables § agent-idp](/docs/reference/env-vars/#agent-idp) — config and the tunable in-code constants.
- [Delegations and approvals](/docs/develop/delegations-and-approvals/) — the crypto-egress, human-in-the-loop delegation layer.
