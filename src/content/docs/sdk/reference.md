---
title: API reference (auto-generated)
description: The full public surface of the palonexus SDK — the PaloNexus facade, the ten typed models, the typed error tree, the idp client, the crypto layer, and the framework adapters. Generated from docstrings + type signatures.
sidebar:
  order: 12
---

> **Auto-generated** from the shipped `palonexus` v0.1.0 package by `platform/palonexus/tools/gen_reference.py` (docstrings + type signatures, stdlib `inspect`). Do not edit by hand — regenerate with `python platform/palonexus/tools/gen_reference.py` and rebuild the docs.

Every symbol below is part of the package's public `__all__`, so this page tracks the code exactly. For task-oriented guides see the [SDK quickstart](/docs/sdk/quickstart/) and the framework adapter pages.

## Facade and task API

`from palonexus import PaloNexus` — the one typed front door. Construct with `PaloNexus.from_env()`, the explicit constructor, or `PaloNexus.offline()`.

### `PaloNexus`

Typed facade over the PaloNexus control plane + agent-idp.

Construct with `from_env` (recommended), the explicit constructor, or
`offline` for tests. Always close it (or use it as a context manager) so
the underlying ``httpx`` clients are released.

**Methods of `PaloNexus`**

#### `close(self) -> None`

Release the underlying ``httpx`` client.

#### `from_env() -> 'PaloNexus'`

Build a facade from ``PALONEXUS_*`` environment variables.

Reads ``PALONEXUS_CONTROL_PLANE_URL``, ``PALONEXUS_MGMT_URL``,
``PALONEXUS_IDP_URL``, ``PALONEXUS_API_KEY``, ``PALONEXUS_TENANT_ID``,
``PALONEXUS_AGENT_TOKEN``, and ``PALONEXUS_OFFLINE`` (``1``/``true``/``yes``
selects offline mode). Unset values fall back to the local-dev defaults.

#### `offline(fake: 'FakeControlPlane | None' = None) -> 'PaloNexus'`

Build an in-memory facade that needs no cluster (for tests/dev).

Mirrors the demo seeder's ``FakeLogtoClient`` fake client philosophy: the full
register -> deny -> delegate -> approve -> succeed flow runs against an
in-memory `FakeControlPlane`. This is the clean
seam REM-151 builds out; the foundation slice ships a thin but real fake
so the deny-by-default contract is testable today.

#### `revoke(self, credential: palonexus.models.Delegation | str, *, reason: str = '') -> bool`

Revoke a credential by its VC ``jti`` (agent-idp ``/v1/revoke``).

Accepts a `Delegation` (its approved VC jti is
used) or a raw jti string. Returns ``True`` on success.

#### `task(self, *, subject: str, task_id: str, scenario: str | None = None, actor: str = '') -> '_TaskContext'`

Bind a governed unit of work and return a context manager.

Inside the ``with`` block the acting subject + task + scenario are bound in
``contextvars`` (so every gated egress call carries the right headers and
the OTel span), and the yielded `Task` exposes ``check()`` /
``authorize()`` / ``request_delegation()``.

Example:
    >>> with pn.task(subject="ethan.park@northstar.example",
    ...              task_id="INC-4821", scenario="devops-incident") as t:
    ...     decision = t.check(action="runbooks:read",
    ...                        resource="runbooks-api:/runbooks/db-failover")

### `Agent`

A handle to a registered governed agent (returned by ``pn.agents.register``).

**Methods of `Agent`**

#### `provision(self, capabilities: list[dict[str, str]] | None = None) -> palonexus.models.AgentIdentity`

Mint (idempotently) this agent's did:key + Membership/Capability VCs.

Wraps agent-idp ``POST /v1/agents`` (register, idempotent) then
``POST /v1/agents/{name}/provision``. The private key is returned by the
IdP exactly once; it is held by the live identity, never serialized into
the returned `AgentIdentity`.

In offline mode a local did:key is minted with no network, mirroring the
scaffold's ``IdentityManager._bootstrap_offline``.

### `AgentsClient`

``pn.agents`` — register and provision governed agents.

**Methods of `AgentsClient`**

#### `register(self, name: str, *, owner: str, sponsor: str, team: str | None = None, risk_tier: str = 'medium', runtime: str = 'doks_prod', scenario: str | None = None, tenant_id: str | None = None, owner_type: str = 'employee') -> 'Agent'`

Register a governed agent, enforcing mandatory owner + sponsor.

The no-orphaned-agents rule is enforced **client-side first** (fail
closed): a missing ``owner`` or ``sponsor`` raises
`GovernanceError` before any network call, then
agent-idp's ``/v1/governance/agents`` re-validates server-side.

Args:
    name: The agent name (ties to the seed scenario's agent).
    owner: The accountable owner — a stable directory subject (mandatory).
    sponsor: The business sponsor — a stable directory subject (mandatory).
    team: Optional owning team/group key.
    risk_tier: low | medium | high | critical.
    runtime: An approved runtime, e.g. ``doks_prod``.
    scenario: The seed scenario key (e.g. ``devops-incident``), recorded
        on the returned handle for task binding.
    tenant_id: Org/tenant id; defaults to the facade's ``tenant_id``.
    owner_type: ``employee`` | ``team`` | ``service_account_owner_group``.

Returns:
    An `Agent` handle; call `provision` to mint its
    did:key + Membership VC.

### `AuditClient`

``pn.audit`` — read and verify the tamper-evident decision chain.

**Methods of `AuditClient`**

#### `tail(self, *, task_id: str | None = None, agent: str | None = None, limit: int = 200) -> list[palonexus.models.AuditEvent]`

Return recent hash-chained `AuditEvent` records.

Wraps control-plane ``GET /v1/audit`` and filters client-side by
``task_id`` / ``agent`` (the management endpoint returns the recent window).

#### `verify_chain(self) -> bool`

Verify the audit hash-chain's tamper-evidence (``GET /v1/audit/verify``).

Returns ``True`` if the chain is intact. Editing/deleting any record breaks
it and returns ``False``.

### `RevocationClient`

``pn.revocation`` — cascade revocation under an agent/owner.

**Methods of `RevocationClient`**

#### `cascade(self, *, parent_did: str | None = None, tenant: str | None = None) -> dict[str, typing.Any]`

Revoke everything under an agent/tenant (agent-idp ``/v1/revocation/cascade``).

Returns the cascade report (agents suspended/quarantined, delegations
revoked/invalidated). ``parent_did`` is accepted for API symmetry with the
plan; the server cascades by ``tenant`` today.

### `Task`

A live, governed task handle: ``check`` / ``authorize`` / ``request_delegation``.

Yielded by ``with pn.task(...) as task``. Carries the typed
`TaskSession` as `info`.

**Methods of `Task`**

#### `authorize(self, *, action: str, resource: str, service: str | None = None, target_kind: str = 'tool') -> palonexus.models.PolicyDecision`

Like `check`, but enforce the decision by raising on non-allow.

Raises:
    ApprovalRequired: The control plane needs a human-approved delegation.
    PolicyDenied: The control plane returned a hard deny.
    ControlPlaneUnavailable: The decision point was unreachable (fail closed).

#### `await_delegation(self, delegation_id: str, *, timeout: float = 600.0) -> palonexus.models.Delegation`

Poll a delegation until it is approved/denied/expired (or ``timeout``).

Returns the resolved `Delegation`. Raises
`TimeoutError` if still pending at the deadline.

#### `check(self, *, action: str, resource: str, service: str | None = None, target_kind: str = 'tool') -> palonexus.models.PolicyDecision`

Ask the control plane whether this action on this resource is allowed.

Synchronous and explicit; returns a typed
`PolicyDecision`. Does **not** raise on deny — use
`authorize` for the raise-on-deny variant. Still raises
`ControlPlaneUnavailable` if the decision point is
unreachable (fail closed).

Args:
    action: The fine-grained action, e.g. ``runbooks:read``.
    resource: The target, e.g. ``runbooks-api:/runbooks/db-failover``.
    service: Registry service to gate against; derived from ``resource``
        (the part before ``:``) when omitted.
    target_kind: ``tool`` | ``model`` | ``agent``.

#### `request_delegation(self, *, action: str, resource: str, reason: str, ttl: int = 300) -> palonexus.models.Delegation`

Request a task-scoped, human-approved delegation (agent-idp).

Wraps ``POST /v1/delegations/request`` and returns a typed
`Delegation` in ``pending`` status. Approval is a
human action (portal / ``approve``); poll with `await_delegation`.

## Request context and egress propagation

`palonexus.context` — the `contextvars`-backed binding that `pn.task(...)` sets, plus the egress header constants stamped on every governed `/authz` call.

### `RequestContext`

The acting identity + task bound to the current logical unit of work.

### `set_request_context(subject: str, task: str, *, actor: str = '', scenario: str | None = None) -> _contextvars.Token[palonexus.context.RequestContext]`

Bind the acting subject + task (+ optional actor/scenario) for this run.

Returns the ``contextvars`` token so the caller can ``reset_request_context``
on exit; the `task` context manager does this for
you. Graduated from the scaffold's ``set_request_context``.

### `reset_request_context(token: _contextvars.Token[palonexus.context.RequestContext]) -> None`

Restore the request context to its value before ``set_request_context``.

### `get_request_context() -> palonexus.context.RequestContext`

The `RequestContext` currently bound (empty if none).

### `set_tool_intent(action: str, resource: str) -> None`

Declare the fine-grained (action, resource) for the next gated tool call.

Graduated from the scaffold's ``set_tool_intent``. The decision client attaches
these as ``X-Palonexus-Action`` / ``X-Palonexus-Resource`` so the control plane
can make the regulated-data decision.

### `get_tool_intent() -> dict[str, str]`

The fine-grained intent declared for the next call (empty if none).

### `clear_tool_intent() -> None`

Clear any declared tool intent.

### `inject_trace_context(headers: dict[str, str]) -> dict[str, str]`

Best-effort W3C trace-context injection (no-op if OpenTelemetry is absent).

Mirrors the vendored idp client's ``_inject_traceparent`` so a caller's span
flows into the control plane and the spans land in one end-to-end trace.

### `propagation_headers(*, service: str, target_kind: str = 'tool', action: str = '', resource: str = '', agent_vp: str = '') -> dict[str, str]`

Build the verbatim egress header set the control plane reads at ``/authz``.

Combines the bound `RequestContext`, any declared tool intent, the
target service/kind, and (best-effort) the current trace context. This is the
single place the SDK encodes the wire contract, so the facade and every
adapter stay consistent.

### Header constants

| Constant | Value |
|---|---|
| `SERVICE_HEADER` | `'X-Palonexus-Service'` |
| `ON_BEHALF_OF_HEADER` | `'X-Palonexus-On-Behalf-Of'` |
| `TASK_HEADER` | `'X-Palonexus-Task'` |
| `ACTOR_HEADER` | `'X-Palonexus-Actor'` |
| `TARGET_KIND_HEADER` | `'X-Palonexus-Target-Kind'` |
| `ACTION_HEADER` | `'X-Palonexus-Action'` |
| `RESOURCE_HEADER` | `'X-Palonexus-Resource'` |
| `AGENT_VP_HEADER` | `'X-Palonexus-Agent-VP'` |
| `NEEDS_APPROVAL_HEADER` | `'X-Palonexus-Needs-Approval'` |
| `DENY_REASON_HEADER` | `'X-Palonexus-Deny-Reason'` |

## Models (the ten typed abstractions)

`palonexus.models` — the typed data model returned across the SDK.

### `AgentIdentity`

A governed agent's verifiable identity.

Backed by ``agent-idp`` ``/v1/agents`` + ``/v1/agents/{name}/provision``. The
private key is returned by the IdP exactly once and is held in process memory
by the live session, never serialized here.

| Field | Type | Default |
|---|---|---|
| `name` | `str` | _required_ |
| `did` | `str` | _required_ |
| `issuer_did` | `str` | _required_ |
| `membership_vc` | `str | None` | — |
| `risk_tier` | `str` | `''` |
| `runtime` | `str` | `''` |
| `provisioned` | `bool` | `False` |

### `HumanOwner`

A human principal who can own / sponsor / approve / operate / audit agents.

Backed by the workforce directory (your IdP, synced) via ``agent-idp`` ``/v1/directory/employees``.

| Field | Type | Default |
|---|---|---|
| `subject` | `str` | _required_ |
| `email` | `str | None` | — |
| `display_name` | `str` | `''` |
| `org_id` | `str` | `''` |
| `org_roles` | `list` | `PydanticUndefined` |
| `agent_authority` | `list` | `PydanticUndefined` |

### `Delegation`

A task-scoped, human-approved, time-boxed grant to an agent.

Backed by ``agent-idp`` ``/v1/delegations``. The ``vc`` (Delegation VC) is
present only once ``status == 'approved'``.

| Field | Type | Default |
|---|---|---|
| `id` | `str` | _required_ |
| `status` | `str` | _required_ |
| `action` | `str` | _required_ |
| `resource` | `str` | _required_ |
| `subject` | `str` | `''` |
| `actor` | `str` | `''` |
| `scenario` | `str | None` | — |
| `vc` | `str | None` | — |
| `expires_at` | `str | None` | — |

### `TaskSession`

The unit of governed work: a binding of subject + task + scenario + actor.

This is the *typed record* of the binding. The live, behaviour-bearing handle
(with ``check()``, ``authorize()``, ``request_delegation()``) is returned by
the `task` context manager and carries one of these
as its ``info``.

| Field | Type | Default |
|---|---|---|
| `task_id` | `str` | _required_ |
| `subject` | `str` | _required_ |
| `actor` | `str` | `''` |
| `scenario` | `str | None` | — |

### `PolicyDecision`

The control plane's answer to "may this caller reach this target right now?".

Backed by control-plane ``/authz``. ``allow`` and ``needs_approval`` are
mutually meaningful: a 200 is ``allow=True``; a 401 + needs-approval header is
``allow=False, needs_approval=True``; a 403 is ``allow=False``.

| Field | Type | Default |
|---|---|---|
| `allow` | `bool` | _required_ |
| `needs_approval` | `bool` | `False` |
| `reason` | `str` | `''` |
| `subject` | `str | None` | — |
| `upstream` | `str | None` | — |
| `trace_id` | `str | None` | — |

### `Credential`

A Verifiable Credential held by an agent: Membership, Delegation, or Capability.

Thin typed view over an ``agentdid`` JWT-VC. The raw ``vc`` is the signed JWT.

| Field | Type | Default |
|---|---|---|
| `jti` | `str` | _required_ |
| `type` | `str` | _required_ |
| `vc` | `str` | _required_ |
| `subject_did` | `str` | `''` |
| `expires_at` | `str | None` | — |

### `AuditEvent`

One tamper-evident, hash-chained decision record.

Backed by control-plane ``/v1/audit``. Each record's ``prev_hash`` equals the
previous record's ``hash``; editing or deleting any record breaks the chain
(verified by ``pn.audit.verify_chain()``).

| Field | Type | Default |
|---|---|---|
| `seq` | `int` | _required_ |
| `hash` | `str` | `''` |
| `prev_hash` | `str` | `''` |
| `decision` | `str` | `''` |
| `actor` | `str` | `''` |
| `subject` | `str` | `''` |
| `action` | `str` | `''` |
| `resource` | `str` | `''` |
| `task_id` | `str | None` | — |
| `ts` | `str` | `''` |

### `Resource`

A registry service + scope target an agent may try to reach.

Couples a registry service name to the verbatim control-plane ``requireScope``
the gateway enforces at ``/authz`` — the anti-drift surface the parity test
(REM-146) guards.

| Field | Type | Default |
|---|---|---|
| `service` | `str` | _required_ |
| `identifier` | `str` | `''` |
| `data_class` | `str` | `''` |
| `require_scope` | `str | None` | — |

### `AssetType`

A PaloNexus-only asset taxonomy entry (not held in the workforce IdP).

The workforce IdP holds identity/roles; PaloNexus holds asset types and maps human
permissions -> agent task scopes (§15.1 separation).

| Field | Type | Default |
|---|---|---|
| `key` | `str` | _required_ |
| `domain` | `str` | `''` |
| `task_scopes` | `list` | `PydanticUndefined` |

### `PolicyDecisionLog(*args, **kwargs)`

Built-in mutable sequence.

If no argument is given, the constructor creates a new empty list.
The argument must be an iterable if specified.

## Errors (the typed tree)

`palonexus.errors` — `PaloNexusError` (base) → `GovernanceError`, `PolicyDenied`, `ApprovalRequired`, `DelegationExpired`, `CredentialRevoked`, `IdentityNotProvisioned`, `ControlPlaneUnavailable`. Catch the one you care about.

### `PaloNexusError`

Base class for every error the PaloNexus SDK raises.

Catch this to handle any SDK failure generically; catch a subclass to react
to a specific governed outcome.

### `GovernanceError`

A governance rule was violated at registration or lifecycle time.

Raised, for example, when ``pn.agents.register(...)`` is called without the
mandatory ``owner`` or ``sponsor`` (the no-orphaned-agents rule, mirroring
``agent-idp``'s ``governance.GovernanceError``).

### `PolicyDenied`

The control plane returned a hard deny (HTTP 403) for a governed action.

Attributes:
    reason: The human-readable deny reason (``X-Palonexus-Deny-Reason``).
    decision: The full `PolicyDecision`, if available.

### `ApprovalRequired`

The action is allowed in principle but needs a human-approved delegation.

Corresponds to the control plane's ``401`` + ``X-Palonexus-Needs-Approval:
true`` response. Catch this to drive the ``request_delegation`` flow (or, in
LangGraph, to ``interrupt()`` for approval).

Attributes:
    reason: Why approval is required.
    decision: The full `PolicyDecision`, if available.

### `DelegationExpired`

A delegation's time-box (``notAfter`` / TTL) has elapsed.

The credential that authorized an action is no longer valid; a fresh
delegation must be requested and approved.

### `CredentialRevoked`

A credential (Membership / Delegation / Capability VC) has been revoked.

Surfaces when a StatusList2021 check fails mid-run — e.g. security cascades a
revocation while a task is in flight. Proves live revocation to the caller.

### `IdentityNotProvisioned`

An operation needs a provisioned agent identity (did:key + Membership VC).

Raised when, for example, a delegation or presentation is attempted before
``agent.provision()`` has run.

### `ControlPlaneUnavailable`

The control plane / agent-idp decision point could not be reached.

This is **fail-closed**: the SDK raises this rather than assuming allow. Never
catch-and-ignore it to "keep going" — that would defeat deny-by-default.

## IdP client (`palonexus.idp`)

`palonexus.idp` re-exports the vendored agent-idp HTTP client (idp-sdk v0.1.0) — onboarding, delegation, and revocation against agent-idp.

### `IdpClient`

Client used by agents/services to obtain tokens and drive escalations.

Signatures are fixed by CONTRACTS §3.3.

**Methods of `IdpClient`**

#### `approve(self, escalation_id: str, approver: str) -> dict`

POST /escalations/{id}/approve.

#### `client_id_to_name(self) -> str`

Resolve the identity name (sub) for this client.

The escalation `requestor` is the identity name. We resolve it from the
IDP once and cache; falls back to client_id if resolution is unavailable.

#### `close(self) -> None`

#### `deny(self, escalation_id: str, approver: str, reason: str = '') -> dict`

POST /escalations/{id}/deny.

#### `get_base_token(self) -> str`

POST /token -> base JWT carrying only the identity's default_scopes.

#### `get_escalation(self, escalation_id: str) -> dict`

GET /escalations/{id}.

#### `list_pending(self) -> list[dict]`

GET /escalations?status=pending -> items.

#### `mint_elevated_token(self, escalation_id: str) -> str`

POST /token/elevated -> elevated JWT (300s). Raises on 400.

#### `request_escalation(self, resource: str, scope: str, ticket_id: str, justification: str) -> str`

POST /escalations -> escalation_id.

#### `wait_for_escalation(self, escalation_id: str, timeout: float = 300) -> str`

Poll until the escalation is decided. Returns "approved"|"denied".

### `verify_token(token: str, jwks_url: str, audience: str = 'runbooks', issuer: str = 'https://idp.agent-idp.svc.cluster.local') -> dict`

Verify an RS256 JWT against the IDP JWKS, return claims or raise.

Checks signature, expiry, issuer and audience membership.

- ``issuer`` defaults to ``https://idp.agent-idp.svc.cluster.local`` and must
  equal the token's ``iss`` (string match, no OIDC discovery). Pass a
  different value if the IDP is configured with a non-default ``IDP_ISSUER``.
- ``audience`` defaults to ``"runbooks"``. The token's ``aud`` is a JSON array
  (e.g. ``["agent-idp-platform", "runbooks"]``); PyJWT checks **membership**,
  so callers can pass ``"agent-idp-platform"`` (platform RPs like incy) or
  ``"runbooks"`` (runbooks-api) and both succeed against the same token.

Raises ``jwt.PyJWTError`` (or subclass) on any failure.

## Crypto (`palonexus.crypto`)

`palonexus.crypto` re-exports the standalone `agentdid` crypto primitives (agentdid v0.1.0) — Ed25519 keys, did:web / did:key, JWT-VC issuance/verification, VP challenge, and delegation-chain verification.

### `generate_keypair() -> tuple[str, str]`

Generate an Ed25519 keypair.

Returns ``(priv_b64, pub_multibase)`` where ``priv_b64`` is base64 of the
32-byte raw private seed and ``pub_multibase`` is the ``z…`` multibase form.

### `pub_to_multibase(pub: cryptography.hazmat.primitives.asymmetric.ed25519.Ed25519PublicKey) -> str`

### `multibase_to_pub(pub_multibase: str) -> cryptography.hazmat.primitives.asymmetric.ed25519.Ed25519PublicKey`

### `multibase_to_raw(pub_multibase: str) -> bytes`

Return the raw 32-byte ed25519 public key from a publicKeyMultibase.

### `raw_to_multibase(raw: bytes) -> str`

### `priv_from_b64(priv_b64: str) -> cryptography.hazmat.primitives.asymmetric.ed25519.Ed25519PrivateKey`

### `b58encode(data: bytes) -> str`

### `b58decode(s: str) -> bytes`

### `did_for(name: str, host: str = 'agent-idp.agent-idp.svc') -> str`

Return the agent DID ``did:web:<host>:agents:<name>``.

### `did_key_for(pub_multibase: str) -> str`

Return the ``did:key`` for an Ed25519 public key (CONTRACTS §12.1).

Our ``pub_multibase`` is already the multibase (0xed01-prefixed) Ed25519
public key, which is exactly the ``did:key`` identifier, so the DID is simply
``"did:key:" + pub_multibase``.

### `kid_for(did: str) -> str`

Return the default verificationMethod id (kid) for a DID.

- ``did:key:z…`` → ``did:key:z…#z…`` (the fragment repeats the multibase,
  per the did:key convention).
- everything else (``did:web``) → ``<did>#key-1``.

Used by ``issue_vc``/``build_vp``/``respond_challenge`` so the kid in a JWT
header (or challenge response) always resolves via ``Resolver.public_key``.

### `build_did_document(did: str, pub_multibase: str, service_endpoint: str, capabilities: list) -> dict`

Build a W3C DID Document per CONTRACTS §12.1.

- verificationMethod id = ``<did>#key-1`` (Ed25519VerificationKey2020)
- authentication + assertionMethod reference that key
- one ``AgentService`` service entry
- ``metadata.capabilities`` carries the declared capability actions

### `Resolver`

Resolve did:web DIDs to DID Documents.

Parameters
----------
registry_base_url:
    Optional base URL of the registry/IDP. When set, resolution targets this
    origin (host/scheme taken from it) instead of the DID's own host — useful
    when every doc is served by one registry. The path still follows did:web
    rules. If omitted, the DID's own host is used.
docs:
    Optional in-memory ``{did: did_document}`` mapping (test mode). Checked
    first; if the DID is present no network call is made.
resolve_fn:
    Optional callable ``did -> did_document`` (test mode / custom backend).
http_client:
    Optional object with a ``.get(url)`` method returning something with
    ``.json()`` (e.g. ``httpx.Client``). Lazily created if needed.

**Methods of `Resolver`**

#### `add_document(self, did: str, doc: dict) -> None`

Register an in-memory DID Document (test mode).

#### `public_key(self, did_or_kid: str) -> cryptography.hazmat.primitives.asymmetric.ed25519.Ed25519PublicKey`

Resolve a DID (or ``<did>#key-id`` kid) to its Ed25519 public key.

Handles both methods:
  - a bare ``did:key:z…`` or its ``did:key:z…#z…`` kid form,
  - a bare ``did:web:…`` or its ``…#key-1`` kid form.

#### `resolve(self, did: str) -> dict`

### `did_web_to_url(did: str) -> str`

Translate a did:web identifier to its DID Document URL.

- root  ``did:web:host``            -> ``http(s)://host/.well-known/did.json``
- pathful ``did:web:host:a:b``      -> ``http(s)://host/a/b/did.json``

did:web encodes ``:`` as path separators and percent-decodes each segment;
a literal port is encoded as ``%3A`` within the host segment.

### `issue_vc(issuer_did: str, issuer_priv_b64: str, subject_did: str, vc_type: str, capability: dict | None, *, ttl_s: int, parent_jwt: str | None = None) -> str`

Issue a JWT-VC signed with the issuer's Ed25519 key (EdDSA).

``vc_type`` is the specific type appended after ``VerifiableCredential``
(e.g. ``"MembershipCredential"``, ``"CapabilityCredential"``,
``"DelegationCredential"``). ``capability`` is the capability dict
(action/resource/constraints) or ``None`` (e.g. membership credentials).
``parent_jwt`` embeds the parent VC for delegation chains.

### `verify_vc(vc_jwt, resolver, *, status_url: str | None = None) -> dict`

Verify a JWT-VC: resolve the issuer key via ``kid``, check EdDSA + exp,
and (if ``status_url`` given) check revocation. Returns claims; raises on
any failure.

### `build_vp(holder_did: str, holder_priv_b64: str, vc_jwts: list, *, audience: str, nonce: str, ttl_s: int = 300) -> str`

Build a JWT-VP wrapping ``vc_jwts``, signed by the holder's Ed25519 key.

### `verify_vp(vp_jwt, resolver, *, audience: str, nonce: str) -> dict`

Verify holder signature + audience + nonce. Returns
``{holder_did, vc_jwts}``. Raises on failure.

### `verify_delegation_chain(leaf_vc_jwt: str, resolver, *, root_did: str, action: str, resource: str, status_url: str | None = None, max_depth: int = 16) -> bool`

Return True iff the delegation chain is fully valid (see module docstring).

### `make_challenge(required_state: list) -> dict`

Create a challenge with a fresh nonce and the required state field names.

### `respond_challenge(holder_priv_b64: str, holder_did: str, nonce: str, state: dict) -> dict`

Sign a challenge response proving the holder's current execution state.

### `verify_challenge(resp: dict, holder_did: str, resolver, *, nonce: str, constraints: dict) -> bool`

Verify a challenge response.

Checks:
  - signature over ``nonce.state_commitment`` via the holder's DID key,
  - the recomputed commitment of ``resp["state"]`` matches ``state_commitment``,
  - the state satisfies ``constraints``:
      * ``constraints["execContext"]`` is a subset of the state (if present),
      * every name in ``constraints["required_state"]`` (or
        ``constraints["required"]``) is present and non-empty in the state.
Returns True only if everything holds.

### `state_commitment(state: dict) -> str`

SHA-256 hex over canonical JSON (sorted keys, no whitespace).

### `enforce_capability(capability: dict, *, action: str, resource: str, context: dict) -> bool`

Enforce a capability against a concrete request.

Checks:
  - action equals the capability action
  - resource glob-matches the capability resource (trailing ``/*`` supported)
  - current time within ``constraints.notBefore`` / ``notAfter`` (if set)
  - ``constraints.execContext`` is a subset of ``context``

NOTE: ``maxCalls`` is a stateful rate cap and is NOT enforced here — the
caller (verifier) must track call counts and enforce it. This function is
pure and stateless.

### `resource_matches(pattern: str, resource: str) -> bool`

Match ``resource`` against ``pattern``. Supports a trailing ``/*`` wildcard
meaning "this prefix and anything below it". Exact match otherwise.

### `is_revoked(vc_id, status_url, *, fetch: Optional[Callable[[str], dict]] = None) -> bool`

Return True if ``vc_id`` is revoked per the status list at ``status_url``.

``fetch`` is an injectable ``url -> dict`` for tests; defaults to httpx GET.
Fails open (returns False) if the status list can't be fetched.

### Crypto constants

| Constant | Value |
|---|---|
| `ROOT_DID` | `'did:web:agent-idp.agent-idp.svc'` |
| `DEFAULT_HOST` | `'agent-idp.agent-idp.svc'` |

## Framework adapters

Opt-in extras (`pip install 'palonexus[langchain|langgraph|deepagents]'`). Each drops the same `/authz` gate into the framework's own extension point.

### LangChain (`palonexus.langchain`)

### `middleware(pn: 'PaloNexus', *, gate_model: bool = False, model_action: str = 'model:invoke', model_resource: str = 'model-openai') -> Any`

Return ``create_agent`` middleware that gates governed tool (and model) calls.

Drops into ``create_agent(..., middleware=[middleware(pn)])``. On each tool call
that was declared via `guarded_tool`, the gate asks ``pn`` (the control
plane, or the offline ``FakeControlPlane``) and **fails closed**:

* **allow** -> the tool runs;
* **needs-approval** -> ``interrupt()`` pauses the run for a human-approved,
  time-boxed delegation (requires a checkpointer + ``thread_id``); on resume the
  gate re-checks and runs the tool only if it is now allowed, else returns a
  deny ``ToolMessage``;
* **hard deny** -> a deny ``ToolMessage`` is substituted (never a silent allow);
* an unreachable decision point raises
  `ControlPlaneUnavailable` (fail closed).

Tools that were *not* declared via `guarded_tool` are passed through
ungoverned.

Args:
    pn: The `PaloNexus` facade to decide through.
    gate_model: Also gate the model call edge (promotes ``palonexus_model_gate``).
        Off by default so a plain ``offline()`` demo runs without a model grant.
    model_action: The action recorded for the model egress edge.
    model_resource: The logical model service gated when ``gate_model`` is set.

Returns:
    A LangChain ``AgentMiddleware`` instance.

Raises:
    ImportError: ``langchain`` is not installed (install the ``langchain`` extra).

### `guarded_tool(tool: Any, *, action: str, resource: collections.abc.Callable[[dict[str, typing.Any]], str] | str, target_kind: str = 'tool') -> Any`

Declare the governed (action, resource) a LangChain tool maps to.

Registers the tool so `middleware` gates its egress, and returns the
*same* tool object (so it drops straight into ``create_agent(tools=[...])``).

Args:
    tool: A LangChain ``@tool`` callable (a ``BaseTool``).
    action: The action the tool performs, e.g. ``runbooks:read``.
    resource: The target resource, or a callable deriving it from the tool
        args, e.g. ``lambda a: f"runbooks-api:/runbooks/{a['name']}"``.
    target_kind: ``tool`` | ``model`` | ``agent`` (the egress edge kind).

Returns:
    The same tool, now governed.

Raises:
    ImportError: ``langchain`` is not installed (install the ``langchain`` extra).
    TypeError: ``tool`` has no resolvable name.

### LangGraph (`palonexus.langgraph`)

### `governed_node(pn: 'PaloNexus', *, action: str, resource: collections.abc.Callable[[typing.Any], str] | str, target_kind: str = 'tool', reason: str | None = None, ttl: int = 300) -> collections.abc.Callable[[collections.abc.Callable[..., typing.Any]], collections.abc.Callable[..., typing.Any]]`

Decorate a LangGraph node so it only runs if ``/authz`` allows.

Mirrors ``incident-triage``'s deny -> interrupt -> approve -> re-read, with the
boilerplate removed:

* **allow** -> the wrapped node runs;
* **needs-approval** -> a delegation is requested automatically (idempotent) and
  ``interrupt()`` pauses the graph for human approval; on resume the decision is
  re-checked and the node runs only if it is now allowed;
* **hard deny** -> `PolicyDenied` (fail closed);
* unreachable decision point -> `ControlPlaneUnavailable`.

Args:
    pn: The facade to decide through.
    action: The governed action, e.g. ``runbooks:read``.
    resource: The target resource, or a callable deriving it from graph state,
        e.g. ``lambda s: f"runbooks-api:/runbooks/{s['runbook_name']}"``.
    target_kind: ``tool`` | ``model`` | ``agent``.
    reason: Delegation request reason; defaults to a task-derived string.
    ttl: Delegation time-box in seconds (default 300).

Returns:
    A decorator that wraps a ``state -> state-update`` node function.

Raises:
    ImportError: ``langgraph`` is not installed (install the ``langgraph`` extra).

### `resume_after_approval(pn: 'PaloNexus') -> collections.abc.Callable[..., typing.Any]`

Return a LangGraph node that resumes a run once a delegation is approved.

Pairs with `governed_node` for graphs that use an explicit resume node
instead of interrupt-in-place: the graph interrupts on needs-approval, a human
approves the delegation, and this node awaits/confirms the approval and emits a
state update so the graph can loop back into the governed node.

The node inspects the bound `RequestContext` for the
acting subject and resolves the open delegation it just had approved (offline),
or the ``palonexus_delegation_id`` carried in graph state (live). It returns
``{"palonexus_resumed": True, "palonexus_delegation_status": "approved"}`` on
success.

Raises:
    ImportError: ``langgraph`` is not installed.
    ApprovalRequired: A delegation exists but is still pending.
    PolicyDenied: There is no delegation to resume.

### Deep Agents (`palonexus.deepagents`)

### `tool_guard(pn: 'PaloNexus', tool: Any, *, action: str, resource: collections.abc.Callable[[dict[str, typing.Any]], str] | str, target_kind: str = 'tool') -> Any`

Declare the governed ``(action, resource)`` a Deep Agents tool maps to.

Registers the tool with the shared PaloNexus guard registry (the same one
`governance_middleware` reads) and returns the *same* tool object, so it
drops straight into ``create_deep_agent(tools=[...])``. Enforcement happens in
`governance_middleware`; ``pn`` is accepted for call-site symmetry with the
plan's API (and so a future standalone gate can bind it).

Args:
    pn: The `PaloNexus` facade the run decides through.
    tool: A Deep Agents / LangChain ``@tool`` callable (a ``BaseTool``).
    action: The governed action, e.g. ``runbooks:read``.
    resource: The target resource, or a callable deriving it from the tool args,
        e.g. ``lambda a: f"runbooks-api:/runbooks/{a['name']}"``.
    target_kind: ``tool`` | ``model`` | ``agent`` (the egress edge kind).

Returns:
    The same tool, now governed.

Raises:
    ImportError: ``deepagents`` is not installed (install the ``deepagents`` extra).
    TypeError: ``tool`` has no resolvable name.

### `governance_middleware(pn: 'PaloNexus', *, gate_model: bool = False, model_action: str = 'model:invoke', model_resource: str = 'model-anthropic') -> Any`

Return Deep Agents middleware that gates every governed tool/model call via ``/authz``.

Drops into ``create_deep_agent(..., middleware=[governance_middleware(pn)])``.
On each tool declared via `tool_guard`, the gate asks ``pn`` (the control
plane, or the offline ``FakeControlPlane``) and **fails closed**:

* **allow** -> the tool runs;
* **needs-approval** -> ``interrupt()`` pauses the run for a human-approved,
  time-boxed delegation (requires a ``checkpointer`` + ``thread_id``); on resume
  the gate re-checks and runs the tool only if it is now allowed;
* **hard deny** -> a deny ``ToolMessage`` is substituted (never a silent allow);
* an unreachable decision point raises
  `ControlPlaneUnavailable` (fail closed).

Because Deep Agents middleware is LangChain ``AgentMiddleware``, this reuses the
shipped `middleware` gate verbatim.

Args:
    pn: The facade to decide through.
    gate_model: Also gate the model-call edge (so *every* tool **and** model call
        is governed). Off by default so a plain ``offline()`` demo runs without a
        model grant; set ``True`` for the full "every egress" posture.
    model_action: The action recorded for the model egress edge.
    model_resource: The logical model service gated when ``gate_model`` is set.

Returns:
    A LangChain ``AgentMiddleware`` instance Deep Agents accepts.

Raises:
    ImportError: ``deepagents`` is not installed (install the ``deepagents`` extra).

### `governance_skill_dir() -> str`

Return the directory of the shipped ``palonexus-governance`` skill.

Pass it straight into ``create_deep_agent(skills=[governance_skill_dir()])``. The
directory contains a single ``SKILL.md`` written for progressive disclosure (the
agent loads it only when a governed tool needs delegation). Needs no extra — it
only resolves a shipped path.

Raises:
    FileNotFoundError: The shipped skill could not be located (packaging error).

### `governance_skill_markdown() -> str`

Return the text of the shipped ``palonexus-governance`` ``SKILL.md``.

Useful for loading the skill into a non-filesystem backend (``StoreBackend``) or
for asserting its contents in tests. Needs no extra.

Raises:
    FileNotFoundError: The shipped ``SKILL.md`` is missing (packaging error).

### `GOVERNANCE_SKILL`

```python
GOVERNANCE_SKILL = 'palonexus-governance'
```

