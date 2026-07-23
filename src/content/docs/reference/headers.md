---
title: Headers
description: The X-Palonexus-* request and response headers, the Proxy-Authorization Verifiable Presentation at the egress proxy, and how AGENT_IDENTITY_MODE governs which are trusted.
sidebar:
  order: 4
---

The ingress and egress decision paths use `X-Palonexus-*` headers to supply request
context and return decision details. This reference defines which headers `/authz`
and the egress proxy accept, which headers they return, and when each is trusted.

The `/authz` decision is shaped by — and produces — a small set of headers. Three
acronyms recur in the tables below: a verifiable presentation (VP) is the agent's signed
wrapper around its issuer-signed Verifiable Credential (VC), and task-based access
control (TBAC) is the delegation model that scopes access to one task. The
primary path is **agent egress** — *may this agent make this call, on behalf of this
human, for this task, right now?* — and the presence of `X-Palonexus-Actor` is what
selects it. Without `X-Palonexus-Actor`, the *same* endpoint serves the foundational
**ingress** path. Header names are defined in `internal/authz/authz.go`.

## Request headers (in)

| Header | Path | Meaning |
|---|---|---|
| `Authorization: Bearer <jwt>` | both | Caller token. Ingress: the user/client. Egress: the agent's own workload token. A presented-but-invalid token is a hard **401**; an absent token is `Anonymous` (policy decides). |
| `X-Palonexus-Service` | both | The target registry service name. Ingress: the route target (falls back to `Host` if absent). Egress: the egress target (model/tool/peer). |
| `X-Palonexus-Actor` | egress | The calling **agent** name. **Its presence selects the egress path.** Resolved against the registry as the caller. In `vc` mode it is only trusted if it matches the verified VP. |
| `X-Palonexus-Agent-VP` | egress | The agent's **Membership Verifiable Presentation** (holder `did:key` sig over audience `palonexus-egress` + nonce, wrapping the issuer-signed Membership VC). When present it is verified via agent-idp; the **proven** agent name becomes authoritative. **Required in `vc` mode.** |
| `X-Palonexus-On-Behalf-Of` | egress | The **user** the agent acts for. Becomes `Subject` in policy + audit. |
| `X-Palonexus-Task` | egress | The incident/thread/run id — the "task" in TBAC. Becomes `TaskID`. |
| `X-Palonexus-Target-Kind` | egress | `model` · `tool` · `agent` — the kind of egress target (the authoritative kind is the target's registry entry). |
| `X-Palonexus-Action` | egress (optional) | Fine-grained intent for a regulated call, e.g. `runbook:read`. When set, the delegation check uses this exact action; else it defaults to `invoke` on the target. |
| `X-Palonexus-Resource` | egress (optional) | Fine-grained resource for a regulated call, e.g. `runbooks-api:/runbooks/db-failover`. Pairs with `Action`. |

## Response headers (out)

| Header | When | Meaning |
|---|---|---|
| `X-Palonexus-Subject` | allow (both) | The verified principal (user). Forwarded upstream so services never re-parse the token. |
| `X-Palonexus-Upstream` | allow (both) | The target's in-cluster DNS upstream the gateway routes to. |
| `X-Palonexus-Actor` | allow (egress) | Echoes the calling agent. |
| `X-Palonexus-Agent-DID` | allow (egress, when a VP was verified) | The cryptographically proven agent `did:key`, propagated upstream. |
| `X-Palonexus-Needs-Approval: true` | `401` (egress) | A time-boxed human-approved delegation is required. The middleware should `interrupt()` rather than fail. |
| `X-Palonexus-Deny-Reason` | any deny | Human-readable deny reason. |

> The `401` status is overloaded on egress: it is either an **invalid credential**
> (presented token failed verification) **or** a **needs-approval** signal. The
> `X-Palonexus-Needs-Approval: true` response header distinguishes the two.

## Policy-simulator dry-run headers (operator-gated)

A separate, **privileged** request path: when `X-Palonexus-Dry-Run: true` is set, `/authz`
runs the *real* egress decision against current state but suppresses every enforcement
side-effect (no enforcement audit, no budget burn, no token mint) and returns a
stage-by-stage decision trace. Because the simulator reveals policy and accepts *unproven*
identity assertions, the path is gated by an operator token and **fail-closed** — an absent or
mismatched token, or an unconfigured server, denies. Defined in `internal/authz/authz.go`;
surfaced by the portal [Policy simulator](/docs/concepts/egress-enforcement/).

| Header | Path | Meaning |
|---|---|---|
| `X-Palonexus-Dry-Run` | egress (dry-run) | `true` runs the real decision with all enforcement side-effects suppressed and returns a stage-by-stage trace as JSON. |
| `X-Palonexus-Simulate-Subject` | egress (dry-run) | The **asserted** on-behalf-of subject for the what-if (no token/VP proof required — this is why the path is operator-gated). |
| `X-Palonexus-Simulate-Actor` | egress (dry-run) | The **asserted** calling agent for the what-if (unproven; trusted only inside dry-run). |
| `X-Palonexus-Simulate-Operator` | egress (dry-run) | The operator token gating the dry-run. Must equal the control plane's configured `SimulateToken`; empty/absent/mismatched → deny. |

| Response header | When | Meaning |
|---|---|---|
| `X-Palonexus-Dry-Run: true` | dry-run response | Marks the response as a simulated decision (no enforcement happened); the body carries the stage-by-stage trace. |

## Proxy-Authorization VP (egress forward-proxy)

At the egress forward-proxy (`:9092`), identity is carried not in an
`X-Palonexus-*` header but in the standard proxy header:

```
Proxy-Authorization: Bearer <Membership-VP>
```

It is verified via agent-idp exactly like `X-Palonexus-Agent-VP`:

| Condition | Result |
|---|---|
| missing `Proxy-Authorization` | **407** Proxy Authentication Required (blocks raw `curl`) |
| invalid / spoofed / revoked VP | **403** |
| valid VP | proceeds to the same egress decision |

The egress identity sidecar mints a fresh, long-TTL (12h), revocable VP per call and
attaches it here on the agent's behalf.

## How `AGENT_IDENTITY_MODE` governs trust

The control-plane env var `AGENT_IDENTITY_MODE` decides how the actor identity is
established on egress:

| Mode | `X-Palonexus-Agent-VP` | `X-Palonexus-Actor` |
|---|---|---|
| `header` *(default)* | verified if present (defense in depth), but optional | trusted as the actor name |
| `vc` *(production)* | **required**; verified before any actor name is trusted | only accepted if it matches the proven credential |

In `vc` mode the proven, registry-bound agent name from the VP is authoritative; a
missing/invalid VP, or an actor-name mismatch, is a hard `403`. See
[Agent identity & credentials](/docs/concepts/identity-and-credentials/).

## Related

- [HTTP API](/docs/reference/http-api/)
- [Environment variables](/docs/reference/env-vars/)
- [Credential-safe action enforcement](/docs/concepts/egress-enforcement/)
