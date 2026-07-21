---
title: Developer Integration
description: Take a LangChain/LangGraph agent and run it as a fully governed workload on PaloNexus, where every outbound action it takes is decided at the same /authz that governs ingress.
sidebar:
  order: 1
---

This section is the developer's path: take a LangChain/LangGraph agent and run it
as a **governed workload** on PaloNexus, where **every outbound action it takes** —
a model call, a tool call, an agent-to-agent hop, an external request — is decided
at one deny-by-default `/authz` answering *may this agent make this call, on behalf
of this human, for this task, right now?* That **agent egress governance is the real
work**; the *same* decision point also governs north-south traffic, the foundation it
builds on. No per-service auth code, one place to reason about access.

## The mental model

PaloNexus governs **one decision per request**. For an agent the defining question is
*may this agent make this outbound call, on behalf of this human, for this task, right
now?* — and identity, registry, policy, audit, and metrics converge on the answer. The
same `/authz` also answers the inbound *may this caller reach this service?*, the
foundation underneath.

An agent is unusual because **it is both a callee and a caller**, and those two
sides are governed very differently:

| | What it is | How it's governed |
|---|---|---|
| **Egress** | the agent invoking a model, tool, database, or peer agent | the **real work** (the headline): route every outbound action back through the *same* `/authz`, carrying the agent's own identity plus the user it acts for. |
| **Ingress** | a user (or upstream) invoking the agent (`POST /threads/{id}/runs`) | an ordinary north-south request the platform already handles — register the agent, route it, done. Zero new control-plane code. The foundation egress builds on. |

The elegant part: **models, tools, and peer agents become ordinary registry
entries.** An agent calling the model broker is just a registered caller
(`kind: agent`) reaching the `model-openai` service (`kind: model`); the same
decision path decides it, the same hash-chained audit row records it (subject =
user, actor = agent, on task T).

### Egress is enforced at the network layer, in any framework

The in-process middleware is the *ergonomic* path, but the *guarantee* is that
agent pods are NetworkPolicy-confined to reach only the **egress forward-proxy**.
The proxy proves identity from a Membership **Verifiable Presentation** and runs
the same egress decision before forwarding a single byte. A raw `curl` with no VP
is denied (`407`). So even a non-cooperating framework — or a compromised one —
cannot reach a model/tool/peer/external host except through `/authz`.

This is what makes the promise framework-agnostic: it holds for `create_agent`, a
hand-rolled `StateGraph`, raw `httpx`, anything. See
[Credential-safe action enforcement](/docs/develop/egress-enforcement/).

:::caution[Deny-by-default, fail closed]
Unknown service, invalid token/VP, target not on the agent's allowlist, over
budget, missing delegation, or an unreachable decision point all **deny**. The
agent middleware mirrors this: any non-`200`, or an unreachable `/authz`, denies.
:::

### Cryptographic identity, not a trusted header

With `AGENT_IDENTITY_MODE=vc` the actor is the *proven*, registry-bound `did:key`
behind a non-revoked Membership VC — the `X-Palonexus-Actor` header is trusted
only if it matches. Revoking the Membership VC cuts egress on the next call. See
[Accountable agent identity](/docs/develop/agent-identity/).

### Never put a provider key in an agent pod

Model calls go through the **model broker**, so the OpenAI/Anthropic key rotates in
one place and cost is metered at one choke point. This is non-negotiable past a
throwaway PoC. See [Budgets and allowlists](/docs/develop/budgets-and-allowlists/).

## The phased path

Each phase is independently shippable. Match your ask to a phase and do only that
phase's steps. The agent-egress story is phases 1–3; the ingress step below is the
**foundational prerequisite** that gets the agent reachable, not stage 0 of the agent
governance work.

| Phase | Deliverable | Where |
|---|---|---|
| **Foundation — PoC ingress** (prerequisite) | agent reachable through the edge, governed by existing authz | [Deploy an agent](/docs/develop/deploy-an-agent/) (Deployment + Service + HTTPRoute, register the agent entry) |
| **1 — Identity + model broker** | agent holds a workload identity; LLM calls gated + metered | + [identity](/docs/develop/agent-identity/), [egress middleware/sidecar](/docs/develop/egress-enforcement/), the [model broker](/docs/develop/deploy-an-agent/#the-model-broker), proxy-only NetworkPolicy |
| **2 — Tool & A2A egress + budgets** | every tool/peer call hits `/authz`; allowlists + budgets enforced | + registry `Allow*` / `Budget` — [Budgets and allowlists](/docs/develop/budgets-and-allowlists/) |
| **3 — Human-approved delegation** | sensitive actions need a human-approved, time-boxed delegation | + [Authority delegation](/docs/develop/delegations-and-approvals/) |

The full multi-agent payoff is the [autonomous flow](/docs/develop/autonomous-flow/):
an incident-triage agent reasons, gets denied a runbook, escalates to a peer
broker, a human approves a time-boxed delegation, and the read finally succeeds —
every hop decided at `/authz`.

## Where to go next

- [Deploy an agent](/docs/develop/deploy-an-agent/) — package, deploy, register.
- [Credential-safe action enforcement](/docs/develop/egress-enforcement/) — the developer view of the sidecar + proxy.
- [Accountable agent identity](/docs/develop/agent-identity/) — DID/VC self-provisioning.
- [Authority delegation](/docs/develop/delegations-and-approvals/) — human-in-the-loop.
- [Autonomous flow](/docs/develop/autonomous-flow/) — the end-to-end hero flow.
- [Budgets and allowlists](/docs/develop/budgets-and-allowlists/) — registry-level controls.
- [Connect agents to enterprise authority — hands-on](/docs/develop/enterprise-iam/) — drive the directory → governance → revocation → delegation → token-exchange loop end to end (the agent-idp CLIs + demo scripts).

For the crypto library see the [`palonexus_agent` SDK](/docs/sdk/palonexus-agent/);
for cluster prerequisites see [self-hosting](/docs/operations/self-hosting/); for
exact wire contracts see the [HTTP API reference](/docs/reference/http-api/).
