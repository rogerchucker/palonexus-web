---
title: palonexus_agent — the governed-agent scaffold
description: The PaloNexus agent SDK — IdentityManager bootstrap and delegation, the build_llm broker helper, the egress middleware gates, the runbook DID/VC tool, and the create_app FastAPI host.
sidebar:
  order: 3
---

`palonexus_agent` (`agents/palonexus_agent/`) is the shared scaffold for
PaloNexus-governed LangGraph agents. It wires identity bootstrap, model-broker
access, egress gating, the regulated runbook tool, and a FastAPI host into a few
reusable building blocks. It depends on [`agentdid`](/docs/sdk/agentdid/) for all
crypto.

Top-level exports:

<!-- no-doctest: legacy `palonexus_agent` scaffold (graduated into `palonexus`) — not the shipped package; page pending REM-159 -->
```python
from palonexus_agent import (
    create_app, open_checkpointer,
    Settings, get_settings, reload_settings,
    AgentIdentity, IdentityManager,
    build_llm,
    palonexus_model_gate, palonexus_tool_gate,
    set_identity, set_request_context, set_tool_intent,
    RunbookContext, challenge_response_access, make_read_runbook_tool, resource_for,
    setup_tracing, span,
)
```

## IdentityManager — identity lifecycle

On startup an agent self-provisions: it POSTs `/v1/agents` (idempotent) then
`/v1/agents/{name}/provision`, and holds the resulting `did:key` private key +
Membership/Capability VCs **in memory only** (the private key is returned exactly
once and is never written to disk). In offline mode it mints its own `did:key`
locally with `agentdid.generate_keypair`, so tests need no network.

```python
class IdentityManager:
    def __init__(self, settings: Settings | None = None,
                 capabilities: list[dict] | None = None,
                 http_client: httpx.Client | None = None): ...
    def bootstrap(self) -> AgentIdentity: ...
    def request_delegation(self, task, action, resource, reason,
                           ttl_seconds=300, actor_name=None) -> dict: ...
    def get_delegation(self, delegation_id: str) -> dict: ...
    def get_delegation_vc(self, delegation_id: str) -> str | None: ...
```

| Member | Purpose |
|---|---|
| `bootstrap() -> AgentIdentity` | Idempotently provision and cache the identity. In offline mode (`PALONEXUS_OFFLINE`) mints a local `did:key`; otherwise calls agent-idp's register + provision endpoints. |
| `request_delegation(task, action, resource, reason, ttl_seconds=300, actor_name=None)` | POST `/v1/delegations/request`; returns the pending delegation record. **`actor_name`** overrides whom the delegation is FOR — a broker requesting on behalf of another agent passes that agent's name so the Delegation VC is issued to *its* `did:key` (the holder that will present it), not the broker's. Defaults to this agent's own name. |
| `get_delegation(id)` | GET the delegation record (e.g. to poll approval status). |
| `get_delegation_vc(id) -> str \| None` | Fetch the issued Delegation VC (JWT) once approved, or `None` if not yet available. |

`AgentIdentity` is the in-memory identity dataclass:

| Field | Notes |
|---|---|
| `name`, `did`, `private_key_b64`, `pub_multibase`, `issuer_did` | Core identity. `private_key_b64` is never persisted. |
| `membership_vc: str \| None` | The issuer-signed Membership VC (JWT) presented on egress. |
| `capability_vcs: list[str]` | Any capability VCs issued at provisioning. |
| `provisioned: bool` | True once bootstrap completed. |
| `public_view() -> dict` | Safe-to-expose view (no private key) — what `GET /identity` returns. |

<!-- no-doctest: legacy `palonexus_agent` scaffold (graduated into `palonexus`) — not the shipped package; page pending REM-159 -->
```python
from palonexus_agent import IdentityManager, set_identity

idm = IdentityManager(capabilities=[{"action": "runbook:read",
                                     "resource": "runbooks-api:/runbooks/*"}])
identity = idm.bootstrap()
set_identity(identity)        # bind it so egress calls present a VP
```

## build_llm — the model-broker helper

The agent **never holds an OpenAI key**. `build_llm` returns a `ChatOpenAI`
pointed at the PaloNexus model broker (OpenAI-compatible), authenticated with the
broker master key and tagged with `x-palonexus-actor` so the broker can meter cost
per agent.

```python
def build_llm(settings: Settings | None = None, *, large: bool = False,
              temperature: float = 0.0, **kwargs) -> ChatOpenAI: ...
```

- `large=True` selects `model-openai-large` (gpt-4o) instead of the default
  `model-openai` (gpt-4o-mini).
- **Egress routing for the model call** is chosen by `PALONEXUS_USE_EGRESS_SIDECAR`:
  - **Sidecar mode** (env set): a plain `httpx.Client`/`AsyncClient` is used, because
    the broker `base_url` already points at a localhost sidecar that injects identity
    and routes to `/authz`. `base_url` is a setting `langchain_openai` cannot strip
    (unlike `HTTP(S)_PROXY`), which is why the sidecar exists.
  - **Proxied mode** (no sidecar): the in-process `proxied_client` /
    `proxied_async_client` (httpx proxy + Membership VP) are used.

<!-- no-doctest: legacy `palonexus_agent` scaffold (graduated into `palonexus`) — not the shipped package; page pending REM-159 -->
```python
from palonexus_agent import build_llm

llm = build_llm(large=False, temperature=0.0)
```

See [Egress proxy & sidecar](/docs/sdk/egress-proxy-client/) for why both paths exist.

## Egress middleware — the model & tool gates

`palonexus_middleware` provides two LangChain agent-middleware gates that send
every model and tool call through the egress `/authz` decision point, carrying the
agent (actor), the user it acts for (subject), the task/thread id, and — for
tools — a fine-grained `Action` + `Resource`. Both **fail closed**: any non-allow,
or an unreachable decision point, denies.

| Symbol | Purpose |
|---|---|
| `palonexus_model_gate` (`@wrap_model_call`) | Authorizes the model egress edge before the call (target = `PALONEXUS_MODEL`, kind `model`). On deny raises `PermissionError`. |
| `palonexus_tool_gate` (`@wrap_tool_call`) | Resolves the tool's target service via `TOOL_TARGETS`, attaches any declared intent, and calls `/authz`. On deny substitutes a `ToolMessage`; on `401 + X-Palonexus-Needs-Approval: true` calls `interrupt(...)` to pause the graph for human-approved delegation; on allow runs the tool. |
| `set_identity(identity)` | Bind the agent's verifiable identity (call once after bootstrap) so each egress call presents a fresh VP instead of trusting an actor header. No-op (header-only) without a Membership VC. |
| `get_identity()` | The bound identity (or `None`); used by the egress-proxy client to attach the Membership VP. |
| `set_request_context(subject, task)` | Stash the acting user + task for this run (called by the run handler). |
| `set_tool_intent(action, resource)` | Declare the fine-grained `(action, resource)` for the next gated tool call. |

The decision contract (control-plane `:9191` `/authz`):

```
200                                    -> allow
403                                    -> deny
401 + X-Palonexus-Needs-Approval:true  -> needs human-approved delegation
```

<!-- no-doctest: legacy `palonexus_agent` scaffold (graduated into `palonexus`) — not the shipped package; page pending REM-159 -->
```python
from langchain.agents import create_agent
from palonexus_agent import build_llm
from palonexus_agent.palonexus_middleware import (
    palonexus_model_gate, palonexus_tool_gate,
)

agent = create_agent(
    model=build_llm(),
    tools=[read_runbook],
    middleware=[palonexus_model_gate, palonexus_tool_gate],
)
```

## Runbook tool — egress-gated + DID/VC challenge-response

`read_runbook(name)` is the regulated tool: the egress gate denies the first
attempt until a human-approved Delegation VC exists; once one is present, the tool
runs the real two-step `runbooks-api` challenge-response with `agentdid` (the same
protocol the server verifies).

| Symbol | Purpose |
|---|---|
| `resource_for(name) -> str` | `f"runbooks-api:/runbooks/{name}"`. |
| `RunbookContext` | Per-run state dataclass: `identity`, `settings`, `delegation_vcs` (`resource → Delegation VC JWT`), `exec_state` (live state proven in the challenge). `vc_for(name)` looks up the VC covering a runbook. |
| `challenge_response_access(name, ctx, *, http_client=None, resolver=None) -> dict` | Runs the two-step challenge-response and returns `{"status": "ok", "runbook": <spec>}`, or `{"status": "needs_delegation" / "denied", ...}`. Routes the gated `runbooks-api` call through the egress proxy (`proxied_client`, 45s timeout). |
| `make_read_runbook_tool(ctx_provider)` | Build the `read_runbook` LangChain tool bound to a context provider. `ctx_provider()` returns the current `RunbookContext` — a callable so the graph can refresh VCs mid-run after an access-broker escalation grants one. |

<!-- no-doctest: legacy `palonexus_agent` scaffold (graduated into `palonexus`) — not the shipped package; page pending REM-159 -->
```python
from palonexus_agent import make_read_runbook_tool, RunbookContext

def ctx_provider() -> RunbookContext:
    return RunbookContext(identity=identity, settings=settings,
                          delegation_vcs=current_vcs, exec_state=live_state)

read_runbook = make_read_runbook_tool(ctx_provider)
```

## create_app — the FastAPI host

`create_app` wraps a compiled `StateGraph` in a small uvicorn FastAPI app. On
startup (lifespan) it bootstraps identity, binds it for egress (`set_identity`),
writes the shared identity file for the sidecar (when `PALONEXUS_IDENTITY_FILE` is
set), opens the checkpointer, and builds the graph.

```python
def create_app(*, graph_builder: GraphBuilder,
               capabilities: list[dict] | None = None,
               settings: Settings | None = None) -> FastAPI: ...

# GraphBuilder = async (checkpointer, IdentityManager) -> compiled graph
```

| Endpoint | Method | Behaviour |
|---|---|---|
| `/invoke` | POST | Convenience: run the graph on an ad-hoc thread (`thread_id` from the body or a generated `run-…`). |
| `/threads/{thread_id}/runs` | POST | Run the graph on a thread (durable via the checkpointer). Reads the `X-Palonexus-Subject` header (the on-behalf-of user). Body must be a JSON object — the state fields, or nested under `"input"`. |
| `/threads/{thread_id}/resume` | POST | Resume an interrupted run via `Command(resume=...)` — the resume value is the `"resume"` key or the whole object. |
| `/identity` | GET | The agent's DID + provisioning status (`AgentIdentity.public_view()`); `503` if not provisioned. |
| `/healthz` | GET | Liveness — `{"status": "ok", "agent": <name>}`. |
| `/readyz` | GET | Readiness — `200` once identity is provisioned and the graph is built, else `503`. |

The run handler calls `set_request_context(subject, thread_id)` so the egress
middleware stamps actor/subject/task on every gated call in the run.

<!-- no-doctest: legacy `palonexus_agent` scaffold (graduated into `palonexus`) — not the shipped package; page pending REM-159 -->
```python
# app.py for one agent
from palonexus_agent import create_app
from palonexus_agent.config import get_settings
from graph import build_triage_graph

CAPABILITIES = [{"action": "runbook:read", "resource": "runbooks-api:/runbooks/*"}]

async def _builder(checkpointer, identity_mgr):
    return build_triage_graph(checkpointer, identity_mgr, get_settings())

app = create_app(graph_builder=_builder, capabilities=CAPABILITIES)
```

Invoke it:

```bash
curl -X POST localhost:8000/invoke \
  -H 'X-Palonexus-Subject: alice@corp' \
  -d '{"input": {"incident": "db latency spike"}}'
```

## See also

- [agentdid API reference](/docs/sdk/agentdid/) — the credential primitives this scaffold uses.
- [Egress proxy & sidecar](/docs/sdk/egress-proxy-client/) — network-layer enforcement.
- [Configuration & environment variables](/docs/sdk/config-env/) — every env var.
- [Deploy an agent](/docs/develop/deploy-an-agent/) — the full deployment workflow.
