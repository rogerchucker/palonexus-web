---
title: Integrations
description: Keep your runtime, add accountable authorization — how PaloNexus plugs into agent frameworks, sandboxes, and protocols, with an honest available/planned status for each ecosystem.
sidebar:
  order: 1
---

Every PaloNexus integration follows one thesis: **keep your runtime, add accountable
authorization.** You do not adopt a new agent framework, rewrite your agents, or move them
into a PaloNexus-hosted environment. Your framework keeps the agent loop; your sandbox
keeps the workspace; PaloNexus adds the missing layer — an accountable owner, a validated
delegation, task-scoped short-lived access, and a verifiable authority trail — behind a
single deny-by-default `/authz` decision.

Integrations attach that decision in one of **three enforcement modes**: in **governed
tool mode**, PaloNexus wraps or hosts the tool so credentials never reach the agent (this
is how the [LangChain](/docs/sdk/langchain/), [LangGraph](/docs/sdk/langgraph/), and
[Deep Agents](/docs/sdk/deep-agents/) adapters work); in **token exchange mode**, PaloNexus
issues an ephemeral, scoped credential to a trusted runtime component (the STS in
[Connect agents to enterprise authority](/docs/concepts/enterprise-iam/)); and in **egress gateway mode**, the
agent's outbound request traverses a PaloNexus gateway that authorizes it and injects
credentials after the untrusted boundary (today's
[network-layer egress enforcement](/docs/concepts/egress-enforcement/) on Kubernetes is
one implementation of this mode).

## Ecosystems

| Ecosystem | How it integrates | Status |
|---|---|---|
| [LangChain](/docs/sdk/langchain/) | `guarded_tool` + `middleware(pn)` gate every tool (and optionally model) call through `/authz` | **Available** — SDK adapter |
| [LangGraph](/docs/sdk/langgraph/) | `governed_node` gates a graph node; deny → interrupt → human approval → resume | **Available** — SDK adapter |
| [Deep Agents](/docs/integrations/deep-agents-sandboxes/) | `tool_guard` + `governance_middleware` + the shipped `palonexus-governance` skill | **Available** — SDK adapter |
| [Agent-to-agent (A2A) delegation](/docs/integrations/a2a-delegation/) | The A2A hop is itself gated at `/authz` and carries the original on-behalf-of human subject | **Available** — recipe |
| [kagent](/docs/integrations/kagent/) | Register kagent-deployed agents, resolve owners, gate tool/MCP calls, inject short-lived credentials | **Planned** — design preview |
| [Kubernetes Agent Sandbox](/docs/integrations/agent-sandbox/) | No standing credentials in the sandbox; egress restricted to a PaloNexus gateway | **Planned** — design preview |
| [OpenAI Agents SDK](/docs/integrations/openai-agents/) | Harness hooks call PaloNexus before sensitive operations; secrets stay outside the sandbox | **Planned** — design preview |
| [MCP gateway](/docs/integrations/mcp/) | A governed gateway between agents and MCP servers, authorizing and credentialing each tool call | **Planned** — design preview |

Pages marked **Planned** carry a design-preview banner and describe intended behavior only
— nothing on them is installable today. That is deliberate: every capability claim in these
docs maps to shipped code or says so.

## Where to start

- Using LangChain, LangGraph, or Deep Agents today? Start with
  [Keep secrets outside Deep Agents sandboxes](/docs/integrations/deep-agents-sandboxes/)
  and the SDK adapter pages it links.
- Composing multi-agent systems? Read
  [Govern agent-to-agent delegation](/docs/integrations/a2a-delegation/).
- Wondering what PaloNexus deliberately does *not* do? See
  [What PaloNexus is not](/docs/getting-started/what-palonexus-is-not/).
