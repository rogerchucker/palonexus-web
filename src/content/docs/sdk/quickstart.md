---
title: SDK quickstart
description: The palonexus SDK end to end — initialize, register, bind a task, check, delegate, authorize, audit, and revoke. Copy-pasteable, runs offline against the devops-incident seed personas.
sidebar:
  order: 1.5
---

Everything the `palonexus` SDK does, in one page, copy-pasteable. Every snippet runs against
`PaloNexus.offline()` — no cluster, no network — using the **devops-incident** seed personas
(**Ethan Park** owner, **Maya Chen** approver, **Claire Evans** the negative persona). For the
narrated 10-minute version, start with the [agent-dev quickstart](/docs/getting-started/quickstart-agent-dev/).

:::tip[Run it in the browser first — no install]
The operator portal ships an in-browser **SDK playground** (`/playground`) that runs the same
canonical `PaloNexus.offline()` hero flow you'll build below — pick a persona, edit the governed
call, and run register → deny → delegate → approve → succeed with no `pip install`, no cluster,
and no API key.
:::

![SDK playground for the DevOps-incident scenario: persona selectors (owner, approver, denied), the governed call parameters, and an editable canonical PaloNexus.offline() hero-flow Python snippet beside an empty output panel awaiting a run.](/docs/screenshots/playground.png)

*Run the shipped `palonexus` hero flow against `PaloNexus.offline()` — register, deny-by-default, delegate, approve, succeed — entirely in the browser, no cluster or API key.*

## Initialize

Three ways to build the facade. Always close it (or use it as a context manager).

```python
from palonexus import PaloNexus

# 1. From environment (recommended for real deployments): reads PALONEXUS_* vars.
pn = PaloNexus.from_env()

# 2. Explicit:
pn = PaloNexus(
    control_plane_url="http://localhost:9191",
    idp_url="http://localhost:8090",
    api_key="pn_live_…",
)

# 3. Offline — in-memory FakeControlPlane, no cluster (tests, CI, this page):
pn = PaloNexus.offline()
```

`from_env()` honors `PALONEXUS_OFFLINE=1`, so the same code path runs in CI with no cluster:

```python
import os
os.environ["PALONEXUS_OFFLINE"] = "1"

from palonexus import PaloNexus

pn = PaloNexus.from_env()   # -> offline mode
with pn.task(
    subject="ethan.park@northstar.example",
    task_id="INC-1",
    scenario="devops-incident",
    actor="northstar-devops-incident-agent",
) as task:
    decision = task.check(action="runbooks:read",
                          resource="runbooks-api:/runbooks/db-failover")
    print("needs_approval:", decision.needs_approval)
pn.close()
```

The env vars `from_env()` reads: `PALONEXUS_CONTROL_PLANE_URL`, `PALONEXUS_MGMT_URL`,
`PALONEXUS_IDP_URL`, `PALONEXUS_API_KEY`, `PALONEXUS_TENANT_ID`, `PALONEXUS_AGENT_TOKEN`, and
`PALONEXUS_OFFLINE`. See [Configuration & environment](/docs/sdk/config-env/).

## Register an agent

`pn.agents.register(...)` enforces the no-orphaned-agents rule: **owner and sponsor are
mandatory**. Omit either and it raises `GovernanceError` *before any network call* — fail
closed, client-side first.

```python
from palonexus import PaloNexus

pn = PaloNexus.offline()

agent = pn.agents.register(
    name="northstar-devops-incident-agent",
    owner="ethan.park@northstar.example",     # mandatory
    sponsor="maya.chen@northstar.example",    # mandatory
    team="DevOps",
    risk_tier="high",                         # low | medium | high | critical
    runtime="doks_prod",                      # an approved runtime
    scenario="devops-incident",               # ties to the seed scenario
)
identity = agent.provision()                  # mint did:key + Membership VC (idempotent)
print(identity.did)                           # did:key:z…
```

:::note[`runtime` is just a label]
`runtime="doks_prod"` is an example **runtime label** describing *where* the agent
runs — a free-form tag like `k8s_prod` or `local_dev`. It is not a DOKS/DigitalOcean
requirement; PaloNexus runs on any Kubernetes or via Docker Compose.
:::

The mandatory-ownership rule, demonstrated:

```python
from palonexus import PaloNexus
from palonexus.errors import GovernanceError

with PaloNexus.offline() as pn:
    try:
        pn.agents.register(name="orphan-agent", owner="", sponsor="")
    except GovernanceError as e:
        print("rejected:", e)   # agent registration requires an owner (no orphaned agents)
```

## Bind a task

A **task** binds the on-behalf-of subject, the task id (the TBAC task), and the scenario for
every governed call inside the `with` block. It propagates the egress headers and OTel span
automatically.

```python
with pn.task(
    subject="ethan.park@northstar.example",       # the human the agent acts for (stable subject)
    task_id="INC-4821",                           # the TBAC task / incident id
    scenario="devops-incident",
    actor="northstar-devops-incident-agent",      # the acting agent
) as task:
    ...   # task.check / task.authorize / task.request_delegation live here
```

## Check

`task.check(...)` is synchronous and explicit, and returns a typed `PolicyDecision`. It does
**not** raise on deny — inspect `allow` and `needs_approval`:

<!-- no-doctest: illustrative fragment — uses `task` from a neighbouring block (not standalone-runnable) -->
```python
decision = task.check(
    action="runbooks:read",
    resource="runbooks-api:/runbooks/db-failover",
)
print(decision.allow)            # False
print(decision.needs_approval)   # True  -> a human-approved delegation is required
print(decision.reason)           # "needs human-approved delegation"
```

A `PolicyDecision` carries `allow`, `needs_approval`, `reason`, `subject`, `upstream`, and
`trace_id`. It still raises `ControlPlaneUnavailable` if the decision point is unreachable
(fail closed) — a `check` is never a silent allow.

## Delegate & approve

On a needs-approval decision, request a task-scoped, time-boxed delegation. It starts
`pending`; a human with `org:agents:approve` (here Maya) approves it.

<!-- no-doctest: illustrative fragment — uses `task` from a neighbouring block (not standalone-runnable) -->
```python
deleg = task.request_delegation(
    action="runbooks:read",
    resource="runbooks-api:/runbooks/db-failover",
    reason="INC-4821 db failover",
    ttl=300,                                  # seconds (time-box)
)
print(deleg.id, deleg.status)                 # deleg-… pending

# In production: Maya approves in the Approvals console / via agent-idp.
# Offline only: drive the in-memory control plane to simulate the human action.
pn._fake.approve_delegation(deleg.id, approver="maya.chen@northstar.example")
```

For a live cluster, poll until the human decides:

<!-- no-doctest: illustrative fragment — uses `task` from a neighbouring block (not standalone-runnable) -->
```python
deleg = task.await_delegation(deleg.id, timeout=600)   # blocks until approved/denied/expired
```

## Authorize (enforce)

`task.authorize(...)` is `check` that **raises** on non-allow — use it where you want the
deny to stop execution:

<!-- no-doctest: illustrative fragment — uses `task` from a neighbouring block (not standalone-runnable) -->
```python
final = task.authorize(
    action="runbooks:read",
    resource="runbooks-api:/runbooks/db-failover",
)
print(final.allow)   # True — the approved delegation lets the call through
```

The typed error tree (catch the one you care about):

<!-- no-doctest: illustrative fragment — uses `task` from a neighbouring block (not standalone-runnable) -->
```python
from palonexus.errors import ApprovalRequired, PolicyDenied, ControlPlaneUnavailable

try:
    task.authorize(action="runbooks:read",
                   resource="runbooks-api:/runbooks/db-failover")
except ApprovalRequired as e:        # 401 + needs-approval: drive request_delegation / interrupt
    print("needs approval:", e.reason)
except PolicyDenied as e:            # 403 hard deny: no path forward
    print("denied:", e.reason)
except ControlPlaneUnavailable:      # decision point down: fail closed, never a silent allow
    raise
```

The full tree: `PaloNexusError` (base) → `GovernanceError`, `PolicyDenied`,
`ApprovalRequired`, `DelegationExpired`, `CredentialRevoked`, `IdentityNotProvisioned`,
`ControlPlaneUnavailable`.

## Audit

Every governed decision lands on a tamper-evident hash chain. Tail by `task_id` or `agent`,
and verify the chain:

```python
for ev in pn.audit.tail(task_id="INC-4821"):
    print(ev.seq, ev.decision, ev.actor, ev.action, ev.resource)

assert pn.audit.verify_chain()   # False if any record was edited or deleted
```

```text
1 deny  northstar-devops-incident-agent runbooks:read runbooks-api:/runbooks/db-failover
2 allow northstar-devops-incident-agent runbooks:read runbooks-api:/runbooks/db-failover
```

## Revoke

Revoke a single delegation, or cascade everything under an agent. After revocation the next
`check` is denied again — deny-by-default reasserts immediately:

<!-- no-doctest: illustrative fragment — uses `deleg` from a neighbouring block (not standalone-runnable) -->
```python
pn.revoke(deleg, reason="incident closed")          # accepts a Delegation or a raw jti -> True

after = task.check(action="runbooks:read",
                   resource="runbooks-api:/runbooks/db-failover")
print(after.allow)            # False — the grant is gone

# Revoke everything under an agent (e.g. security response):
report = pn.revocation.cascade(parent_did=agent.identity.did)
print(report)                 # {'delegations_revoked': N, 'agents_suspended': …, …}
```

## Put it together

The complete flow in one block (this is exactly what
[`run_hero_flow`](/docs/getting-started/quickstart-agent-dev/) drives):

```python
from palonexus import PaloNexus

with PaloNexus.offline() as pn:
    agent = pn.agents.register(
        name="northstar-devops-incident-agent",
        owner="ethan.park@northstar.example",
        sponsor="maya.chen@northstar.example",
        scenario="devops-incident",
    )
    agent.provision()

    with pn.task(subject="ethan.park@northstar.example", task_id="INC-4821",
                 scenario="devops-incident", actor="northstar-devops-incident-agent") as task:
        assert task.check(action="runbooks:read",
                          resource="runbooks-api:/runbooks/db-failover").needs_approval
        deleg = task.request_delegation(action="runbooks:read",
                                        resource="runbooks-api:/runbooks/db-failover",
                                        reason="INC-4821", ttl=300)
        pn._fake.approve_delegation(deleg.id, approver="maya.chen@northstar.example")
        assert task.authorize(action="runbooks:read",
                              resource="runbooks-api:/runbooks/db-failover").allow

    assert pn.audit.verify_chain()
```

## Next

- [Guard a LangChain tool](/docs/sdk/langchain/)
- [Govern a LangGraph node with HITL](/docs/sdk/langgraph/)
- [SDK overview & layers](/docs/sdk/) · [Glossary](/docs/getting-started/glossary/)
