---
title: Feature matrix
description: Every PaloNexus platform capability — agent egress governance, ingress authz, DID/VC identity, delegation/TBAC, budgets, admission, persistence backends, observability, audit hash-chain, and the consoles — with status and where it's documented.
sidebar:
  order: 7
---

A single table of everything the platform does, with shipped status and a pointer to
where each capability is documented. All rows marked **Shipped** are built,
unit-tested, and verified live on a managed Kubernetes cluster (DOKS example).

## Capabilities

| Capability | What it does | Status | Documented in |
|---|---|---|---|
| **Agent egress governance** | The headline pillar: every outbound agent call (model / tool / A2A / external) is decided at one deny-by-default `/authz` — *may this agent make this call, on behalf of this human, for this task, right now?* — via allowlist → budget → delegation → OPA. | Shipped | [Egress enforcement](/docs/concepts/egress-enforcement/) |
| **Ingress authz** | Foundational: every north-south request is decided at the *same* `/authz` (identity → registry → policy) via Envoy `ext_authz`; allow stamps `X-Palonexus-Subject`/`-Upstream`. The foundation agent egress builds on. | Shipped | [Architecture overview](/docs/concepts/index/), [HTTP API](/docs/reference/http-api/) |
| **Network-layer egress proxy** | Forward proxy (`:9092`) confines agent egress; raw `curl` → 407; same decision as `/authz`, audited `egress.proxy`. | Shipped | [Egress enforcement](/docs/concepts/egress-enforcement/) |
| **Envoy egress gateway** | Transparent data-plane alternative to the proxy (`SecurityPolicy.extAuth` → `/authz`). | Shipped (`components/egress-gateway`) | [Egress enforcement](/docs/concepts/egress-enforcement/) |
| **Admission webhook** | Mutates proxy env into agent pods; rejects un-provisioned agents at registration time. | Shipped (`components/agent-admission`) | [Egress enforcement](/docs/concepts/egress-enforcement/) |
| **Egress identity sidecar** | Per-agent sidecar mints a fresh, revocable VP per call so even LangChain's model client traverses the proxy. | Shipped (`components/egress-sidecar`) | [Egress enforcement](/docs/concepts/egress-enforcement/) |
| **DID/VC identity** | `did:key` agent subjects under a `did:web` issuer anchor; Membership + Capability VCs (JWT-VC, Ed25519). | Shipped | [Persistence & identity](/docs/concepts/persistence-and-identity/) |
| **Cryptographic egress identity** | `AGENT_IDENTITY_MODE=vc`: a verified Membership VP is required; the spoofable actor header is no longer trusted alone. | Shipped | [Persistence & identity](/docs/concepts/persistence-and-identity/) |
| **VP verification** | `POST /v1/agents/verify-presentation` proves holder sig + VC chain + not-revoked, maps `did:key` → agent name. | Shipped | [HTTP API](/docs/reference/http-api/) |
| **Delegations / TBAC** | Human-approved, time-boxed Delegation VCs scoped to (actor, task, action, resource); checked on every regulated egress. | Shipped | [HTTP API](/docs/reference/http-api/), [Consoles](/docs/concepts/consoles/) |
| **Budgets** | Per-agent rolling ceilings: tokens/hour, calls/hour, USD/day; fed by broker usage callbacks. | Shipped | [HTTP API](/docs/reference/http-api/), [Headers](/docs/reference/headers/) |
| **Revocation (live)** | StatusList-backed; revoking a VC cuts the next `/authz` decision in <1s. | Shipped | [Persistence & identity](/docs/concepts/persistence-and-identity/) |
| **Pluggable persistence** | Registry + agent-idp store: `memory` · `postgres` · `mysql` · `sqlite` · `mongodb`; CNPG for Postgres; fail-closed. | Shipped | [Persistence & identity](/docs/concepts/persistence-and-identity/), [Env vars](/docs/reference/env-vars/) |
| **Human-approved egress hold** | needs-approval / external egress is held (default 120s) and resumes on portal approve. | Shipped | [Egress enforcement](/docs/concepts/egress-enforcement/), [Consoles](/docs/concepts/consoles/) |
| **Observability** | `/metrics` (decisions, latency, tokens, cost); OTLP traces with DID/VC span attributes → Grafana LGTM. | Shipped | [Consoles](/docs/concepts/consoles/), [HTTP API](/docs/reference/http-api/) |
| **Audit hash-chain** | Every decision is a tamper-evident, hash-chained record; `/v1/audit/verify` recomputes the chain. | Shipped | [HTTP API](/docs/reference/http-api/) |
| **Registry** | Source of truth for services/agents/models/tools: upstream, scope, public, kind, allowlists, budget, dataClass. | Shipped | [HTTP API](/docs/reference/http-api/) |
| **Model broker** | LiteLLM proxy holding the provider key; logical model names; meters tokens/cost back to the control plane. | Shipped | [HTTP API](/docs/reference/http-api/) |
| **Human SSO** | Dex OIDC for console/portal login; independent of agent DID/VC; dev overlay disables it for anon passthrough. | Shipped | [Architecture](/docs/concepts/architecture/), [Env vars](/docs/reference/env-vars/) |
| **OPA org policy** | Org-wide Rego loaded into OPA as a deny-overrides veto over the inline decision. | Shipped | [Architecture](/docs/concepts/architecture/) |
| **Operator consoles** | Portal: Overview, Registry, Decisions, Audit, Identity, Approvals, Egress Approvals, Agents, Traces. | Shipped | [Consoles](/docs/concepts/consoles/) |

## Enterprise IAM (agent identity & governance)

The agent IAM control loop that runs **alongside** a workforce IdP (Okta / Entra ID /
Workspace), all shipping in the `agent-idp` service and surfaced in the portal Directory +
Governance tabs. See [Enterprise IAM for AI agents](/docs/concepts/enterprise-iam/).

| Capability | What it does | Status | Documented in |
|---|---|---|---|
| **Directory lifecycle sync** | SCIM 2.0 User/Group snapshot reconcile per tenant — joiner/mover/leaver/rehire, idempotent, tenant-isolated. Stable subject `<idp>:<tenant>:<external_id>`, never email. | Shipped | [Enterprise IAM](/docs/concepts/enterprise-iam/), [Enterprise IAM API](/docs/reference/enterprise-iam-api/) |
| **Stable employee identity** | Resolves token claims (Entra/Okta) to the stable subject; SCIM authoritative over token claims with explicit precedence; conflicts surfaced, a stale token never reactivates a leaver. | Shipped | [Enterprise IAM](/docs/concepts/enterprise-iam/), [Enterprise IAM API](/docs/reference/enterprise-iam-api/) |
| **Agent ownership governance** | Mandatory accountable ownership (`owner_ref`/`owner_type`/`team_ref`/`business_sponsor`/`risk_tier`/`approved_runtime`/`status`); owner resolves to an active F2 employee/team; activation gate; no orphaned agents. | Shipped | [Enterprise IAM](/docs/concepts/enterprise-iam/), [Enterprise IAM API](/docs/reference/enterprise-iam-api/) |
| **Revocation cascade** | Lifecycle change (owner/sponsor/approver/group/delegation/agent invalid) auto-suspends/quarantines the agent + revokes/invalidates delegations; durable, reason-coded, idempotent; runs at end of every sync. | Shipped | [Enterprise IAM](/docs/concepts/enterprise-iam/), [Enterprise IAM API](/docs/reference/enterprise-iam-api/) |
| **Human-authority delegation** | Granting a delegation is an authz decision: requester + approver are active employees in-tenant, and the approver must hold real authority (owner/sponsor/service/team/resource/manager/group/admin or logged break-glass); basis + evidence recorded. | Shipped | [Enterprise IAM](/docs/concepts/enterprise-iam/), [Enterprise IAM API](/docs/reference/enterprise-iam-api/) |
| **STS token exchange** | Exchanges agent proof + delegation evidence into a short-lived audience-bound JWT (`sub`=agent / `act`=human / `cnf` / tight TTL), signed with the issuer Ed25519 key; refused from a revoked/expired delegation; metadata-only audit log. | Shipped | [Enterprise IAM](/docs/concepts/enterprise-iam/), [Enterprise IAM API](/docs/reference/enterprise-iam-api/) |
| **Compliance credentials** | Named-standard attestation (GDPR/HIPAA/SOC2/EU-AI-Act-Art50) issued by a `compliance_auditor`-role human; a real signed `did:web` JWT-VC (not a plain JSON row); feeds the F3 activation gate and F4 revocation cascade. | Shipped | [Governance credentials](/docs/concepts/verifiable-credentials/), [Enterprise IAM API](/docs/reference/enterprise-iam-api/#7-compliance-credentials-f20) |
| **Cryptographically verifiable credentials** | Generalized signed-VC issuance (`extra_subject`) reused by every governance credential type; issuer key history/rotation; StatusList2021 revocation; a fully offline `{vc_jwt, did_document, status_snapshot}` verification bundle — zero calls to PaloNexus. | Shipped | [Governance credentials](/docs/concepts/verifiable-credentials/), [Enterprise IAM API](/docs/reference/enterprise-iam-api/#8-cryptographic-verifiability--issuer-key-history-f24) |
| **Provenance credentials** | Self-declared base-model/training-data/declared-owner attestation issued by a distinct `provenance_attestor` role; a routine model update *supersedes* the prior credential (no cascade), an explicit revoke does cascade; completes the agent disclosure artifact. | Shipped | [Governance credentials](/docs/concepts/verifiable-credentials/), [Enterprise IAM API](/docs/reference/enterprise-iam-api/#9-provenance-credentials-f25) |

## Planned / hardening (not yet shipped)

These are deliberately deferred — the MVP proves the control loop, and these harden it for
broad production. They are tracked in the platform `BACKLOG.md` / `README.md` checklist, not
silently omitted. **Partial** means a shipped capability has a production-grade upgrade still
open; **Planned** means the capability is scoped but not built.

| Capability | What it adds | Status | Tracked in |
|---|---|---|---|
| **Signed policy bundles** | Serve Rego from a **signed OCI bundle** so org-policy changes are versioned and audited. | Planned | `README.md` checklist |
| **KMS/HSM issuer key + rotation** | Move the `did:web` issuer Ed25519 key into a KMS/HSM and automate rotation. Key history/rotation *tracking* now ships (`GET /v1/issuer/key-history`, a rotated key's old credentials still verify) — what's still open is KMS/HSM-backed storage and automating the rotation itself (today a manual redeploy). | Partial | [Governance credentials](/docs/concepts/verifiable-credentials/), `README.md` checklist |
| **SPIFFE/SPIRE workload mTLS** | East-west *workload* attestation, complementary to the portable DID/VC credential. | Planned | `README.md` checklist |
| **Hostname-routed ingress** | Route ingress **by hostname** per service (Envoy does not forward a route-set header to ext_authz). | Partial | `README.md` checklist |
| **Retention-locked audit sink** | Ship the hash-chained audit to a **retention-locked** object store for WORM durability. | Partial | `README.md` checklist |
| **Full SCIM provisioning** | Outbound SCIM provisioning beyond the inbound sync reconcile. | Planned | `BACKLOG.md` |
| **ABAC policy engine** | Attribute-based policy beyond the inline + Rego model. | Planned | `BACKLOG.md` |
| **DPoP / mTLS-bound tokens** | Bind STS tokens to a proof key (today `cnf` proof-of-possession, not channel-bound). | Planned | `BACKLOG.md` |
| **JWKS endpoint + key rotation** | Publish issuer keys via JWKS so resource servers verify STS tokens without out-of-band keys. | Planned | `BACKLOG.md` |
| **Multi-approver workflows** | N-of-M / dual-control approval on a single delegation (today single approver). | Planned | `BACKLOG.md` |
| **Token introspection / revocation lists** | RFC 7662 introspection and RFC 7009-style revocation lists for STS tokens. | Planned | `BACKLOG.md` |

## Status legend

- **Shipped** — built, tested, and verified running live on a managed Kubernetes cluster (DOKS example).
- **Partial** — a shipped capability with a production-grade hardening upgrade still open.
- **Planned** — scoped and tracked in `BACKLOG.md` / the `README.md` checklist, not yet built.
