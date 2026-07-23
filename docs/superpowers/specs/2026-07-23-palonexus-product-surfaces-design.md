# PaloNexus Product Surfaces Design

**Status:** Updated; pending product-design review
**Date:** 2026-07-23

**Implementation source of truth:** shipped self-hosted capabilities and
current deployment state are verified against the companion platform
repository at `../platform`. That repository is authoritative for what exists
today; this document defines the web information architecture and product
language around it.

## Goal

Present PaloNexus as one authorization and accountability product with three
connected surfaces:

1. **Integrate — PaloNexus SDK**
2. **Enforce — PaloNexus Control Plane**
3. **Observe — PaloNexus Command Center**

The model must explain where agent identity provisioning, policy authoring,
human approval, and future coding-agent integrations belong without turning
each capability or delivery channel into a separate product.

## Implementation scope

The implementation that follows this design is a **marketing-site and
documentation information-architecture change**. It will:

- replace the current product packaging on the marketing site with the
  one-product, three-surface model;
- align marketing capability sections and workflow explanations with that
  model;
- reorganize or relabel documentation navigation and audience entry points;
- update existing pages where their framing conflicts with the model; and
- distinguish shipped capabilities, the Cloud Beta launch, and planned
  coding-agent, Policy Studio, and Companion work.

The implementation will not build Policy Studio, a new approval application,
Codex or Claude Code adapters, PaloNexus Companion, or new Control Plane APIs.
Those capabilities appear in this design as product-model definitions,
messaging constraints, and future architecture context. Each future product
capability requires its own design and implementation plan before engineering
work begins.

The platform repository already ships the self-hosted Control Plane, agent
identity service, SDK integration paths, approval/delegation flow, audit and
observability surfaces, and a live DOKS deployment. The web implementation
must describe those as current. Multi-tenant PaloNexus Cloud is a separate
engineering effort specified in `../platform/docs/saas-cloud-beta-design.md`;
it is not implied by the existing self-hosted deployment.

## Product model

### Integrate — PaloNexus SDK

**Primary audience:** developers and owners of agents.

The SDK is the application-facing integration surface. It enables developers
and agent owners to:

- register an agent with its accountable owner, sponsor, and role;
- request the capabilities the agent needs;
- provision the agent's identity and credentials through the identity service
  behind the Control Plane;
- attach agent, human, task, action, and resource context to governed actions;
- handle typed allow, deny, and approval-required outcomes; and
- use framework-specific adapters without changing the authorization contract.

Identity provisioning belongs to the Integrate journey even though the
authoritative identity service runs in the Control Plane. The SDK initiates
registration and provisioning; the Control Plane issues and verifies identity;
the Command Center shows identity posture, ownership, capabilities, and
revocation.

### Enforce — PaloNexus Control Plane

**Primary audience:** platform and security operations teams.

The Control Plane is the operational and enforcement surface. It provides:

- agent identity and credential services;
- authorization and policy evaluation;
- delegation, approval holds, and revocation;
- credential issuance and brokering;
- registry, audit, and deployment APIs; and
- the runtime services required to enforce the same authorization contract
  across agent actions.

Kubernetes and supported identity providers are the current deployment and
integration boundary. They are supported integrations beneath the Control
Plane, not the permanent definition of the product. Product language should
state the current boundary plainly without naming the Control Plane after a
specific orchestrator or identity provider.

### Observe — PaloNexus Command Center

**Primary audience:** security administrators, investigators, security
officers, and leaders.

The Command Center combines operational investigation and executive oversight.
Its shipped capabilities provide:

- fleet posture and authority dashboards;
- decision, identity, and authority-trail investigation;
- agent ownership, role, and lifecycle visibility;
- approval queues and approval history; and
- policy outcomes and enforcement context.

**Policy Studio is planned, not shipped.** It will extend the Command Center
with a workspace where security administrators author agent roles and policies.

“Observe” is the lifecycle verb, not a limitation on the surface. The Command
Center can also support governance and policy administration through focused
workspaces such as the planned Policy Studio.

## Deployment and monetization model

PaloNexus is one product with three deployment paths. Deployment is separate
from the three product surfaces:

| Deployment path | Audience | Infrastructure and boundary |
|---|---|---|
| **PaloNexus Local** | Individual developers | Reduced local runtime using memory or SQLite; no Kubernetes, Postgres, Vault, enterprise IdP, or production network enforcement. |
| **PaloNexus Cloud Beta** | Teams of up to 10 members | PaloNexus-hosted DOKS Control Plane and Command Center. Customer-side Connector mode is required for production actions. The categorical no-hosted-production-secrets claim is permitted only after the Connector evidence gate passes. |
| **Self-hosted PaloNexus** | Larger or regulated organizations | Customer-operated Kubernetes with supported IdP integrations, durable storage, network enforcement, and enterprise operations. |

Current-state qualification: Self-hosted PaloNexus is implemented and live on
DOKS in the platform repository. The existing portal is an operator-facing
control-plane console, exposed through Tailscale or port-forward rather than a
public SaaS tenant portal. Cloud Beta is not shipped until the separate
multi-tenant launch gate is satisfied.

The Cloud Beta uses **cell-per-team isolation** for the initial release:

- one shared DOKS cluster;
- one namespace per team;
- team-scoped service accounts, Secrets, NetworkPolicies, ingress routes, and
  database credentials;
- shared managed PostgreSQL with a separate logical database **and unique
  credentials per team** for the beta; and
- a path to dedicated database or cluster cells for regulated customers.

Dedicated namespaces do not by themselves establish tenant isolation. The
Cloud Beta must enforce namespace-scoped RBAC, network isolation, database
isolation, authenticated team routing, and automated cross-tenant tests.

The Cloud Beta is a hosted deployment of the same Control Plane and Command
Center surfaces, not a separate product. Its planned initial scope includes
team authentication, invitations, agent registration and provisioning,
allow/deny and approval-required decisions, email-to-web approval, basic audit
history, and a 10-member limit. It excludes hosted customer secrets, credential
brokering, automated billing, mobile approval, Policy Studio, Companion, HA
guarantees, public SLAs, and enterprise data-residency commitments.

PaloNexus offers two pricing metrics across Cloud and self-hosted commercial
plans:

- **Fleet:** a base platform fee plus governed-agent bands.
- **Consumption:** a base platform fee plus an included authorization-decision
  allowance and overage.

The Developer offering provides the SDK and Local Runtime. Business and
Enterprise plans add higher limits, retention, integrations, support, and
self-hosted capabilities. The pricing metric changes the commercial model;
it does not create separate products or alter the authorization contract.

The Cloud Beta must not bill health checks, policy simulation, PaloNexus
retries, duplicate requests, internal administrative traffic, or evaluations
that fail because PaloNexus is unavailable. Allowed and denied authorization
evaluations remain separately visible in usage reporting.

### Cloud Beta launch gate

The source-of-truth launch state is `private-beta` until the launch gate passes.
Before the gate, marketing uses **PaloNexus Cloud Private Beta** and a
**Request access** CTA. It must not use “available now,” “start a team,” or a
self-service signup path.

Marketing may change the source-of-truth state to `available-beta`, use
**PaloNexus Cloud Beta**, and change the CTA to **Start Cloud Beta** only after
two separate test teams have passed isolation tests for agents, identities, API
keys, policies, approvals, delegations, audit records, Command Center routes,
and API endpoints. The same release evidence must include durable-audit chain
continuity, backup/restore and deletion, Connector protocol and reference-
deployment tests (including redaction, replay, revocation, and fail-closed
behavior), rate limiting, tenant disablement, and emergency access controls.
The evidence and state change must be recorded with the deployment release.

## Cross-surface human approval

Human approval is a workflow across the three surfaces, not a fourth product.

1. An agent raises an access request through the SDK.
2. The Control Plane validates identity and authority, holds the action, and
   records the request.
3. An authorized person approves or denies the request through an approval
   experience.
4. The Control Plane applies the decision and issues only the required,
   time-bound authority or credential.
5. The Command Center provides the queue, history, investigation context, and
   oversight.

Self-hosted PaloNexus currently supports operator-portal approval and
delegation. Email to a secure web approval page is the **planned first Cloud
Beta channel**, served by the same portal application that provides the Command
Center. The approval page is a focused, token-scoped experience and does not
require the approver to use the full Command Center. Future channels may
include a mobile application. The channel can change without changing the
approval contract or creating a new top-level product.

An approval request should identify the agent, accountable human, task,
requested action, resource, reason, scope, and requested duration. Approval
must grant a narrow, expiring delegation rather than general access.

## Policy and role lifecycle

Policy Studio is the authoring surface for security administrators. The Control
Plane remains the deployment and enforcement boundary.

The lifecycle is:

1. A security administrator authors or changes a role or policy in Policy
   Studio.
2. PaloNexus creates a versioned policy artifact.
3. The artifact is validated and deployed through Control Plane APIs.
4. The Control Plane evaluates it during authorization.
5. Decisions and policy versions are written to the audit trail.
6. The Command Center exposes the resulting posture, decisions, and
   investigations.

The design must preserve version history, validation results, authorship, and
the deployed version. Policy Studio must not silently edit live enforcement
state without producing a versioned artifact and an auditable deployment
event.

The existing policy mechanisms map into this model:

- SDK registration declares an agent's role and requested capabilities.
- Control Plane registry policy defines scopes, allowlists, budgets, and target
  classifications.
- Organization-wide policy can supply deny-overrides rules.
- Policy simulation previews outcomes but does not replace versioning,
  validation, deployment, or audit.

## Future coding-agent integrations

Codex, Claude Code, and other coding agents are runtime integrations beneath
the SDK surface. They do not become additional product surfaces.

### Initial target: developer laptops

The initial integration targets coding agents running on developer laptops.
The governed context may include:

- authenticated developer and device;
- coding-agent type and installation;
- agent session and task;
- repository and workspace;
- shell command or tool call;
- file, branch, remote, environment, or external service; and
- requested privilege and duration.

Policies may evaluate local shell actions, filesystem changes, Git operations,
secret access, deployments, external network calls, and tool or MCP use.

### Planned first phase: thin plugins

The first planned coding-agent phase uses thin Codex and Claude Code adapters
that:

- capture action context;
- call a stable PaloNexus decision contract;
- present allow, deny, and approval-required outcomes; and
- avoid storing enterprise credentials or implementing policy semantics.

Identity authority, policy, approval state, delegation, revocation, and audit
remain server-side. The plugins initially use a direct authenticated transport
to the Control Plane.

This model is easier to integrate but remains cooperative: unsupported paths or
a compromised agent process may bypass plugin-level enforcement. Marketing and
documentation must state that boundary.

### Planned later phase: PaloNexus Companion

The stronger laptop architecture adds a local PaloNexus Companion. Existing
coding-agent adapters continue to use the same client interface, but the
transport changes from a direct Control Plane connection to local inter-process
communication with the Companion.

The Companion adds:

- device and developer authentication;
- agent identity provisioning and local session binding;
- secure local credential storage;
- local approval pauses;
- credential brokering outside the coding-agent process;
- a constrained offline policy cache;
- a durable audit queue; and
- enforcement capabilities that do not depend entirely on the coding agent.

The Control Plane remains authoritative for central policy, authority,
delegation, revocation, and audit.

The initial Companion target is macOS. Windows and Linux follow using a shared
Go or Rust core with platform-specific secure storage, service lifecycle, code
signing, installers, update behavior, enterprise deployment, and
endpoint-security compatibility.

## Transition requirements

Moving from thin plugins to the Companion should be additive rather than a
rewrite. The future thin-adapter design must therefore:

- define one stable adapter-to-decision interface;
- place transport behind an interface;
- keep policy semantics out of coding-agent plugins;
- keep enterprise credentials out of coding-agent plugins;
- keep identity authority and approval state in the Control Plane;
- use the same action-context schema across direct and Companion transports;
- make audit delivery idempotent; and
- distinguish cooperative plugin enforcement from stronger Companion-backed
  enforcement in policy and audit records.

If these boundaries are not established in the thin-adapter phase, the
Companion transition will require substantial plugin rewrites and migration of
security-sensitive state.

## Indicative effort

These estimates assume two experienced engineers, an existing Control Plane,
and focused scope. They are planning ranges, not release commitments.

| Increment | Focused MVP | Production-ready |
|---|---:|---:|
| Thin coding-agent plugins and shared contract | 4–7 weeks | 8–12 weeks |
| macOS Companion | 6–10 additional weeks | 12–20 additional weeks |
| Windows support | 5–8 additional weeks | 8–14 additional weeks |
| Linux support | 3–6 additional weeks | 6–10 additional weeks |

Production readiness includes security hardening, signing, packaging, updates,
enterprise deployment, endpoint-security compatibility, failure recovery, and
operational support.

## Failure behavior

The SDK, Control Plane, approval workflow, future coding-agent adapters, and
future Companion must preserve the product's fail-closed posture. Marketing,
documentation, dashboards, and other informational views must describe that
behavior accurately but do not themselves enforce decisions.

- An unprovisioned or revoked agent cannot receive governed authority.
- An unavailable Control Plane cannot become an implicit allow.
- An approval timeout or delivery failure leaves the action held or denied.
- An invalid or undeployable policy version cannot replace the active version.
- A Companion operating offline can apply only explicitly cached policy within
  its defined lifetime and authority; it cannot mint new central authority.
- Audit delivery retries must not duplicate decisions.
- A plugin or Companion must surface when enforcement coverage is cooperative,
  degraded, or unavailable.

## Marketing language

PaloNexus should be introduced as one product with three connected surfaces:

- **Integrate with the PaloNexus SDK.**
- **Enforce with the PaloNexus Control Plane.**
- **Observe with the PaloNexus Command Center.**

The deployment choices should then be presented as:

- **PaloNexus Local:** start on a developer laptop.
- **PaloNexus Cloud Beta:** start a team of up to 10 members without running
  the Control Plane.
- **Self-hosted PaloNexus:** operate the Control Plane in customer Kubernetes.

Cloud Beta messaging must state that production actions use the customer-side
Connector. Before Connector evidence passes, do not make a categorical
no-hosted-production-secrets claim; after it passes, that claim may be used as
verified launch copy. Fleet and Consumption should be shown as two pricing
choices for the same commercial product, not as separate editions.

Codex- and Claude Code-specific adapters are not shipped. Marketing may present
them only as planned work:

> **Planned first:** Integrate coding agents through lightweight adapters.
> Connect Codex and Claude Code to centralized identity, policy, approval, and
> audit without changing the developer workflow.

> **Planned later:** Device-level enforcement with PaloNexus Companion. A local
> security boundary for credential brokering, offline policy, and enforcement
> outside the coding-agent process—starting with macOS.

Use “planned” until the Companion is funded and scheduled. Use “coming soon”
only when there is a committed release window. Do not imply that thin plugins
provide device-level enforcement.

Cloud Beta may be labeled **available in beta** only after the Cloud Beta launch
gate passes. Before that gate, use **Private Beta / Request access**.

## Information architecture implications

The marketing site and documentation should follow the same model.

The marketing site should:

- introduce the one-product, three-surface model;
- organize capabilities beneath Integrate, Enforce, and Observe;
- present human approval as a workflow connecting the surfaces;
- present Policy Studio as a planned Command Center workspace;
- identify Kubernetes and supported IdPs as current Control Plane integrations;
  and
- present Local, Cloud Beta, and Self-hosted as deployment paths under the same
  product;
- distinguish the planned first-phase coding-agent adapters from the planned
  later Companion.

The documentation should provide primary paths for:

- developers and agent owners integrating through the SDK;
- developers starting with the Local Runtime;
- teams onboarding to Cloud Beta (or requesting access while its state is
  `private-beta`);
- platform teams deploying Self-hosted PaloNexus;
- platform and security operations teams deploying the Control Plane;
- security administrators authoring and deploying policy;
- approvers assessing requests;
- investigators and leaders using the Command Center; and
- readers evaluating the planned coding-agent adapter and Companion roadmap.

Installation and operations paths for Codex- and Claude Code-specific adapters
must not appear until those adapters ship.

## Verification criteria

The eventual implementation should be checked for:

- consistent product names and lifecycle verbs across marketing and docs;
- no implication that PaloNexus is three separately purchased products;
- no implication that approval channels are separate products;
- accurate separation of shipped, planned, and future capabilities;
- consistent Local, Cloud Beta, and Self-hosted deployment paths across the
  marketing site and documentation;
- Cloud Beta status, CTA, Connector requirement, and the strength of any
  no-hosted-secrets claim match the canonical Cloud Beta launch-evidence
  checklist in `../platform/docs/saas-cloud-beta-design.md`;
- Fleet and Consumption pricing are presented as choices for the same product;
- clear ownership of identity provisioning and policy authoring;
- future-architecture content that specifies a stable action-context and
  decision contract for coding-agent adapters;
- content that distinguishes cooperative plugin enforcement from stronger
  Companion-backed enforcement and describes degraded modes accurately;
- responsive rendering of the new product model and workflow diagrams; and
- valid navigation and cross-references for every audience path.

## Non-goals

This design does not:

- set final price points, billing implementation details, or payment-provider
  behavior;
- commit to a Companion release date;
- promise support for every identity provider or deployment environment;
- define the complete Policy Studio user interface;
- define mobile approval application behavior;
- define each Codex or Claude Code adapter against a specific vendor extension
  API; or
- replace detailed Control Plane, SDK, or Command Center technical
  architecture.
