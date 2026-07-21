---
title: Add enterprise authorization to OpenAI Sandbox Agents
description: "Planned integration: OpenAI provides the agent harness and workspace; PaloNexus would provide enterprise authority and downstream access — harness hooks call PaloNexus before sensitive operations, and secrets stay outside the sandbox."
sidebar:
  order: 6
---

:::caution[Status: planned integration — design preview]
This integration is **not built yet**. Nothing on this page is installable today; it
describes intended behavior so you can evaluate the fit. There is no shipped OpenAI Agents
SDK hook or adapter. The equivalent working pattern for LangChain-family frameworks is the
shipped [Deep Agents / LangChain adapters](/docs/integrations/deep-agents-sandboxes/).
:::

> **OpenAI provides the agent harness and workspace. PaloNexus provides enterprise
> authority and downstream access.**

OpenAI's sandbox support gives an agent an isolated Unix-like workspace, and its
architecture deliberately separates the trusted **agent harness** (model calls, tools,
handoffs, approvals, tracing, run state) from the **sandbox compute plane** (filesystem and
command execution) — noting that authentication, audit, billing, and human review belong in
trusted infrastructure outside the sandbox. The intended PaloNexus integration slots into
exactly that seam: PaloNexus would be the trusted authority service the harness consults
before an agent touches an enterprise system, with downstream secrets kept outside the
sandbox entirely.

## Intended integration

In the designed flow, OpenAI Agents SDK hooks or tools would call PaloNexus before
sensitive operations:

1. The agent, running in OpenAI's harness with its sandbox workspace, would reach a
   protected enterprise action (deploy, restart, query, payment).
2. A harness hook would present the agent's identity, the on-behalf-of human, and the task
   to PaloNexus `/authz` — deny-by-default, the same decision contract the shipped SDK
   adapters use today.
3. PaloNexus would resolve the agent's accountable owner and active delegation, and verify
   that any approver is actually *entitled* to approve this action on this resource — not
   just that an approval occurred.
4. On allow, PaloNexus would perform the call through a governed tool or issue a
   short-lived, audience-bound credential to the trusted harness side — the sandbox never
   receives a durable secret.
5. Every decision would land on the authority trail, linking the OpenAI run to the human,
   delegation, policy, and resource behind it.

## What PaloNexus would and would not do

PaloNexus would **not** duplicate what OpenAI's platform already owns: sandbox manifests,
snapshot handling, filesystem semantics, session restoration, or command execution. The
harness's own approvals remain useful as orchestration; PaloNexus would add what they are
not designed to establish:

- **Accountable identity** — every agent bound to an active human owner and sponsor.
- **Organization-derived authority** — permissions traced from your workforce directory,
  roles, and resource ownership, not application config.
- **Approval entitlement checking** — verifying the approver has authority over the
  affected resource, may delegate it, and is still active in that role.
- **Token exchange** — short-lived, audience- and task-bound runtime credentials instead
  of standing API keys.
- **Revocation** — access cut when the task closes, the delegation is revoked, or the
  owner leaves — independent of the run's state.
- **Cross-system audit lineage** — one authority trail spanning every system the agent
  touched, not per-run tracing alone.

## What you can use today

If you build on LangChain, LangGraph, or Deep Agents, the same pattern is shipped now as
SDK adapters — see
[Keep secrets outside Deep Agents sandboxes](/docs/integrations/deep-agents-sandboxes/).
Framework-agnostic network-layer enforcement for agents deployed on Kubernetes is also
shipped — see [Credential-safe action enforcement](/docs/develop/egress-enforcement/).

## Next

- [Integrations overview](/docs/integrations/) — every ecosystem with honest status.
- [What PaloNexus is not](/docs/getting-started/what-palonexus-is-not/) — including "not an
  agent framework" and "not a sandbox provider."
