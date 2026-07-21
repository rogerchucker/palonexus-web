---
title: Govern agent-to-agent delegation
description: When one agent hands work to another, the hop itself is authorized at /authz and carries the original on-behalf-of human subject — authority propagates, it never escalates, and both hops land on the audit chain.
sidebar:
  order: 3
---

Multi-agent systems fail the enterprise trust test at the handoff: agent A was authorized,
agent A calls agent B, and suddenly agent B is acting with authority nobody granted it. In
PaloNexus there is no privileged "internal" path between agents. An agent-to-agent (A2A)
hop is an outbound call like any other, and it is decided at the same deny-by-default
`/authz` as a tool or model call — this works today, backed by the shipped
[A2A delegation recipe](/docs/develop/recipes/a2a-delegation/).

## The authority story

Four properties make the handoff governable rather than merely observable:

- **The hop is gated.** `agent:invoke` on the sub-agent goes through `/authz` exactly like
  any other action. If the calling agent has no grant for that hop, the hop is denied —
  regardless of what it was allowed to do before.
- **Identity propagates, it doesn't escalate.** The decision on the hop carries the
  **original on-behalf-of human subject** — the sub-agent acts for the same person, on the
  same task, under the same delegation. It never gains standing authority of its own, and
  it cannot act as itself.
- **Each edge is independently authorized.** Reading a runbook (hop 1) and invoking the
  remediation sub-agent (hop 2) each require their own grant. Approving one does not
  silently widen the other — there is no transitive trust.
- **The whole chain is auditable.** Both hops land on the hash-chained audit trail keyed to
  the task, so an auditor can reconstruct *which agent acted, for whom, under which
  delegation, and why the hop was allowed* end to end.

In production, the calling agent attaches a fresh holder-signed verifiable presentation to
the hop and the [egress proxy](/docs/concepts/egress-enforcement/) enforces the decision at
the network layer — a sub-agent call cannot skip the gate by going around the SDK.

## See it run

The [A2A delegation recipe](/docs/develop/recipes/a2a-delegation/) is a complete, offline,
runnable example: the triage agent needs a human-approved delegation to read a regulated
runbook, then A2A-calls a remediation sub-agent — and the hop is itself held for
authorization, with both decisions recording the same on-behalf-of subject and the audit
chain verifying clean at the end. No cluster, no network, no API key.

## Next

- [Recipe: A2A delegation](/docs/develop/recipes/a2a-delegation/) — the implementation.
- [Authority delegation](/docs/develop/delegations-and-approvals/) — how a human turns
  a denial into a time-boxed elevation.
- [Deep Agents / LangChain integration](/docs/integrations/deep-agents-sandboxes/) — govern
  the tools each agent uses between hops.
