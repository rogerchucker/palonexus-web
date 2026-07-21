---
title: Keep secrets outside LangChain Deep Agents sandboxes
description: Use the shipped Deep Agents, LangChain, and LangGraph adapters so a sandboxed agent never holds enterprise credentials — protected actions run through a PaloNexus governed tool that authorizes, gates on human approval, and records the authority trail.
sidebar:
  order: 2
---

> **Deep Agents abstracts the execution backend. PaloNexus abstracts and controls
> enterprise access.**

LangChain's Deep Agents treats sandboxes as interchangeable execution backends — LangSmith,
E2B, Daytona, Modal, and others — and its own documentation is explicit about the limit of
isolation: credentials placed *inside* a sandbox can be exfiltrated through prompt
injection, so the recommended model is to keep secrets in tools outside the sandbox or
inject credentials through an outbound proxy. PaloNexus is a working implementation of
exactly that model: the sandbox holds no durable enterprise credential, and every protected
action runs through a governed tool that the sandbox cannot bypass or inspect.

## The pattern

```text
Deep Agent
   |
   +-- filesystem / execute --> sandbox backend
   |
   +-- protected enterprise action --> PaloNexus governed tool
                                          |
                                          +-- authorize
                                          +-- obtain ephemeral credential
                                          +-- execute or forward
                                          +-- record authority trail
```

The agent keeps its sandbox for filesystem work and code execution. Anything that touches a
real enterprise system is declared as a governed tool, and each call is decided at the same
deny-by-default `/authz` the rest of the platform uses — with the agent's identity, the
on-behalf-of human subject, and the task in the decision.

## What ships today, and where

Every step in that flow maps to shipped code documented on the SDK pages:

- **Declare the governed tool.** `tool_guard(pn, tool, action=…, resource=…)` declares what
  a Deep Agents tool *means* (its action + resource) and drops into
  `create_deep_agent(tools=[…])` unchanged — see the
  [Deep Agents adapter](/docs/sdk/deep-agents/).
- **Authorize every call, fail closed.** `governance_middleware(pn)` gates each governed
  tool call (and, with `gate_model=True`, the model call) through `/authz`. Allow runs the
  tool; a hard deny substitutes a deny `ToolMessage`; an unreachable decision point raises
  `ControlPlaneUnavailable` — never a silent allow. The same gate backs the
  [LangChain adapter](/docs/sdk/langchain/) (`guarded_tool` + `middleware`) and the
  [LangGraph adapter](/docs/sdk/langgraph/) (`governed_node`).
- **Hold for a human when required.** A needs-approval decision `interrupt()`s the run for
  a human-approved, time-boxed delegation, then re-checks on resume — the full
  deny → interrupt → approve → resume cycle is on the
  [LangGraph adapter](/docs/sdk/langgraph/) page, and it requires a durable checkpointer +
  `thread_id` (documented on both adapter pages).
- **Short-lived access, not standing credentials.** Approved access is a task-scoped,
  time-boxed delegation that can be revoked mid-run — a tool that worked a moment ago
  starts denying. The shipped `palonexus-governance` skill
  ([Deep Agents adapter](/docs/sdk/deep-agents/#the-shipped-palonexus-governance-skill))
  teaches the agent to stop cleanly when that happens. Ephemeral runtime credentials via
  STS token exchange are part of [Connect agents to enterprise authority](/docs/concepts/enterprise-iam/).
- **Record the authority trail.** Every decision — allow and deny — lands on the
  hash-chained audit trail (`pn.audit.verify_chain()` in the offline examples on the
  adapter pages).
- **Enforce at the network layer too.** For agents deployed on the platform, the
  credential-injecting egress proxy enforces the same decision below the framework — a raw
  `curl` from the pod is denied without a verified identity. See
  [Credential-safe action enforcement](/docs/develop/egress-enforcement/).

## Try it in five minutes, offline

The [Deep Agents adapter](/docs/sdk/deep-agents/) page includes a complete offline example
(`PaloNexus.offline()`, no network, no API key) that proves the contract: the negative
persona is hard-denied, the owner is deny-by-default until a human approves, and a mid-run
revocation flips access back to denied — with the audit chain verified at the end.

```bash
pip install 'palonexus[deepagents]'
python examples/deepagents_runbook_governance.py
```

## Next

- [Deep Agents adapter](/docs/sdk/deep-agents/) — the full how-to this page summarizes.
- [LangChain adapter](/docs/sdk/langchain/) · [LangGraph adapter](/docs/sdk/langgraph/) —
  the same gate for `create_agent` tools and `StateGraph` nodes.
- [Govern agent-to-agent delegation](/docs/integrations/a2a-delegation/) — when the agent
  hands work to a sub-agent.
- [What PaloNexus is not](/docs/getting-started/what-palonexus-is-not/) — the category
  boundary in plain words.
