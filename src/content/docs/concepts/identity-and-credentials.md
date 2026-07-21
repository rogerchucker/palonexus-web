---
title: Agent identity & credentials
description: Prove which agent acted, on whose still-valid authority — cryptographic, revocable agent identity (signed agent credentials and proof of authorization; DID/VC is one supported credential format), revocation enforced at /authz, the durable human identity behind every agent, and compliance & provenance governance credentials verifiable offline with zero calls to PaloNexus.
sidebar:
  order: 4
---

When an agent acts, an enterprise must be able to prove **which agent acted, whose
authority it used, whether that authority was still valid, and why the action was
allowed** — and that proof has to be unforgeable by any workload that can set an HTTP
header, go away the instant the authority behind it is revoked, and (for a downstream
consumer of the agent's output — a regulator, an auditor, a partner enterprise) answer one
question more: **what does this agent attest about itself, and can I check that
attestation without trusting PaloNexus's live API?**

This page covers the credential machinery that makes those proofs hold: cryptographic
egress identity, revocation on the decision path, the durable human identity behind every
agent, and the compliance/provenance **governance credentials**. Throughout, DID/VC is
**one supported credential format** — the mechanism PaloNexus uses to make signed agent
credentials and proof of authorization independently verifiable, not the product category.
All of it is shipped and verified live on a managed Kubernetes cluster (DOKS example);
the durable storage underneath is covered in [Persistence (operations)](/docs/operations/persistence/).

## Cryptographic egress identity

**The problem.** Egress identified the calling agent by the `X-Palonexus-Actor`
**header**, which any pod in `apps` can set. NetworkPolicy + registry + policy still
enforced, but the *identity* was spoofable.

**The design — bind the actor to a Verifiable Credential.** Each agent holds a
`did:key` private key and an issuer-signed **Membership VC** (from agent-idp
provisioning). On every egress call the middleware presents a **Verifiable
Presentation** (VP): the Membership VC wrapped with a fresh holder signature over an
audience (`palonexus-egress`) and a nonce, in the `X-Palonexus-Agent-VP` header (or
as `Proxy-Authorization` at the egress proxy).

Because the crypto lives in `agentdid` (Python) and the control plane is Go,
verification reuses the **control-plane → agent-idp over HTTP** pattern: a fail-closed
`internal/agentid` client calls `POST /v1/agents/verify-presentation`, which:

1. verifies the holder `did:key` signature on the VP, the audience, and the nonce;
2. finds the issuer-signed Membership VC inside it, verifies it chains to the
   `did:web` issuer for this holder and is **not revoked** (the StatusList); and
3. maps the proven `did:key` back to the registered agent name.

The control plane derives the actor from that **proven, registry-bound** result — the
header name, if present, must match it or the call is denied.

### Identity modes — `AGENT_IDENTITY_MODE`

| Mode | Behavior |
|---|---|
| `header` *(default, demo / back-compat)* | trust `X-Palonexus-Actor`; verify a VP if one is present (defense in depth) but don't require it |
| `vc` *(production)* | a verified `X-Palonexus-Agent-VP` is **required**; a missing/invalid VP, or an actor-name mismatch, denies |

In `vc` mode, header-only egress is denied by design — flip back to `header` for a
narrated header-only demo.

## Revocation enforced at `/authz`

Revocation is not advisory — it is enforced on the decision path. The Membership VC
and every Delegation VC carry a `vcJti`; agent-idp keeps a StatusList of revoked
JTIs (`GET /status/{list}`). Revoking a JTI (`POST /v1/revoke`) means the **next**
`/authz` (or egress-proxy) call that depends on it denies, because verification
re-checks the StatusList every time. This powers the **live-revocation race** demo:
revoke a VC in the portal and the next decision denies in under a second.

This makes agent identity *cryptographic and revocable* end-to-end, while
delegation / TBAC for regulated targets layers on top exactly as before.

## Durable identity: SCIM directory sync

Cryptographic agent identity only stays trustworthy if the **human** identity behind it is
current. That is what the agent-idp directory sync persists: the enterprise IdP pushes its
workforce over **SCIM 2.0**, agent-idp reconciles it into the same durable store, and the
result is a **stable subject** that survives email changes, re-syncs, and pod restarts.

The sequence below shows one sync. The IdP sends a Users + Groups snapshot to
`/v1/directory/sync`; agent-idp derives the stable subject `idp:tenant:external_id`
(**never** email, so changing an address never forks a person), reconciles employee, group,
and sync-run records into the durable backend, and re-derives owner/sponsor validity for
governance. The lower half is the lifecycle teeth: when the same sync reports a **leaver**,
agent-idp deactivates that one record and fires the revocation cascade, which quarantines the
person's agents, invalidates their delegations, and marks the dependent credentials revoked —
all from a single directory change.

```mermaid
sequenceDiagram
  participant IdP as Enterprise IdP (SCIM 2.0)
  participant AIDP as agent-idp /v1/directory/sync
  participant Store as Durable store
  participant Gov as Governance (owner/sponsor)
  participant Casc as Revocation cascade

  IdP->>AIDP: Users + Groups snapshot
  AIDP->>AIDP: derive stable subject<br/>idp:tenant:external_id (never email)
  AIDP->>Store: reconcile employee / group / sync-run
  AIDP->>Gov: re-derive owner + sponsor validity
  Note over IdP,AIDP: leaver = deactivate the same record
  IdP-->>AIDP: employee deactivated
  AIDP->>Casc: trigger cascade
  Casc->>Store: quarantine agents, invalidate delegations, revoke credentials
```

*One SCIM sync: the stable subject is reconciled into durable storage, and a leaver in the
same snapshot triggers the revocation cascade — joiner/mover/leaver state stays accountable.*

The portal's **Directory** tab is the read-out of this durable state — employees keyed by
stable subject, the SCIM sync history, and a sign-in precedence panel that flags stale and
group-conflict tokens:

![Workforce directory for tenant acme-corp showing 22 employees (20 active, 2 inactive) synced via SCIM, a sign-in precedence panel flagging stale and group-conflict tokens, and employee and group tables keyed by stable subject](/docs/screenshots/directory.png)

*The Directory console: workforce identity synced from the enterprise IdP via SCIM, keyed by
stable subject so joiner/mover/leaver state stays accountable.*

The **Identity** tab pivots to the agent side of the same persisted state — the `did:web`
issuer trust anchor, the agents it has provisioned with their `did:key` identifiers, and the
task-scoped delegations (and revocations) that grant them access:

![Identity page showing the did:web issuer trust anchor and its public key, a table of provisioned agents with did:key identifiers and capabilities, and a delegations table mapping actor-to-resource grants, tasks, approvers and expiry](/docs/screenshots/identity.png)

*The Identity console: the trust anchor, the agents it provisions, and the task-scoped
delegations granting (and revoking) access — the cryptographic identity described above,
made visible.*

## Governance credentials: compliance & provenance

Agent ownership and delegation (the [six building blocks](/docs/concepts/enterprise-iam/))
answer the authority part — *is this agent allowed to act*. Two more credential types
answer the disclosure part:

- **Compliance credential** — "this agent's *operation* meets standard X" (GDPR, HIPAA,
  SOC2-TypeII, EU AI Act Art. 50), attested by a third-party auditor.
- **Provenance credential** — "this agent's *outputs* came from base model X, trained on Y,
  under declared owner Z," self-declared by whoever operates the agent.

Both are real, signed `agentdid` JWT-VCs anchored to the issuer's `did:web` document — not
JSON rows a caller has to trust agent-idp's live API to report honestly.

### The gap this closes

Every identity credential PaloNexus issues for agent *authority* — Membership and Delegation
VCs (see the [Glossary](/docs/getting-started/glossary/)) — was a real, Ed25519-signed JWT-VC
from day one, independently verifiable by resolving the issuer's `did:web` document over
HTTPS. The compliance credential did not start that way: it shipped as a plain JSON row with
no signature, so a party checking an agent's compliance posture had no choice but to trust
agent-idp's live API response. That gap is closed — compliance credentials are now signed the
same way membership and delegation credentials always were, and provenance credentials (a new
credential type) were built on that corrected foundation from their first line of code.

### What "cryptographically verifiable" actually means here

**It means:** the credential was signed by the claimed issuer, it hasn't been revoked, and it
hasn't been tampered with since issuance — checkable by anyone who can resolve the issuer's
`did:web` document, with **zero calls to agent-idp's live API**.

**It does not mean:** the claim inside the credential is true. There is no watermark
detection, no training-data audit, no independent compliance audit performed by PaloNexus.
Both credential types are **self-attested** exactly the way an SOC2 report or a signed vendor
attestation is self-attested elsewhere in enterprise trust — the value is a durable,
verifiable, revocable **attribution record**, not proof of the underlying technical or
regulatory claim. State this caveat plainly to anyone evaluating these credentials; it is not
a footnote.

### Compliance credentials

A named-standard attestation about an agent, issued by an accountable human holding the
`compliance_auditor` role. Query is public; issuance requires the role. **Revocation does
not currently check the role** — a known, tracked gap (unlike provenance credentials below,
where revoke does check it).

| Field | Meaning |
|---|---|
| `standard` | e.g. `GDPR`, `HIPAA`, `SOC2-TypeII`, `EU-AI-Act-Art50` |
| `scope` | free-text scope of the attestation, e.g. `"PII access during containment actions"` |
| `evidence_ref` | pointer to the audit evidence — not the document itself |
| `expires_at` | optional; an expired credential is treated as absent |
| `status` | `valid` \| `revoked` \| `expired` (expiry is wall-clock derived, not a stored transition) |

Wired into agent governance two ways:

- **Activation gate.** An authority-bound agent's `required_compliance_standards` blocks it from
  reaching `active` until every listed standard has a valid, unexpired credential.
- **Revocation cascade.** A required credential that expires or is explicitly revoked
  suspends the agent with a dedicated reason code (`compliance_credential_expired` /
  `compliance_credential_revoked`) through the same cascade that handles an owner going
  inactive — see [Enterprise IAM](/docs/concepts/enterprise-iam/#f4--revocation-cascade).

### Provenance credentials

A self-declared attestation of what produced an agent's outputs: base model, model version,
training-data lineage, declared model owner. Issued by a distinct `provenance_attestor`
role — deliberately not overloaded onto `compliance_auditor` or the agent's governance owner,
since the person who knows an agent's model lineage is often not its compliance auditor or its
business owner.

| Field | Meaning |
|---|---|
| `base_model` | e.g. `"claude-sonnet-5"`, `"gpt-5.4"`, `"internal-finetune-v3"` |
| `model_version` | a specific snapshot/build identifier, if known |
| `training_data_sources` | free-text refs — not independently verified |
| `watermarking_scheme` | e.g. `"PDW"`, `"none declared"` — self-attested |
| `declared_owner` | the entity accountable for the base model, e.g. `"Anthropic"` |
| `evidence_ref` | pointer to a model card / internal doc backing the declaration |
| `status` | `valid` \| `superseded` \| `revoked` |

**Supersession, not just revocation.** An agent's provenance legitimately changes — a base
model upgrade, a training-data refresh. Issuing a new provenance credential for an agent that
already has one automatically marks the prior one `superseded` (`superseded_by` set to the
new credential's id). Supersession is a routine, non-cascading store update: it never writes
a revocation-log row and never suspends the agent. Only an **explicit revoke** — a declared
base model turning out to be false, for example — feeds the revocation cascade, with a
dedicated reason code (`provenance_credential_revoked`).

An authority-bound agent can require one the same way it can require a compliance standard: set
`require_provenance_credential: true` and activation blocks until a current (valid,
non-superseded, non-revoked) credential exists.

### Disclosure: both credentials, one artifact

`GET /v1/agents/{agent_id}/disclosure` assembles an agent's current compliance credentials
and current provenance credential into one machine-readable object — the EU AI Act Art.
50-shaped answer to "what is this agent, who backs it, and is it compliant," in one call. See
the exact response shape in the [Enterprise IAM API reference](/docs/reference/enterprise-iam-api/#7-compliance-credentials-f20).

### How the cryptography actually works — no blockchain

```mermaid
flowchart LR
  issuer["agent-idp Issuer<br/>did:web trust anchor<br/>Ed25519 keypair"]
  vc["Signed JWT-VC<br/>ComplianceCredential /<br/>ProvenanceCredential"]
  doc["/.well-known/did.json<br/>current key + key history"]
  status["/status/default<br/>StatusList2021"]
  verifier["Third-party verifier<br/>auditor, partner, air-gapped enforcement point"]

  issuer -->|signs| vc
  issuer -->|serves| doc
  issuer -->|serves| status
  vc -->|1. resolve issuer key by kid| verifier
  doc -->|2. fetch over HTTPS| verifier
  status -->|3. check not revoked| verifier
  verifier -->|verify signature + status, zero PaloNexus API calls| vc
```

Three pieces, all pre-existing in PaloNexus's identity stack and reused rather than
reinvented for these two credential types:

1. **`did:web` as the trust root.** The issuer's public key lives at a resolvable
   `/.well-known/did.json`, the same anchor Membership and Delegation VCs already use. No
   wallet, no gas fee, no chain-sync latency — the trade-off is that trust is anchored in DNS
   + TLS + whoever controls the issuer's domain, the same model enterprise PKI already runs
   on.
2. **StatusList2021 revocation**, the same endpoint (`GET /status/{list_id}`) delegation VCs
   already serve. Revoking a compliance or provenance credential flips its position in the
   same list a verifier already knows how to check — no new revocation mechanism to learn.
3. **Issuer key history.** `GET /v1/issuer/key-history` lists the issuer's current and prior
   (superseded) signing keys, so a credential signed before a key rotation still verifies —
   the DID document lists every key a verifier might need to resolve.

An **offline verification bundle** — `{vc_jwt, did_document, status_snapshot}` — combines all
three into one artifact a verifier can check with a standalone script, no PaloNexus import, no
network access to agent-idp at all. This is what makes the "auditor self-service, no API
access grant" and "break-glass enforcement in an air-gapped segment" use cases real rather
than aspirational.

**Known limitation, stated plainly:** status-list fetch is fail-open — an unreachable status
endpoint reads as "not revoked," the same availability-over-security default Membership and
Delegation VCs already accept. An attacker who can block the status endpoint makes a revoked
credential look valid until the block lifts. Hardening this (fail-closed with a cached
last-known-good snapshot) is a tracked follow-up, not built today.

## Try it / see also

- [Connect Agents to Enterprise Authority](/docs/concepts/enterprise-iam/) — the directory →
  ownership → delegation control loop these credentials plug into.
- [Enterprise IAM API](/docs/reference/enterprise-iam-api/#7-compliance-credentials-f20) — the
  exact request/response shapes for `/v1/compliance/credentials`, `/v1/provenance/credentials`,
  `/v1/issuer/key-history`, and the disclosure endpoint.
- [Credential-Safe Action Enforcement](/docs/concepts/egress-enforcement/) — where the verified
  identity is enforced on every outbound call.
- [Accountable Agent Identity (how-to)](/docs/develop/agent-identity/) — provisioning VCs and
  the revocation race.
- [Persistence (operations)](/docs/operations/persistence/) — provisioning the durable backends
  this identity state survives restarts on.
- [HTTP API — agent-idp](/docs/reference/http-api/) · [Environment variables](/docs/reference/env-vars/)
- [Feature matrix](/docs/concepts/feature-matrix/) — status of every platform capability.
- [Glossary](/docs/getting-started/glossary/) — DID, VC, VP, StatusList2021, and related terms.

## Scope note

Compliance and provenance credentials are self-attested — PaloNexus verifies the **signature
and revocation status**, never the underlying technical or regulatory claim. Independent
verification of the claims themselves (watermark detection, training-data audits, third-party
compliance verification) is explicitly out of scope; PaloNexus is the attribution and
disclosure layer, not the auditor. Deferred hardening (fail-closed status checks, a
KMS/HSM-backed issuer key, an issuance hash-chain checkpoint) is tracked in the repository
`BACKLOG.md`, not silently omitted.
