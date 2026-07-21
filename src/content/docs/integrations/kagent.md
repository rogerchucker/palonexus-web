---
title: Govern kagent agents with PaloNexus
description: "Planned integration: kagent runs the agent as a Kubernetes-native workload; PaloNexus would govern the authority it uses — owner resolution, delegation validation, and short-lived downstream credentials for every tool and MCP call."
sidebar:
  order: 4
---

:::caution[Status: planned integration — design preview]
This integration is **not built yet**. Nothing on this page is installable today; it
describes intended behavior so you can evaluate the fit. The generic building blocks it
would compose — Envoy `ext_authz`, [network-layer egress enforcement](/docs/concepts/egress-enforcement/),
and the `/authz` decision — ship today, but there is no kagent-specific controller,
interceptor, or CRD support.
:::

> **kagent runs the agent. PaloNexus governs the authority it uses.**

[kagent](https://kagent.dev/) makes agents behave like Kubernetes-native workloads:
declarative agent CRDs, model configuration, built-in cloud-native tools, MCP integration,
and human approval gates. What it does not establish is *enterprise authority*: which human
is accountable for the agent, whether an approver was actually entitled to approve an
action on that resource, and what happens to the agent's access when that human changes
role or leaves. That is the layer PaloNexus would add — without touching how kagent builds,
runs, or observes the agent.

## Intended integration flow

The design follows the "keep your runtime, add accountable authorization" pattern:

1. kagent deploys the agent using its Custom Resource Definition, as it does today.
2. A PaloNexus controller would register the agent and resolve its accountable human owner
   from the workforce directory.
3. The agent's tool and MCP calls would pass through a PaloNexus gateway (the
   [egress gateway mode](/docs/integrations/) — one of the three enforcement modes).
4. PaloNexus would evaluate the delegation and resource ownership on each call —
   deny-by-default, the same `/authz` contract the shipped
   [SDK adapters](/docs/sdk/langchain/) use.
5. On allow, PaloNexus would inject short-lived downstream credentials outside the agent
   boundary, so the kagent workload never holds standing secrets.
6. kagent continues handling orchestration, memory, models, and observability — unchanged.

## What this would look like: the SRE restart demo

As intended behavior, the difference from a generic "require approval" flag:

- kagent's SRE agent can inspect pods — routine, allowed.
- It attempts to restart a production deployment (`checkout`).
- PaloNexus sees that the agent's owner does **not** own the checkout service — so it
  refuses to route the approval to an arbitrary administrator.
- Approval is routed to the actual service owner or the incident commander — the people
  *entitled* to approve this action for this resource.
- On approval, PaloNexus issues five-minute restart authority scoped to that one
  deployment.
- The same agent still cannot restart any other deployment, and the whole exchange —
  request, owner check, approval, scoped grant, expiry — lands on the authority trail.

Approver-authority verification is what distinguishes this from an approval gate: not
"a human clicked approve," but "the human who approved was entitled to."

## What you can use today

The kagent-specific pieces (controller, CRD registration, tool interceptor) are planned.
If you run agents on Kubernetes today — kagent-deployed or otherwise — the shipped
framework-agnostic enforcement already applies: pod egress can be confined so every
outbound call traverses the governed proxy and `/authz`, with human-approval holds and the
hash-chained audit trail. See [Credential-safe action enforcement](/docs/develop/egress-enforcement/) and
[Deploy an agent](/docs/develop/deploy-an-agent/).

## Next

- [Integrations overview](/docs/integrations/) — every ecosystem with honest status.
- [What PaloNexus is not](/docs/getting-started/what-palonexus-is-not/) — including "not an
  agent runtime."
- [Temporary elevation walkthrough](/docs/develop/guides/temporary-elevation-walkthrough/)
  — the shipped flow the SRE demo story builds on.
