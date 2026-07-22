---
title: Credential-Safe Action Enforcement
description: The developer's view of the egress-gateway enforcement mode — how the egress sidecar makes a LangChain model call traverse /authz transparently, how tool and peer calls use the proxied client, NO_PROXY, and the coarse-vs-fine layering.
sidebar:
  order: 3
---

This is the developer's view of the **egress-gateway enforcement mode** — one of the
[three enforcement modes](/docs/concepts/index/#three-enforcement-modes) (governed
tool · token exchange · egress gateway). Your agent code never holds standing
credentials for the systems it acts on; every outbound call is authorized at `/authz`
and credentials are injected after the untrusted boundary — the credential-injecting
outbound-proxy pattern LangChain's sandbox docs recommend.

The goal: **every** outbound agent call is decided at `/authz`, regardless of
framework (`create_agent`, a hand-rolled `StateGraph`, raw `httpx`/`curl`),
enforced at the **network layer** — not cooperative middleware — with a
human-approval path. This page is how that works in practice.

## Three layers, defense in depth

| Layer | What it covers | What it can't see |
|---|---|---|
| **In-process middleware** (`palonexus_middleware.py`) | adds task/subject context; turns `needs_human_approval` into a LangGraph `interrupt()` | nothing if the agent is non-cooperating or compromised |
| **Egress forward-proxy** (`HTTPS_PROXY` floor + the sidecar) | the *guarantee*: every byte leaving the pod traverses `/authz` carrying a Verifiable Presentation (VP) | only raw HTTP — coarse allowlist + budget |
| **Server-side DID/VC** (decentralized identifier / Verifiable Credential; e.g. runbooks-api) | the fine-grained, human-approved, per-resource gate | irrelevant to coarse routing |

The middleware is the ergonomic path; the proxy is the enforcement floor. A raw
`curl` from the pod with no VP is denied (`407`) — that is the
whole point.

## How a model call traverses /authz

LangChain's OpenAI client talks to its `base_url` and **does not reliably honour
the process `HTTP(S)_PROXY` env** — it injects its own transport that drops it. So
a `ChatOpenAI` call would leave the pod *without* traversing the egress proxy,
silently escaping `/authz`. That is the gap the **egress sidecar** closes.

The fix is `base_url`, **not** `HTTP_PROXY`:

<!-- no-doctest: live-model illustration — `ChatOpenAI(...)` wiring, not offline-runnable -->
```python
# The agent points its model base_url at the localhost sidecar — a setting
# LangChain honours and cannot strip.
ChatOpenAI(base_url="http://localhost:8788",   # PALONEXUS_BROKER_URL
           model="model-openai",
           api_key=BROKER_API_KEY,
           default_headers={"x-palonexus-actor": AGENT_NAME})
```

The flow:

1. On startup the agent writes its identity (`did`, `privateKeyB64`,
   `membershipVc`) to a shared `emptyDir`
   (`PALONEXUS_IDENTITY_FILE=/var/run/palonexus-identity/identity.json`).
2. The model call goes to the sidecar at `localhost:8788`.
3. Per request the sidecar reads the identity file and mints a **fresh, long-TTL
   (12h), revocable** Membership VP.
4. The sidecar forwards to the real broker (`REAL_BROKER_URL`) **through** the
   egress proxy (`EGRESS_PROXY_URL`) with the VP as `Proxy-Authorization: Bearer
   <VP>`.
5. The proxy verifies the VP, resolves the target to the `model-openai` registry
   entry, runs the egress decision, and on allow forwards to the broker.

A 12h TTL is safe: the proxy re-checks the Membership VC against the StatusList on
**every** call, so revoking it cuts egress immediately regardless of TTL. Set
`PALONEXUS_USE_EGRESS_SIDECAR=1` to enable this path.

## How tool and peer calls traverse /authz

Tool calls, agent-to-agent (A2A) hops, and external requests use ordinary Python
HTTP clients, which **do** honour `HTTPS_PROXY`. The
[`palonexus_agent` SDK](/docs/sdk/palonexus-agent/) ships a `proxied_client` that
attaches the agent's Membership VP as `Proxy-Authorization` so every such request
is decided at `/authz` like any other egress:

<!-- no-doctest: legacy `palonexus_agent` scaffold + `...` placeholder — not executable -->
```python
from palonexus_agent.egress_proxy import proxied_client

# Agent->agent escalation hop, carrying this agent's VP through the proxy.
client = proxied_client(timeout=120.0)
r = client.post(f"{broker_url}/invoke",
                headers={"X-Palonexus-Subject": subject},
                json={"input": {"actor": actor, "task": task, ...}})
```

Without the VP the proxy returns `407`. The proxy reverse-maps the request target
`host:port` to a registry Service (with a host-prefix fallback, e.g.
`model-broker.*` → `model-openai`). A target that matches no registry entry is
treated as `kind: external`, which requires approval or an explicit allowlist.

## NO_PROXY: the bootstrap exception

Identity bootstrap is a chicken-and-egg problem: the agent has no VP until it has
provisioned at agent-idp, so the call to agent-idp **must bypass** the proxy.
`NO_PROXY` carves out exactly that, plus DNS and the in-cluster decision alias:

```
NO_PROXY=agent-idp.agent-idp.svc,egress.palonexus.svc,control-plane.palonexus.svc,localhost,127.0.0.1,kubernetes.default.svc
```

Everything else — broker, runbooks, peers, external hosts — routes via the proxy.
This is why the proxy-only NetworkPolicy still allows DNS and `agent-idp:8090`
directly: see [Deploy an agent](/docs/develop/deploy-an-agent/#3-the-proxy-only-networkpolicy).

## The layering: coarse at the proxy, fine at the server

This distinction governs the `dataClass` you register a target with:

- **The egress proxy is the COARSE gate** — identity (VP) + allowlist (`Allow*`) +
  budget. It only sees raw HTTP, so it **cannot** match a fine-grained
  `runbook:read` delegation against a specific resource path.
- **Fine-grained, human-approved DID/VC enforcement is SERVER-SIDE.** runbooks-api
  runs its own challenge-response per resource. So it is registered
  `dataClass: internal`: allowlist-gated at the proxy, DID/VC-gated at the server.
- **Targets with no server-side gate stay `regulated`** (e.g. `scale_deployment`),
  so the proxy itself **holds** them for human approval via the Credential-Safe
  Enforcement console.

```
agent --VP--> egress proxy            (coarse: identity + allowlist + budget)
                  |
                  +--> runbooks-api    (dataClass=internal; FINE DID/VC at the server)
                  +--> scale_deployment (dataClass=regulated; HELD at the proxy for approval)
```

Both outcomes land on the audit chain as an `egress.proxy` record (allow or deny,
with `actor=<agent>`). The human-approval mechanics are in
[Authority delegation](/docs/develop/delegations-and-approvals/); the
registry controls in [Budgets and allowlists](/docs/develop/budgets-and-allowlists/).

## Verify the sidecar handoff

```bash
kubectl -n apps exec <pod> -c agent -- python -c \
  "import urllib.request;print(urllib.request.urlopen('http://localhost:8788/healthz').read())"
# expect status:ok + the agent's did (proves the identity-file handoff works)
```

A successful in-allowlist model call yields an `egress.proxy` `allow=true,
reason=forwarded` audit row; a blocked one yields `allow=false` with a reason like
`model "…" is not in <agent>'s egress allowlist`.
