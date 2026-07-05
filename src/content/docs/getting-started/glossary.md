---
title: Glossary
description: Every acronym and term used across the PaloNexus docs — DID, VC, VP, TBAC, Membership/Delegation VC, on-behalf-of, deny-by-default, ext_authz, HITL, and more.
sidebar:
  order: 7
---

The vocabulary the rest of the docs assume. Terms are grouped, but you can read any entry on
its own.

## Identity & credentials

**DID — Decentralized Identifier.** A self-describing identifier of the form `did:<method>:…`
that resolves to a public key. PaloNexus uses two methods:

- **`did:key`** — a self-certifying DID where the identifier *is* the public key. Agents are
  `did:key`, minted at startup, resolvable 100% offline (no registry, no network).
- **`did:web`** — a DID anchored in DNS + web PKI, resolved over HTTPS from
  `/.well-known/did.json`. The issuer / trust root is `did:web` (rotatable by publishing a
  new key). No blockchain is involved.

**VC — Verifiable Credential.** A signed, tamper-evident claim about a subject. PaloNexus
issues VCs as **JWT-VC** (a VC encoded as an EdDSA-signed JWT). Three kinds appear in these
docs:

- **Membership VC** — issued by the trust root to an agent, proving it is an enrolled member
  of the org. Held by the agent after `agent.provision()`.
- **Delegation VC** — issued when a human approves a task-scoped delegation; it encodes
  *who* delegated *what* action on *what* resource, time-boxed. Present on a
  `Delegation` once its `status` is `approved`.
- **Capability VC** — a credential granting a specific capability to an agent.
- **Compliance Credential** — a named-standard attestation (GDPR, HIPAA, SOC2-TypeII,
  EU-AI-Act-Art50) about an agent, issued by a `compliance_auditor`-role human as a real,
  signed `did:web` JWT-VC. Self-attested — PaloNexus verifies the signature and revocation
  status, not the underlying audit claim. See
  [Governance credentials](/docs/concepts/verifiable-credentials/).
- **Provenance Credential** — a self-declared attestation of what produced an agent's
  outputs (base model, training-data lineage, declared owner), issued by a
  `provenance_attestor`-role human. A routine model update **supersedes** the prior
  credential (no cascade); an explicit revoke does cascade. See
  [Governance credentials](/docs/concepts/verifiable-credentials/).

**VP — Verifiable Presentation.** A holder-signed wrapper an agent builds *fresh* on each
egress call: the agent signs (with its `did:key`) over an audience + nonce, wrapping its
Membership VC. It proves *who is calling, right now* without forwarding a raw bearer token.
Carried in the `X-Palonexus-Agent-VP` header (or `Proxy-Authorization` at the egress proxy).

**JWT-VC.** A Verifiable Credential serialized as a JSON Web Token, signed with EdDSA
(Ed25519). The wire format for every VC above.

**StatusList / StatusList2021.** A compact, verifiable revocation list. A credential carries
a position in the list; the `/authz` decision point checks it so a revoked credential is
rejected immediately — this is what makes **live revocation** mid-run possible.

**Subject (stable subject).** The durable enterprise identifier for a human, from the
directory sync — **not** their email. The SDK's `HumanOwner.subject` is this value; emails
can change, the subject does not.

**did:key / did:web** — see **DID** above.

## Authorization model

**`/authz`.** The single authorization decision point. Identity + registry + policy converge
to answer one question — *may this caller reach this target?* — for both ingress and agent
egress. Returns `200` (allow), `401` + needs-approval (delegation required), or `403` (deny).

**ext_authz.** Envoy's external-authorization filter — the mechanism that routes every
request to one decision point, `/authz`, before it reaches an upstream. The decision it
asks is the **agent-egress question** — *may this agent make this call, on behalf of this
human, for this task, right now?* — and the *same* `/authz` answers it for north–south
ingress too (the foundation egress governance builds on). Either way there's no
per-service auth code, just one place to reason about access.

**Deny-by-default.** The platform's default answer is **no**. Unknown agent, invalid or
missing credential, expired delegation, target not allowlisted, or an unreachable decision
point all deny. Access is granted only by an explicit, current allow.

**Fail-closed.** When the decision point itself is unreachable, the system **denies** rather
than assuming allow. In the SDK this surfaces as a raised `ControlPlaneUnavailable` — never a
silent success.

**TBAC — Task-Based Access Control.** Authorization scoped to a *task* (an incident, thread,
or run id, e.g. `INC-4821`) rather than a standing role. A delegation is granted for one task
and times out — the agent does not keep the privilege afterward.

**On-behalf-of.** An agent never acts as itself for regulated work; it acts *on behalf of* a
human subject. The control plane records both the **actor** (agent) and the **subject**
(human). Carried in the `X-Palonexus-On-Behalf-Of` header.

**Delegation.** A task-scoped, human-approved, time-boxed grant letting an agent perform a
specific action on a specific resource. Modeled by `Delegation`; states are
`pending → approved | denied | expired | revoked`.

**Membership VC / Delegation VC / Capability VC** — see **VC** above.

**OPA — Open Policy Agent.** The policy engine holding the org-wide Rego bundle. Policy is
**deny-overrides**: an inline allow plus an OPA deny equals deny (OPA can veto, never
rubber-stamp).

**Rego.** OPA's policy language; the org policy bundle (`authz.rego`) is written in it.

**Registry.** The catalog of services/targets an agent may reach, each with an owner, an
upstream, a `dataClass`, and a verbatim `requireScope`. `/authz` resolves the target here.

**`requireScope`.** The exact scope string a registry target demands. Must match the SDK's
`CONTROL_PLANE_SERVICES` mapping verbatim (guarded by a parity test) so the model and the
enforced system never drift.

**dataClass.** A target's sensitivity: `public` | `internal` | `regulated`. Regulated
targets drive the needs-approval path.

## Governance & authority

**Owner / Sponsor / Approver / Operator / Auditor.** The five human roles around a governed
agent. Every agent must have an **owner** (accountable) and a **sponsor** (business backing)
— the no-orphaned-agents rule. An **approver** authorizes delegations, an **operator** runs
the agent, an **auditor** reviews its trail.

**`compliance_auditor` / `provenance_attestor`.** Two narrower, credential-issuing roles,
distinct from the general **auditor** above: `compliance_auditor` may issue/revoke Compliance
Credentials, `provenance_attestor` may issue/revoke Provenance Credentials. Deliberately
separate roles — the person who knows an agent's model lineage is often not its compliance
auditor or its business owner. See
[Governance credentials](/docs/concepts/verifiable-credentials/).

**`org:agents:*`.** The org-scope authority strings carried on org roles:
`org:agents:own`, `:sponsor`, `:approve`, `:operate`, `:audit`. `HumanOwner.agent_authority`
is derived from these.

**Governance (no-orphaned-agents).** The rule that registration requires a mandatory owner
and sponsor. Violations raise `GovernanceError` client-side before any network call, and are
re-validated server-side.

**Risk tier.** An agent's governance risk classification: `low | medium | high | critical`.

**Runtime.** The approved execution environment recorded for an agent, e.g. `doks_prod`.

**Scenario.** A seeded end-to-end story (e.g. `devops-incident`) tying an agent to its owner,
sponsor, approver, operator, auditor, permissions, and a **negative persona**.

**Negative persona.** The seeded user who must be **hard-denied** for a scenario — the red
test case (e.g. **Claire Evans** for `devops-incident`).

## Runtime & frameworks

**SDK.** The `palonexus` Python package — one typed front door over the control plane and
agent-idp. Lean core; framework bindings are opt-in extras.

**Control plane.** The Go decision engine hosting `/authz`, the registry, and the audit
chain. The SDK talks to it (and to agent-idp) over HTTP.

**agent-idp.** The identity provider service: agent governance, provisioning, delegations,
revocation, and directory sync. The SDK's `pn.agents` / `pn.revoke` / delegation calls hit
it.

**Egress.** An agent's *outbound* action — a model call, tool call, or agent-to-agent hop.
The hard problem PaloNexus governs: every egress passes the same `/authz` decision carrying
agent + on-behalf-of identity.

**Ingress.** A north–south request *into* the cluster (client → gateway → upstream), the
classic API-gateway direction. It is the **foundational** decision the platform started
from — the same `/authz` spine that now also governs agent **egress**.

**A2A — Agent-to-Agent.** One agent calling another. The hop is itself gated and carries the
original on-behalf-of subject.

**HITL — Human-in-the-Loop.** A run that pauses for a human decision (here, approving a
delegation) before continuing. In LangGraph this is `interrupt()` + `Command(resume=...)`.

**interrupt / Command(resume=…).** LangGraph's pause/resume primitives. The governance
adapter calls `interrupt()` on a needs-approval decision; the graph resumes after a human
approves.

**Checkpointer.** LangGraph's durable state store (`MemorySaver` in dev, `AsyncPostgresSaver`
in production). **Required** for HITL — without it an interrupted run cannot resume.

**`thread_id`.** The run identifier in a LangGraph config (`{"configurable": {"thread_id":
…}}`) under which the checkpointer persists state.

**ToolMessage.** A LangChain message returned in place of a tool result. The LangChain gate
substitutes a *deny* `ToolMessage` on a hard deny, so the model sees the denial instead of
the tool running.

**Middleware / `governed_node`.** The framework adapters. `middleware(pn)` gates every
declared tool call in `create_agent`; `governed_node(pn, …)` gates a LangGraph node.

## Operations & observability

**OTel — OpenTelemetry.** The tracing/metrics standard. Governed calls carry a trace id
(`PolicyDecision.trace_id`) so a run is reconstructable in Tempo.

**Audit hash chain.** The tamper-evident decision log: each record's `prev_hash` equals the
previous record's `hash`. Editing or deleting any record breaks the chain;
`pn.audit.verify_chain()` checks it.

**M2M — Machine-to-Machine.** Non-interactive service credentials (e.g. the Logto seeder's
client id/secret) used by backend services rather than a logged-in human.

**IdP — Identity Provider.** A service that issues and verifies identities. Here, **agent-idp**
(for agents) and your **workforce IdP** (for humans; Logto in the demo).

**IdP / Workforce IdP.** The enterprise identity provider that **owns human identity** — the
system of record for employees, groups, org roles, and lifecycle status. PaloNexus is
**IdP-neutral**: it integrates any OIDC/SCIM workforce IdP (Okta, Microsoft Entra ID, Auth0,
Ping, Google Workspace, Amazon Cognito, Keycloak, Logto, …) via standards (**OIDC**, **SAML**,
**SCIM / directory sync**, **API sync**, **webhooks**) and never owns human identity itself —
it owns AI agents, delegation, task authorization, temporary elevation, and audit. See
[IdP Support Model](/docs/concepts/idp-support/).

**OIDC — OpenID Connect.** The OAuth 2.0-based authentication standard PaloNexus uses to
integrate a workforce IdP for human sign-in and to verify tokens against the IdP's **JWKS**.
One of the standards that makes PaloNexus IdP-neutral. See
[IdP Support Model](/docs/concepts/idp-support/).

**SAML — Security Assertion Markup Language.** The XML-based SSO/federation standard some
enterprise IdPs use for workforce sign-in; supported alongside OIDC for connecting a workforce
IdP. See [IdP Support Model](/docs/concepts/idp-support/).

**Directory sync.** Keeping the **workforce directory** in step with the enterprise IdP —
employees, groups, org roles, and lifecycle status — via **SCIM**, **API sync**, or
**webhooks**. A snapshot reconcile keyed by the **stable subject**, idempotent and
tenant-isolated. See [IdP Support Model](/docs/concepts/idp-support/).

**Lifecycle status (joiner / mover / leaver).** The employee's state in the workforce IdP,
propagated by directory sync: a **joiner** is provisioned, a **mover** changes
groups/roles/org, and a **leaver** is deprovisioned (cascading revocation of any agent
authority they held). See [IdP Support Model](/docs/concepts/idp-support/).

**Logto.** The **reference/demo IdP** used in PaloNexus walkthroughs and seeded demo data — a
convenient OIDC/SCIM workforce IdP. PaloNexus is IdP-neutral; any OIDC/SCIM IdP (Okta, Entra
ID, Auth0, …) integrates the same way. The `seed-logto` tool seeds the Northstar **demo** org
into it. See [IdP Support Model](/docs/concepts/idp-support/).

**SCIM — System for Cross-domain Identity Management.** The standard (SCIM 2.0 User/Group)
PaloNexus uses to sync the **workforce directory** from the enterprise IdP (Okta / Entra /
Workspace). Sync is a snapshot reconcile keyed by the **stable subject** — joiner / mover /
leaver / rehire — and is idempotent and tenant-isolated. See
[Enterprise IAM API](/docs/reference/enterprise-iam-api/).

**STS — Security Token Service.** The agent-idp service that exchanges an agent's proof plus
a delegation's evidence into a short-lived, audience-bound JWT (`sub`=agent, `act`=human,
`cnf` proof-of-possession, tight TTL), signed with the issuer Ed25519 key. Refused from a
revoked or expired delegation; logged metadata-only. See
[Enterprise IAM API](/docs/reference/enterprise-iam-api/).

**Northstar.** The seeded demo organization (`org_id` `7gdgqfu5j0oo`) all examples and
personas belong to.

**Envoy.** The data-plane proxy at the gateway that runs `ext_authz` against `/authz`.

**NetworkPolicy.** The Kubernetes object that confines an agent pod to the egress proxy, so
egress enforcement holds for *any* framework, not just cooperating SDK code.

**DOKS — DigitalOcean Kubernetes Service.** A managed Kubernetes target for self-hosting.

## SDK types referenced in these docs

**PolicyDecision.** The typed result of `task.check()`: `allow`, `needs_approval`, `reason`,
`subject`, `upstream`, `trace_id`.

**AgentIdentity / HumanOwner / Delegation / TaskSession / Credential / AuditEvent / Resource /
AssetType.** The core typed models — see the [SDK quickstart](/docs/sdk/quickstart/) and
[SDK overview](/docs/sdk/) for how they map to platform surfaces.

**`X-Palonexus-*` headers.** The request/response headers carrying egress identity and the
decision — `-Actor`, `-On-Behalf-Of`, `-Task`, `-Action`, `-Resource`, `-Agent-VP`,
`-Subject`, `-Needs-Approval`, `-Deny-Reason`. See the [Headers reference](/docs/reference/headers/).
