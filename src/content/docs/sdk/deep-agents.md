---
title: Deep Agents adapter
description: Govern a create_deep_agent(...) with palonexus.deepagents — tool_guard, governance_middleware, and the shipped palonexus-governance skill. Covers interrupt_on, the checkpointer requirement, and the deny / needs-approval / allow contract.
sidebar:
  order: 8
---

`palonexus.deepagents` drops PaloNexus governance into a
[Deep Agents](https://github.com/langchain-ai/deepagents) `create_deep_agent(...)` so every
tool (and, optionally, model) call is decided by the **same** [`/authz`](/docs/getting-started/glossary/)
decision the rest of the platform uses. Because Deep Agents middleware *is* LangChain
`AgentMiddleware`, this module deliberately **consolidates onto the shipped
[LangChain adapter](/docs/sdk/langchain/)** rather than re-implementing the gate — the same
`pn._decide` seam, the same deny / needs-approval / allow semantics, the same offline
`FakeControlPlane`.

It ships three things, matching the plan's §3 example:

- **`tool_guard(pn, tool, action=…, resource=…)`** — declares the governed `(action, resource)`
  a Deep Agents tool maps to and returns the *same* tool, so it drops into
  `tools=[tool_guard(pn, t, …)]`.
- **`governance_middleware(pn)`** — gates **every** governed tool call (and, with
  `gate_model=True`, the model call) through `/authz`, **fail-closed**.
- **`governance_skill_dir()` / `governance_skill_markdown()`** — load the shipped
  `palonexus-governance` SKILL.md so `skills=[governance_skill_dir()]` teaches the agent the
  delegation / revocation / deny-by-default contract by progressive disclosure.

## Install

```bash
pip install 'palonexus[deepagents]'
```

The skill loaders need **no** extra — they only read a shipped file. `tool_guard` and
`governance_middleware` require the `deepagents` extra; calling them without it raises a clear
`ImportError`.

## The decision contract

On each governed tool the gate asks `pn` (the live control plane, or the offline
`FakeControlPlane`) and **never silently allows**:

| Decision | What happens |
|---|---|
| **allow** | the tool runs and returns its normal output |
| **needs-approval** | `interrupt()` pauses the run for a human-approved, time-boxed [delegation](/docs/getting-started/glossary/); on resume the gate **re-checks** and runs the tool only if it is now allowed (requires a checkpointer + `thread_id`) |
| **hard deny** | a deny `ToolMessage` is substituted — the model sees `PaloNexus denied <tool>: …`, not the tool result |
| **decision point unreachable** | raises [`ControlPlaneUnavailable`](/docs/getting-started/quickstart/) (fail-closed) |

## The checkpointer requirement (for `interrupt_on`)

Deep Agents HITL is the same LangGraph machinery as the [LangGraph adapter](/docs/sdk/langgraph/#the-durable-checkpointer-requirement):
to `interrupt()` on needs-approval and resume after a human approves, you **must** supply a
durable **checkpointer** and invoke with a `thread_id`.

:::caution[No checkpointer, no `interrupt_on`]
`interrupt_on={"read_runbook": True}` cannot pause/resume without a checkpointer + `thread_id`.
Use `MemorySaver` in dev/tests and `AsyncPostgresSaver` (durable) in production — the same
requirement as the scaffold's `checkpointer.py`.
:::

## Wire it up

This is the plan's §3 example, grounded in the shipped
`examples/deepagents_runbook_governance.py` and the **devops-incident** seed personas
(owner **Ethan Park**, approver **Maya Chen**; negative persona **Claire Evans**).

```python
from deepagents import create_deep_agent
from langchain.tools import tool
from langgraph.checkpoint.memory import MemorySaver
from palonexus import PaloNexus
from palonexus.deepagents import (
    tool_guard, governance_middleware, governance_skill_dir,
)

pn = PaloNexus.from_env()                       # or PaloNexus.offline() for tests

@tool
def read_runbook(name: str) -> str:
    """Read an SRE runbook by name."""
    return RUNBOOKS.get(name, "(no such runbook)")

agent = create_deep_agent(
    model="claude-sonnet-4-5",
    tools=[tool_guard(pn, read_runbook, action="runbooks:read",
                      resource=lambda a: f"runbooks-api:/runbooks/{a['name']}")],
    middleware=[governance_middleware(pn)],     # gates every governed tool call via /authz
    interrupt_on={"read_runbook": True},        # Deep Agents HITL for the regulated tool
    skills=[governance_skill_dir()],            # SKILL.md teaches delegation/escalation
    checkpointer=MemorySaver(),                 # REQUIRED for interrupt_on
)
```

Decisions are made against the bound [request context](/docs/getting-started/quickstart/), so drive the
agent inside a task:

<!-- no-doctest: illustrative fragment — uses `agent` from a neighbouring block (not standalone-runnable) -->
```python
config = {"configurable": {"thread_id": "INC-4821"}}
with pn.task(subject="ethan.park@northstar.example", task_id="INC-4821",
             scenario="devops-incident", actor="northstar-devops-incident-agent"):
    out = agent.invoke(
        {"messages": [{"role": "user", "content": "read the db-failover runbook"}]},
        config,
    )
```

### Govern the model call too

By default only the declared tools are gated, so a plain `offline()` demo runs without a model
grant. For the full "every egress" posture, gate the model edge as well:

<!-- no-doctest: illustrative fragment — uses `governance_middleware` from a neighbouring block (not standalone-runnable) -->
```python
middleware=[governance_middleware(pn, gate_model=True,
                                  model_action="model:invoke",
                                  model_resource="model-anthropic")]
```

## The shipped `palonexus-governance` skill

`skills=[governance_skill_dir()]` loads a real, shipped `SKILL.md` written for **progressive
disclosure** — the agent reads it only when a governed tool returns a governance result. It
teaches the agent to:

- recognize the three outcomes (**allow** / **needs-approval** / **deny**);
- drive the human-approval loop (announce *what* and *why* — the action, resource, and task id
  — then **wait**, never assume approval);
- **stop cleanly on mid-run revocation** (a tool that worked a moment ago starts denying — do
  not retry);
- honor **deny-by-default**: an unreachable control plane **fails closed**; a missing, expired,
  or revoked grant is a deny.

Load the markdown directly (for a `StoreBackend`, or to assert it in a test) with
`governance_skill_markdown()`.

## Offline: prove the contract with no network

The shipped example validates the gate **directly** against the `FakeControlPlane` so it runs
green whether or not the `deepagents` extra is installed — `Claire Evans` is hard-denied,
`Ethan Park` is needs-approval until `Maya Chen` approves, and a mid-run **revocation** flips
Ethan back to denied:

```python
from palonexus import PaloNexus

AGENT = "northstar-devops-incident-agent"
OWNER, APPROVER = "ethan.park@northstar.example", "maya.chen@northstar.example"
NEGATIVE = "claire.evans@northstar.example"
ACTION, RESOURCE = "runbooks:read", "runbooks-api:/runbooks/db-failover"

pn = PaloNexus.offline()
agent = pn.agents.register(name=AGENT, owner=OWNER, sponsor=APPROVER, scenario="devops-incident")
agent.provision()

# Negative persona -> hard deny (never needs-approval).
with pn.task(subject=NEGATIVE, task_id="INC-4821", scenario="devops-incident", actor=AGENT) as t:
    assert t.check(action=ACTION, resource=RESOURCE).allow is False

# Owner -> deny-by-default until a human approves, then allow, then revoke -> deny again.
with pn.task(subject=OWNER, task_id="INC-4821", scenario="devops-incident", actor=AGENT) as t:
    assert t.check(action=ACTION, resource=RESOURCE).needs_approval is True
    deleg = t.request_delegation(action=ACTION, resource=RESOURCE, reason="INC-4821", ttl=300)
    pn._fake.approve_delegation(deleg.id, approver=APPROVER)        # Maya approves
    assert t.check(action=ACTION, resource=RESOURCE).allow is True
    pn.revoke(deleg.id, reason="incident closed")
    assert t.check(action=ACTION, resource=RESOURCE).allow is False  # live revocation
assert pn.audit.verify_chain() is True
pn.close()
```

Run the full shipped example (it skips the `create_deep_agent` layer cleanly if the extra is
absent):

```bash
python examples/deepagents_runbook_governance.py
```

## Next

- [LangChain adapter](/docs/sdk/langchain/) · [LangGraph adapter](/docs/sdk/langgraph/) — the gate this page consolidates onto.
- [Recipes](/docs/develop/recipes/) — A2A delegation, the revocation race, offline tests.
- [Troubleshooting](/docs/develop/troubleshooting/) — every deny reason, decoded.
- [Glossary](/docs/getting-started/glossary/) — HITL, checkpointer, `thread_id`, ToolMessage.
