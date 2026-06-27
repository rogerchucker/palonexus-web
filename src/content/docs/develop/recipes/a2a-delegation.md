---
title: "Recipe: A2A delegation"
description: An agent delegates work to a sub-agent — the agent-to-agent hop is itself gated at /authz and carries the original on-behalf-of human subject, so the sub-agent never gains standing authority.
sidebar:
  order: 2
---

When the triage agent can't finish a task alone it calls a **sub-agent**
([A2A](/docs/getting-started/glossary/)). That hop is **not** a trusted
internal call — it is gated by the same `/authz` decision, and it carries the **original**
[on-behalf-of](/docs/getting-started/glossary/) human subject. The sub-agent acts
for *Ethan*, on *Ethan's* task, with *Ethan's* delegation — it never gains standing authority of
its own.

This mirrors the platform's hero flow: `incident-triage` reads a runbook (regulated → needs
approval → Maya approves) and then A2A-calls a remediation sub-agent, the hop carrying
`subject=ethan.park`.

```python
from palonexus import PaloNexus

AGENT = "northstar-devops-incident-agent"
OWNER, APPROVER = "ethan.park@northstar.example", "maya.chen@northstar.example"

pn = PaloNexus.offline()
agent = pn.agents.register(name=AGENT, owner=OWNER, sponsor=APPROVER, scenario="devops-incident")
agent.provision()

with pn.task(subject=OWNER, task_id="INC-4821", scenario="devops-incident", actor=AGENT) as task:
    # Hop 1 — the triage agent reads a regulated runbook: deny-by-default -> needs approval.
    first = task.check(action="runbooks:read", resource="runbooks-api:/runbooks/db-failover")
    assert first.needs_approval

    deleg = task.request_delegation(action="runbooks:read",
                                    resource="runbooks-api:/runbooks/db-failover",
                                    reason="INC-4821 db failover", ttl=300)
    pn._fake.approve_delegation(deleg.id, approver=APPROVER)   # Maya approves (portal, live)
    task.authorize(action="runbooks:read", resource="runbooks-api:/runbooks/db-failover")

    # Hop 2 — A2A to the remediation sub-agent. The hop is itself gated; the decision
    # carries the SAME on-behalf-of subject (Ethan), not the agent's own identity.
    a2a = task.check(action="agent:invoke", resource="northstar-remediation-agent",
                     target_kind="agent")
    assert a2a.needs_approval and a2a.subject == OWNER          # gated, on-behalf-of Ethan

    pn._fake.grant(subject=OWNER, action="agent:invoke",
                   resource="northstar-remediation-agent", scenario="devops-incident")
    allowed = task.check(action="agent:invoke", resource="northstar-remediation-agent",
                         target_kind="agent")
    assert allowed.allow and allowed.subject == OWNER
    print("A2A hop authorized, on-behalf-of:", allowed.subject)

assert pn.audit.verify_chain()                                 # both hops are on the chain
pn.close()
```

```text
A2A hop authorized, on-behalf-of: ethan.park@northstar.example
```

## What this proves

- **The hop is gated.** `agent:invoke` to the sub-agent goes through `/authz` exactly like a
  tool or model call — there is no privileged "internal" path.
- **Identity propagates, it doesn't escalate.** Both decisions record `subject=ethan.park`. The
  sub-agent inherits Ethan's *task-scoped* authority for this task only; it cannot act as itself.
- **Each edge is independently authorized.** Hop 1 (runbook) and hop 2 (sub-agent) each require
  their own grant — approving one does not silently widen the other.
- **Auditable end to end.** `pn.audit.tail(task_id="INC-4821")` reconstructs the whole chain,
  trace-correlated in Tempo on a live deployment.

In production, `agent.present(audience="northstar-remediation-agent")` attaches a fresh holder-
signed [VP](/docs/getting-started/glossary/) to the A2A hop and the
[egress proxy](/docs/concepts/egress-enforcement/) enforces it at the network layer.

## Related

- [Revocation race](/docs/develop/recipes/revocation-race/) — revoke mid-A2A-run.
- [Security model — identity propagation](/docs/concepts/security-model/#identity-propagation-not-token-forwarding).
