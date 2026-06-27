---
title: "Recipe: budget exhaustion"
description: Cap an agent's rolling calls/tokens-per-hour and handle the deny — call budget exceeded / token budget exceeded surface as PolicyDenied, the same typed deny shape every hard refusal uses.
sidebar:
  order: 4
---

Every governed agent can carry a **rolling per-hour budget** — a ceiling on calls and on LLM
tokens. When it's exceeded, the egress decision denies with `call budget exceeded` or
`token budget exceeded` (a hard **403**), which the SDK surfaces as
[`PolicyDenied`](/docs/develop/troubleshooting/#3-policy-inline--may-they-scope--allowlist--budget).
The budget meter is a **live control-plane** gate (`internal/policy` `Meter`, attributed from
the model-broker's usage reports), so it is not modeled by the offline `FakeControlPlane`.

## Handle the deny (runs offline)

The deny-handling shape is identical for *any* hard refusal, so you write and test it offline.
Here the seeded negative persona **Claire Evans** is hard-denied; in production `call budget
exceeded` arrives through the very same `except PolicyDenied` branch:

```python
from palonexus import PaloNexus
from palonexus.errors import PolicyDenied, ApprovalRequired

AGENT = "northstar-devops-incident-agent"
OWNER, APPROVER = "ethan.park@northstar.example", "maya.chen@northstar.example"
NEGATIVE = "claire.evans@northstar.example"

pn = PaloNexus.offline()
pn.agents.register(name=AGENT, owner=OWNER, sponsor=APPROVER, scenario="devops-incident").provision()

with pn.task(subject=NEGATIVE, task_id="INC-4821", scenario="devops-incident", actor=AGENT) as task:
    try:
        task.authorize(action="runbooks:read", resource="runbooks-api:/runbooks/db-failover")
    except PolicyDenied as e:
        print("hard deny:", e.reason)        # live, this is "call budget exceeded" / "token budget exceeded"
    except ApprovalRequired as e:
        print("needs approval:", e.reason)

pn.close()
```

```text
hard deny: claire.evans@northstar.example is not authorized for scenario devops-incident
```

:::note[Why budget can't be faked]
Budgets depend on real wall-clock windows and the broker's token accounting. The offline fake
deliberately models only **deny-by-default authority** (anonymous, negative persona, missing vs
approved delegation). Test your *handling* offline; assert the *enforcement* on a live or compose
stack.
:::

## Set the budget (live)

The ceiling lives on the agent's registry entry. Register it with a `budget` (a zero on either
dimension means *unlimited* there):

```bash
curl -X POST localhost:8181/v1/registry/services \
  -d '{
        "name": "northstar-devops-incident-agent",
        "kind": "agent",
        "owner": "ethan.park@northstar.example",
        "egress": ["model-anthropic", "runbooks-operator"],
        "budget": { "callsPerHour": 200, "tokensPerHour": 500000 }
      }'
```

The control plane meters each allowed egress call against a rolling one-hour window per agent;
the model-broker POSTs token usage to `/v1/usage` so the token dimension is attributed back to
the agent.

## Observe it

Budget burn is visible on the
[`palonexus-overview` dashboard](/docs/operations/observability/#the-palonexus-overview-dashboard):

| Signal | Query |
|---|---|
| Per-agent token usage | `palonexus_token_usage_total` |
| Per-agent spend (USD) | `palonexus_agent_cost_usd_total` |
| Deny rate (incl. budget) | `palonexus_authz_decisions_total{decision="deny"}` |

Alert on the deny rate climbing for one agent — it usually means a runaway loop hitting its
ceiling, exactly what the budget is there to contain.

## Related

- [Observability — what good looks like](/docs/operations/observability/#what-good-looks-like).
- [Troubleshooting — budget reasons](/docs/develop/troubleshooting/#3-policy-inline--may-they-scope--allowlist--budget).
