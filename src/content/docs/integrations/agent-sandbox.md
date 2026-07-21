---
title: Give Kubernetes Agent Sandbox workloads just-in-time access
description: "Planned integration: Agent Sandbox isolates the workspace; PaloNexus would isolate and limit its authority — no standing credentials in the sandbox, egress restricted to a PaloNexus gateway, access revoked independently of sandbox state."
sidebar:
  order: 5
---

:::caution[Status: planned integration — design preview]
This integration is **not built yet**. Nothing on this page is installable today; it
describes intended behavior so you can evaluate the fit. The underlying enforcement
pattern — confining a workload's egress so every outbound call traverses a governed,
credential-injecting gateway — [ships today for Kubernetes pods](/docs/concepts/egress-enforcement/),
but there is no Agent Sandbox-specific adapter, session mapping, or lifecycle binding.
:::

> **Agent Sandbox isolates the workspace. PaloNexus isolates and limits its authority.**

[Kubernetes Agent Sandbox](https://agent-sandbox.sigs.k8s.io/) gives agents isolated,
stateful execution environments — `Sandbox`, `SandboxTemplate`, warm pools, gVisor/Kata
isolation. Isolation answers *where can this code safely run*. It does not answer *what
enterprise authority should this code receive* — and isolation alone cannot prevent a
credential placed inside the sandbox from being exfiltrated through injected context.
The intended integration keeps every enterprise credential outside the sandbox boundary
and makes authority a property of the task and its owner, not of the container.

## Intended integration

In the designed flow:

- The sandbox would receive **no standing enterprise credentials** — no long-lived tokens
  in environment variables, files, or mounted secrets.
- Sandbox egress would be **restricted to a PaloNexus gateway** — the only path out for
  enterprise-bound traffic.
- PaloNexus would know **which agent session owns the sandbox**, resolving it to an
  accountable human owner and an active task.
- Each outbound request would be **mapped to a task and delegation** and decided
  deny-by-default at `/authz`.
- On allow, **short-lived credentials would be injected outside the sandbox** — the
  workload never sees them, so there is nothing durable to steal.
- **Sandbox deletion would terminate the agent session**; and, independently, **owner or
  delegation revocation would terminate access** even while the sandbox keeps running —
  authority lifecycle and container lifecycle are deliberately decoupled.

This directly addresses the credential-exfiltration gap that sandbox isolation alone
cannot close: a compromised or prompt-injected workload inside the sandbox would have no
credential to leak and no route around the gateway.

## Why this pairing makes sense

Agent Sandbox's "stable identity" is a workload/network identity for reconnecting to a
sandbox — it is not accountable ownership, enterprise delegation, or lifecycle-linked
revocation. Kubernetes RBAC and NetworkPolicies govern the *infrastructure*; PaloNexus
would govern the *organizational authority* the sandboxed agent exercises against systems
beyond the cluster. The two compose rather than compete.

## What you can use today

The Agent Sandbox-specific adapter is planned. The generic mechanism it would build on is
shipped: Kubernetes pods can be confined so all egress traverses the governed proxy, with
identity verification, allowlists, budgets, human-approval holds, and the hash-chained
audit trail. See [Credential-safe action enforcement](/docs/develop/egress-enforcement/) for the
developer view and
[Credential-safe egress concepts](/docs/concepts/egress-enforcement/) for the model.

## Next

- [Integrations overview](/docs/integrations/) — every ecosystem with honest status.
- [Keep secrets outside Deep Agents sandboxes](/docs/integrations/deep-agents-sandboxes/)
  — the same "secrets outside the boundary" pattern, working today at the SDK layer.
- [What PaloNexus is not](/docs/getting-started/what-palonexus-is-not/) — including "not a
  sandbox provider."
