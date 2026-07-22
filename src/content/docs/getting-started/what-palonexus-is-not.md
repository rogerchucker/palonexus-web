---
title: What PaloNexus is not
description: PaloNexus is not an agent framework, agent runtime, sandbox provider, model gateway, Kubernetes operator, or workforce-IdP replacement — here is what each of those categories does, who owns it, and how PaloNexus complements it.
sidebar:
  order: 2.5
---

PaloNexus is the **authorization and accountability layer** between AI agents and the
enterprise systems they act upon. It decides *what an agent is authorized to do and whose
authority it is using* — and it deliberately does **not** compete in the categories below.
Here is the honest boundary, one category at a time.

> Agent runtimes decide **how an agent works**.
> Sandboxes decide **where its code runs**.
> PaloNexus decides **what it is authorized to do and whose authority it is using**.

## Not an agent framework

Agent frameworks — LangChain, LangGraph, Deep Agents, the OpenAI Agents SDK, CrewAI,
AutoGen — own the agent loop: prompting, tool routing, memory, handoffs, and orchestration.
PaloNexus does not build agents and ships no framework of its own. Instead it drops
governance *into* the framework you already use: the shipped
[LangChain](/docs/sdk/langchain/), [LangGraph](/docs/sdk/langgraph/), and
[Deep Agents](/docs/sdk/deep-agents/) adapters gate tool, model, and agent-to-agent calls
through the same `/authz` decision without restructuring your agent. See
[Keep secrets outside Deep Agents sandboxes](/docs/integrations/deep-agents-sandboxes/).

## Not an agent runtime

Runtimes and agent platforms — [kagent](https://kagent.dev/) is the clearest
Kubernetes-native example — own building, deploying, connecting, running, and observing
agents as workloads. PaloNexus does not run your agents. It governs the *authority* those
agents exercise, whichever runtime hosts them: the runtime keeps orchestration, memory,
models, and observability; PaloNexus supplies accountable ownership, delegation validation,
and short-lived scoped access. A kagent integration is planned — see
[Govern kagent agents with PaloNexus](/docs/integrations/kagent/).

## Not a sandbox provider

Sandbox products — [Kubernetes Agent Sandbox](https://agent-sandbox.sigs.k8s.io/), OpenAI's
sandbox workspaces, and the provider-neutral backends behind LangChain Deep Agents (E2B,
Daytona, Modal, Runloop, and others) — own isolated code execution: filesystems, command
execution, snapshots, and workspace lifecycle. PaloNexus does not provision or operate
sandboxes. Its role starts exactly where isolation stops: once a sandboxed agent needs to
touch a real enterprise system, PaloNexus is the trusted authority broker *outside* the
sandbox, so the sandbox never holds standing credentials. See the planned
[Agent Sandbox](/docs/integrations/agent-sandbox/) and
[OpenAI Agents](/docs/integrations/openai-agents/) integrations, and the working
[Deep Agents pattern](/docs/integrations/deep-agents-sandboxes/).

## Not a model gateway

Model gateways and LLM routers own provider routing, model fallback, caching, and
cost optimization across model vendors. PaloNexus does not route or resell model traffic
as a product. It treats a model call as **one more governed resource type**: the same
deny-by-default `/authz` decision, allowlist, budget, and audit record that apply to a tool
call or an agent-to-agent hop apply to a model call. If you already run a model gateway,
keep it — PaloNexus sits on the authorization edge, not the inference path. See
[Credential-safe egress enforcement](/docs/concepts/egress-enforcement/).

## Not a Kubernetes operator

Kubernetes-native agent operations — declarative agent Custom Resource Definitions (CRDs),
sandbox lifecycle CRDs, warm pools, node-level isolation — are owned by projects like kagent and Agent Sandbox,
backed by cloud-native communities. PaloNexus *deploys on* Kubernetes and ships an
integration with Envoy's external-authorization hook (`ext_authz`) and network-layer
egress enforcement as **one enforcement adapter**, but Kubernetes is a deployment target, not the product's identity. The same
authorization decision is reachable from an SDK adapter with no cluster at all. See
[Credential-safe action enforcement](/docs/develop/egress-enforcement/) for the Kubernetes mechanics.

## Not a workforce-IdP replacement

Your workforce identity provider (IdP) — Okta, Entra ID, Google Workspace, Keycloak, Logto —
remains the source of truth for *humans*: who exists, what role they hold, whether they are
still employed. PaloNexus never re-invents human identity. It connects to your IdP over
OpenID Connect (OIDC) and SCIM (System for Cross-domain Identity Management), and extends
it downward to agents: every agent is bound to an accountable
human owner from that directory, and joiner/mover/leaver changes in the IdP cascade into
agent access and delegation revocation. See
[IdP support model](/docs/concepts/enterprise-iam/#idp-support-model) and
[Connect agents to enterprise authority](/docs/concepts/enterprise-iam/).

## So what is it?

PaloNexus makes sure an AI agent can act only with authority that a real person or service
owner was entitled to delegate — and only for the task, resource, and time originally
approved. Start with the [Overview](/docs/getting-started/overview/), then browse the
[Integrations](/docs/integrations/) pages to see how it complements each ecosystem above.
