---
title: Troubleshooting
description: Decode every X-Palonexus-Deny-Reason the control plane emits — identity, registry, scope, allowlist, budget, delegation, OPA, and egress-proxy reasons — plus identity mismatch, proxy/egress wiring, clock skew, and VC expiry, each mapped to its SDK exception and fix.
sidebar:
  order: 20
---

When a governed call is refused, the control plane adds a human-readable
**`X-Palonexus-Deny-Reason`** header on the response (and writes the same string to the
[audit chain](/docs/getting-started/glossary/)). The catalog below lists every
reason the decision point (`internal/authz`,
`internal/policy`) and the egress proxy (`internal/egressproxy`) can emit — with what it means,
how it maps to an [SDK exception](/docs/getting-started/quickstart/), and how to fix it.

:::tip[Two HTTP codes, two meanings]
A **`403`** is a hard deny — the policy says no. A **`401`** on the egress path means
**needs-approval** (`X-Palonexus-Needs-Approval: true`): the action is regulated and simply has
no human-approved [delegation](/docs/getting-started/glossary/) yet. The SDK surfaces
the first as `PolicyDenied` and the second as `ApprovalRequired`.
:::

## How to read the header

```bash
# Ingress (north-south) decision:
curl -i -H 'X-Palonexus-Service: orders' localhost:9191/authz
#  HTTP/1.1 403 Forbidden
#  X-Palonexus-Deny-Reason: authentication required

# Egress proxy decision (raw curl has no agent identity):
curl -x http://egress-proxy.palonexus.svc:80 https://api.example.com
#  HTTP/1.1 407 Proxy Authentication Required
#  X-Palonexus-Deny-Reason: agent identity required
```

In the SDK, the same string is on `PolicyDecision.reason` and on the raised exception:

<!-- no-doctest: illustrative fragment — uses `task` from a neighbouring block (not standalone-runnable) -->
```python
from palonexus.errors import PolicyDenied, ApprovalRequired
try:
    task.authorize(action="runbooks:read", resource="runbooks-api:/runbooks/db-failover")
except ApprovalRequired as e:
    print("needs approval:", e.reason)   # -> the X-Palonexus-Deny-Reason value
except PolicyDenied as e:
    print("denied:", e.reason)
```

## The SDK typed error tree

Deny-by-default is a **typed contract** in the SDK, not a return code that might
go unchecked. Every governed failure mode maps to exactly one exception under the
`PaloNexusError` base, so a caller can `except` precisely the case that matters — a hard
no separately from a needs-a-human separately from the decision-point-is-down case.
The whole tree, with its trigger, the wire signal behind it, and how to handle it:

| Exception | Triggered when | HTTP / deny-reason | How to handle |
|---|---|---|---|
| `GovernanceError` | `register(...)` without an `owner` or `sponsor` (no-orphaned-agents) | client-side, **before any network call** (re-validated at agent-idp) | Supply both a mandatory owner and business sponsor. |
| `PolicyDenied` | a hard deny on a governed action | **403** + `X-Palonexus-Deny-Reason` | No path forward — inspect `e.reason` / `e.decision`; fix the scope, allowlist, or OPA (Open Policy Agent) policy. |
| `ApprovalRequired` | a regulated target with no approved delegation | **401** + `X-Palonexus-Needs-Approval: true` | Drive `task.request_delegation(...)` (or `interrupt()` in LangGraph) and have an [approver](/docs/getting-started/glossary/) approve. |
| `DelegationExpired` | a delegation's `notAfter` / TTL has elapsed | live `GET /v1/delegations/check` → `ok=false (expired)` | Request a fresh delegation; do not extend the old one. |
| `CredentialRevoked` | a Membership/Delegation VC (Verifiable Credential) was revoked mid-run (live StatusList) | **403** `agent identity verification failed` | Stop cleanly, **don't retry** — the [revocation race](/docs/develop/recipes/revocation-race/). |
| `IdentityNotProvisioned` | an operation needs a `did:key` the agent doesn't have yet | n/a (no provisioned identity) | Call `agent.provision()` before delegating/presenting. |
| `ControlPlaneUnavailable` | `/authz` or agent-idp could not be reached | transport error (**fail-closed**) | Surface/retry — **never** catch-and-ignore; that would defeat deny-by-default. |

All seven derive from `PaloNexusError`, so `except PaloNexusError` is the catch-all;
catch a subclass to react to one governed outcome. The
[temporary-elevation walkthrough](/docs/develop/guides/temporary-elevation-walkthrough/)
shows the `ApprovalRequired` → `request_delegation` branch end-to-end.

## The deny-reason catalog

The reasons fall into seven families, by which of the five concerns refused the call
(*who → what → may-they → prove-it*). Templated parts are shown in `<angle brackets>`.

### 1. Identity — *who* (the credential could not be trusted)

| `X-Palonexus-Deny-Reason` | Code | Path | Meaning & fix |
|---|---|---|---|
| `invalid credential` | 401 | ingress | A bearer token was presented but failed OIDC (OpenID Connect) verification (bad signature, wrong `aud`, expired). Fix the token / `OIDC_*` config. An *absent* token is anonymous, not this. |
| `invalid agent credential` | 401 | egress | The agent's own workload token failed verification. Re-check the agent's token issuer/audience. |
| `verified agent credential required` | 403 | egress | `AGENT_IDENTITY_MODE=vc` and **no** `X-Palonexus-Agent-VP` was presented. Present a Membership [VP](/docs/getting-started/glossary/) (verifiable presentation — the SDK / egress-sidecar does this), or run `header` mode for evaluation. |
| `agent identity verification failed` | 403 | egress, proxy | The VP did not verify — bad holder signature, wrong audience/nonce, the Membership VC doesn't chain to the issuer, **or the VC is revoked** (StatusList). See [VC expiry & revocation](#vc-expiry-revocation-and-clock-skew). |
| `actor/credential mismatch` | 403 | egress | The `X-Palonexus-Actor` header names a different agent than the verified VP proves. The header cannot override the credential — fix the actor header (or stop spoofing it). |
| `agent identity required` | 407 | proxy | No `Proxy-Authorization: Bearer <VP>` on an egress-proxy request. **This is what blocks raw `curl`.** Route through the SDK / egress-sidecar so a VP is attached. |
| `agent identity verification unavailable` | 403 | proxy | The proxy has no verifier wired (agent-idp unreachable at startup). Fix `AGENT_IDP_URL` / agent-idp health. |

### 2. Registry — *what* (the caller or target is unknown)

| `X-Palonexus-Deny-Reason` | Code | Path | Meaning & fix |
|---|---|---|---|
| `unknown service` | 403 | ingress | The `X-Palonexus-Service` target (or `Host`) is not in the [registry](/docs/getting-started/glossary/). Register it (`POST /v1/registry/services`). |
| `unknown agent` | 403 | egress | The calling agent name isn't registered. Run `pn.agents.register(...)` + `provision()`. |
| `unknown target` | 403 | egress | The egress target service isn't registered. Register the model/tool/peer. |
| `calling agent not registered` | 403 | proxy | Same as `unknown agent`, raised at the proxy after the VP verified but the name has no registry entry. |
| `caller "<name>" is not a registered agent` | 403 | egress | The caller resolved to a registry entry whose `kind` is not `agent` (e.g. an agent name pointed at a plain service). Register it as an agent. |

### 3. Policy (inline) — *may they* (scope / allowlist / budget)

| `X-Palonexus-Deny-Reason` | Code | Path | Meaning & fix |
|---|---|---|---|
| `authentication required` | 403 | ingress | The target is non-public and the caller is **anonymous** (no token). Authenticate. (Dev overlay runs anonymous → expect this for private services.) |
| `missing required scope "<scope>"` | 403 | ingress | The token is valid but lacks the registry's verbatim [`requireScope`](/docs/getting-started/glossary/). Grant the scope, or fix the registry/`CONTROL_PLANE_SERVICES` drift (a parity test guards this). |
| `<kind> "<name>" is not in <caller>'s egress allowlist` | 403 | egress, proxy | Deny-by-default: the target isn't on the agent's allowlist. Add it to the agent's registry `egress`/allowlist. |
| `call budget exceeded` | 403 | egress, proxy | The agent hit its rolling **calls-per-hour** ceiling. See [Budget exhaustion](/docs/develop/recipes/budget-exhaustion/). |
| `token budget exceeded` | 403 | egress, proxy | The agent hit its rolling **tokens-per-hour** ceiling (reported by the model-broker). |

### 4. Delegation / TBAC — *needs-approval* (regulated targets)

These regulated-target denials — the task-based access control (TBAC) layer — come
back as **401 + `X-Palonexus-Needs-Approval: true`** and surface as `ApprovalRequired`.

| `X-Palonexus-Deny-Reason` | Meaning & fix |
|---|---|
| `human-approved delegation required for regulated target` | The target's `dataClass` is `regulated` and there is no valid, task-scoped, human-approved delegation. **Request one** (`task.request_delegation(...)`) and have the [approver](/docs/getting-started/glossary/) approve it. This is the default whenever no delegation verifier is wired (fail-closed). |
| `delegation authority unreachable: <detail>` | The control plane could not reach agent-idp's `/v1/delegations/check` (transport error, non-200, decode failure). **Fail-closed** — fix agent-idp connectivity; never assume allow. |
| *(agent-idp delegation reason)* | The delegation verifier's own reason for `ok=false` — e.g. the delegation is **expired**, **revoked**, or **not found** for this `(actor, task, action, resource)`. Request a fresh delegation. |

### 5. OPA veto — *may they* (org-wide Rego, deny-overrides)

| `X-Palonexus-Deny-Reason` | Code | Path | Meaning & fix |
|---|---|---|---|
| `opa unavailable: <detail>` | 403 | ingress, egress | `OPA_URL` is set but OPA is unreachable / errored. **Fail-closed** — an unreachable policy engine must not widen access. Fix OPA health. |
| `<opa reason>` | 403 | ingress, egress | The org Rego bundle returned a deny with this reason (e.g. geo/time/data-class). Policy is **deny-overrides**: an inline allow + OPA deny = deny. Adjust the Rego or the request. |
| `opa decision` | 403 | ingress, egress | OPA denied but supplied no reason string. Add a `reason` to the Rego rule for legibility. |

### 6. Egress-proxy hold / approval — *human egress approval*

When the proxy **holds** a needs-approval or unregistered-target request for human approval and
the window elapses (or a human rejects), it denies with:

| `X-Palonexus-Deny-Reason` | Code | Meaning & fix |
|---|---|---|
| `egress to unregistered target` | — | The hold *reason* recorded while parking a call to a host the registry doesn't know. Register the target, or approve it in the **Credential-Safe Enforcement** tab. |
| `egress approval denied` | 403 | A human **rejected** the held egress request. |
| `egress approval expired` | 403 | No decision within the proxy's `ApprovalTimeout` (default 120s) → **fail-closed** expiry. Approve faster, or raise the timeout. |

### 7. Proxy transport — *the request shape was wrong*

| `X-Palonexus-Deny-Reason` | Code | Meaning & fix |
|---|---|---|
| `proxy requires absolute-URI requests` | 400 | A plaintext forward-proxy request had no absolute URI. Send `http://host/...` form (set `HTTP_PROXY`), or `CONNECT` for TLS. |
| `cannot reach target: <detail>` | 502 | The proxy authorized the call but could not dial the upstream. A network/DNS/target-down problem, **not** a policy deny. |
| `proxy does not support hijacking` | 500 | Internal: the HTTP server can't hijack the connection for a `CONNECT` tunnel. File a bug. |

:::note[Coverage]
This catalog enumerates **every** distinct string written through the two
`X-Palonexus-Deny-Reason` writers in the control plane — `writeDeny()` in
`internal/authz/authz.go` and `deny()` in `internal/egressproxy/egressproxy.go` — including the
`policy.Decision.Reason` values from `internal/policy` and the pass-through reasons from the
OPA and delegation verifiers. Templated reasons (`<scope>`, `<name>`, `<detail>`) are single
strings parameterized at runtime.
:::

## Beyond the header

### Identity mismatch

If egress denies with `actor/credential mismatch`, the `X-Palonexus-Actor` header and the agent
proved by the VP disagree. The **credential wins** — never set the actor header to a name other
than the provisioned agent. In `vc` mode, drop the header entirely and let the VP be
authoritative.

### Egress / proxy wiring

`agent identity required` (407) on traffic expected to be governed usually means the request
**bypassed** the proxy:

- Confirm `HTTPS_PROXY` / `HTTP_PROXY` point at `egress-proxy.palonexus.svc:80` and `NO_PROXY`
  includes `agent-idp.agent-idp.svc`, DNS, and `localhost`.
- `langchain_openai` **strips proxy env** from its transport — use the
  [egress-sidecar](/docs/concepts/egress-enforcement/#4-egress-identity-sidecar-for-clients-that-strip-proxy-env)
  and point the broker `base_url` at it.
- On `kind`, the default CNI does **not** enforce NetworkPolicy, so the lockdown is advisory —
  the `/authz` gate still enforces, but a pod *could* reach out directly. Use a CNI that
  enforces NetworkPolicy in production.

### VC expiry, revocation, and clock skew

`agent identity verification failed` can mean the Membership VC is **revoked** (a
[StatusList](/docs/getting-started/glossary/) hit) or **expired**:

- **Revocation is enforced on every call** — revoking a `vcJti` (`POST /v1/revoke`) denies the
  *next* decision in under a second. That's the [revocation race](/docs/develop/recipes/revocation-race/),
  surfaced in the SDK as `CredentialRevoked`.
- A **Delegation** that times out raises `DelegationExpired`; request a fresh one.
- **Clock skew** between the agent, control plane, and agent-idp can make a just-issued VP/VC
  look not-yet-valid or already-expired. Keep nodes on NTP; the VP audience+nonce and short TTLs
  assume aligned clocks.

### Fail-closed is not a bug

`opa unavailable: …`, `delegation authority unreachable: …`, `egress approval expired`, and the
SDK's `ControlPlaneUnavailable` are all the platform **denying because it could not get a
trustworthy yes**. This is [deny-by-default](/docs/concepts/security-model/) working as designed
— never "fix" it by catching and ignoring the error.

## Related

- [Security model](/docs/concepts/security-model/) — why deny-by-default / fail-closed.
- [Headers reference](/docs/reference/headers/) · [Glossary](/docs/getting-started/glossary/).
- [Recipes: revocation race](/docs/develop/recipes/revocation-race/) · [budget exhaustion](/docs/develop/recipes/budget-exhaustion/).
