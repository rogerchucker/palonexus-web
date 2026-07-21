---
title: Govern Model Context Protocol tool access
description: "Planned integration: an MCP gateway that sits between agents and MCP servers — authorizing each tool call against the authority graph, injecting short-lived credentials, and recording the authority trail."
sidebar:
  order: 7
---

:::caution[Status: planned integration — design preview]
This integration is **not built yet**. Nothing on this page is installable today; it
describes intended behavior so you can evaluate the fit. There is no shipped MCP gateway.
The same governance contract ships today at the SDK layer for LangChain-family tools —
see the [Deep Agents / LangChain adapters](/docs/integrations/deep-agents-sandboxes/).
:::

> **MCP standardizes how agents reach tools. PaloNexus would decide whose authority each
> tool call carries.**

The Model Context Protocol is becoming the common wire format between agents and tools:
one client, many servers, uniform tool discovery and invocation. That uniformity is also
the governance opportunity — and the risk. An MCP server typically holds its own
credentials for the system behind it, and any agent that can reach the server can exercise
them. The protocol authenticates *connections*; it does not establish *whose enterprise
authority* a given tool call is using, whether that authority was validly delegated, or
whether it is still in force.

## Intended integration: a governed MCP gateway

In the designed flow, a PaloNexus MCP gateway would sit between agents and your MCP
servers:

1. Agents would connect to the gateway instead of directly to MCP servers — one governed
   choke point for the whole tool estate.
2. Each tool invocation would carry the agent's identity, the on-behalf-of human subject,
   and the task, and would be decided deny-by-default at `/authz` — the same authorization
   contract the shipped [SDK adapters](/docs/sdk/langchain/) use.
3. The decision would consult the authority graph: the agent's accountable owner, the
   active delegation, the approver's entitlement, and task/time constraints — per tool,
   per resource, not per connection.
4. Sensitive tools would be held for human approval, routed to the humans entitled to
   approve that action on that resource.
5. On allow, the gateway would inject short-lived, audience-bound credentials toward the
   MCP server — agents would hold no standing MCP or downstream secrets.
6. Every invocation — allow and deny — would land on the authority trail, giving one audit
   spine across every MCP server behind the gateway.

Revocation would be immediate and central: when a task closes, a delegation is revoked, or
the owning human leaves, the gateway would stop honoring the agent's calls across all
servers at once — no per-server credential rotation.

## What you can use today

The MCP gateway is planned. The decision contract it would enforce is shipped and usable
now in two forms: governed tools at the SDK layer
([LangChain](/docs/sdk/langchain/), [LangGraph](/docs/sdk/langgraph/),
[Deep Agents](/docs/sdk/deep-agents/)), and framework-agnostic network-layer
[egress enforcement](/docs/develop/egress-enforcement/) for agents deployed on the
platform — any tool call, MCP or otherwise, that leaves a governed pod already traverses
`/authz`.

## Next

- [Integrations overview](/docs/integrations/) — every ecosystem with honest status.
- [Govern agent-to-agent delegation](/docs/integrations/a2a-delegation/) — the same
  no-privileged-path principle, working today.
- [What PaloNexus is not](/docs/getting-started/what-palonexus-is-not/) — including "not a
  model gateway."
