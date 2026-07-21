---
title: LangChain adapter
description: Guard a LangChain tool with palonexus.langchain — guarded_tool declares the action/resource, middleware(pn) gates every call through /authz, failing closed with a deny ToolMessage or a human-approval interrupt.
sidebar:
  order: 6
---

`palonexus.langchain` drops PaloNexus governance into a LangChain `create_agent` without
restructuring your agent. You declare what a tool *means* (its action + resource) and the
middleware gates every call through `/authz`, **failing closed**:

- **allow** → the tool runs;
- **needs-approval** → `interrupt()` pauses the run for a human-approved, time-boxed
  delegation (requires a checkpointer + `thread_id`); on resume the gate re-checks;
- **hard deny** → a deny `ToolMessage` is substituted (the model sees the denial, the tool
  never runs);
- **decision point unreachable** → `ControlPlaneUnavailable` is raised — never a silent allow.

## Install

The LangChain binding is an opt-in extra:

```bash
pip install 'palonexus[langchain]'
```

## Guard a tool

`guarded_tool(...)` declares the `(action, resource)` a tool maps to and returns the *same*
tool object, so it drops straight into `create_agent(tools=[...])`. `resource` can be a
callable that derives the concrete target from the tool's arguments.

<!-- no-doctest: illustrative fragment — needs a live `model`/`create_agent` wiring -->
```python
from langchain.agents import create_agent
from langchain.tools import tool
from palonexus import PaloNexus
from palonexus.langchain import guarded_tool, middleware

pn = PaloNexus.from_env()                      # or PaloNexus.offline() for tests

RUNBOOKS = {"db-failover": "1. Fail over to the standby primary.\n2. Verify replica lag is zero."}

@tool
def read_runbook(name: str) -> str:
    """Read an SRE runbook by name."""
    return RUNBOOKS.get(name, "(no such runbook)")

# Declare the action/resource; the gate calls /authz and will interrupt for approval
# or substitute a deny ToolMessage.
guarded = guarded_tool(
    read_runbook,
    action="runbooks:read",
    resource=lambda args: f"runbooks-api:/runbooks/{args['name']}",
)

agent = create_agent(model, tools=[guarded], middleware=[middleware(pn)])
```

The decision is made against the **bound request context**, so run the agent inside a
`pn.task(...)` block so the gate knows *who* the call is on behalf of:

<!-- no-doctest: illustrative fragment — uses `agent` from a neighbouring block (not standalone-runnable) -->
```python
with pn.task(subject="ethan.park@northstar.example", task_id="INC-4821",
             scenario="devops-incident", actor="northstar-devops-incident-agent"):
    result = agent.invoke({"messages": [{"role": "user", "content": "read the db-failover runbook"}]})
```

Tools you did *not* pass through `guarded_tool` are passed through ungoverned.

## Run it offline (deny vs approved)

This is the shipped `examples/langchain_runbook_guard.py`, runnable with no network. A
scripted model stands in for the LLM so the example exercises the **governance gate**, not a
real model. (`_fake_model.py` ships alongside the example.)

```python
from langchain.agents import create_agent
from langchain.tools import tool
from palonexus import PaloNexus
from palonexus.langchain import guarded_tool, middleware
from _fake_model import scripted_runbook_model   # shipped with the examples

RUNBOOKS = {"db-failover": "1. Fail over to the standby primary.\n2. Verify replica lag is zero."}
AGENT = "northstar-devops-incident-agent"
RESOURCE = "runbooks-api:/runbooks/db-failover"

@tool
def read_runbook(name: str) -> str:
    """Read an SRE runbook by name."""
    return RUNBOOKS.get(name, "(no such runbook)")

guarded = guarded_tool(read_runbook, action="runbooks:read",
                       resource=lambda args: f"runbooks-api:/runbooks/{args['name']}")

def last_tool_message(messages):
    for m in reversed(messages):
        if type(m).__name__ == "ToolMessage":
            return str(m.content)
    return ""

# Deny path — Claire Evans (the negative persona) -> hard deny -> deny ToolMessage.
pn = PaloNexus.offline()
agent = create_agent(scripted_runbook_model(), tools=[guarded], middleware=[middleware(pn)])
with pn.task(subject="claire.evans@northstar.example", task_id="INC-4821",
             scenario="devops-incident", actor=AGENT):
    out = agent.invoke({"messages": [{"role": "user", "content": "read the db-failover runbook"}]})
print("[deny ]", last_tool_message(out["messages"]))
pn.close()

# Approved path — Ethan Park with a Maya-approved delegation -> allow -> tool runs.
pn = PaloNexus.offline()
pn._fake.grant(subject="ethan.park@northstar.example", action="runbooks:read",
               resource=RESOURCE, scenario="devops-incident")   # offline stand-in for the human approval
agent = create_agent(scripted_runbook_model(), tools=[guarded], middleware=[middleware(pn)])
with pn.task(subject="ethan.park@northstar.example", task_id="INC-4821",
             scenario="devops-incident", actor=AGENT):
    out = agent.invoke({"messages": [{"role": "user", "content": "read the db-failover runbook"}]})
print("[allow]", last_tool_message(out["messages"]).splitlines()[0])
pn.close()
```

```text
[deny ] PaloNexus denied read_runbook: claire.evans@northstar.example is not authorized for scenario devops-incident
[allow] 1. Fail over to the standby primary.
```

:::note[`pn._fake.grant(...)` is offline-only]
`grant(...)` pre-arranges an approved delegation so the happy path runs without the
request/approve dance. In a live deployment the approval is a human action — see the
[Approvals console](/docs/develop/delegations-and-approvals/). On a live cluster, the
needs-approval branch instead drives `interrupt()` (next section).
:::

## Approvals need a checkpointer

When the gate hits a **needs-approval** decision it calls LangGraph's `interrupt()` to pause
for a human-approved delegation. That requires a durable **checkpointer** and a `thread_id`
in the run config (the same requirement as the [LangGraph adapter](/docs/sdk/langgraph/)):

<!-- no-doctest: illustrative fragment — needs a live `create_agent` + checkpointer -->
```python
from langgraph.checkpoint.memory import MemorySaver   # AsyncPostgresSaver in production

agent = create_agent(model, tools=[guarded], middleware=[middleware(pn)],
                     checkpointer=MemorySaver())
config = {"configurable": {"thread_id": "INC-4821"}}
```

Resume after approval with `agent.invoke(Command(resume=...), config)`.

## Gating the model call too

By default `middleware(pn)` gates only declared tool calls. Set `gate_model=True` to also gate
the model egress edge (a denied model call raises `PolicyDenied`):

<!-- no-doctest: illustrative fragment — needs a live `model`/`middleware` wiring -->
```python
mw = middleware(pn, gate_model=True, model_action="model:invoke", model_resource="model-openai")
agent = create_agent(model, tools=[guarded], middleware=[mw])
```

## Next

- [LangGraph adapter](/docs/sdk/langgraph/) — governed nodes + HITL resume.
- [Quickstart](/docs/getting-started/quickstart/) · [Glossary](/docs/getting-started/glossary/)
