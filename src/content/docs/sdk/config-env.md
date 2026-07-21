---
title: Configuration & environment variables
description: Every environment variable a PaloNexus-governed agent reads — identity, egress decision point, agent-idp, model broker, runbooks-api, observability, persistence, egress sidecar, and proxy routing.
sidebar:
  order: 5
---

A `palonexus_agent` pod is configured entirely through the environment. All values
have sane defaults pointed at in-cluster service names, so a pod with only
`PALONEXUS_AGENT_NAME` set is functional. Most are read in
`palonexus_agent/config.py` (`Settings`); a few are read directly by the egress
middleware, the egress-proxy helpers, and the sidecar.

`Settings` is a process-wide singleton: use `get_settings()` to read it and
`reload_settings()` to force a fresh read (tests monkeypatch env then reload).

## The SDK facade — `PaloNexus.from_env()`

Separately from the agent-pod settings below, the `palonexus` SDK **facade** reads its own
small set of `PALONEXUS_*` variables in `PaloNexus.from_env()` (`client.py`). These are what
you set when embedding the SDK in your own code or CI. Every value falls back to the local-dev
topology in `platform/CLAUDE.md`, and **`PALONEXUS_OFFLINE` is the master switch**: when truthy
(`1` / `true` / `yes`) `from_env()` returns `PaloNexus.offline()` and *every other variable
below is ignored* — the facade routes through the in-memory `FakeControlPlane`, so the same code
path runs in CI with no cluster, no keys, and no network.

| Env var | Default | Live | Offline | Purpose |
|---|---|---|---|---|
| `PALONEXUS_OFFLINE` | `""` | — | **master switch** | Truthy → `PaloNexus.offline()` (in-memory `FakeControlPlane`); ignores every var below. |
| `PALONEXUS_CONTROL_PLANE_URL` | `http://localhost:9191` | **used** | ignored | Base URL of the `/authz` egress decision listener (`:9191`). |
| `PALONEXUS_MGMT_URL` | `http://localhost:8181` | **used** | ignored | Control-plane management API (`:8181`) — registry + `/v1/audit` (used by `pn.audit`). |
| `PALONEXUS_IDP_URL` | `http://localhost:8090` | **used** | ignored | agent-idp base URL (`:8090`) — register, provision, delegations, revocation, directory. |
| `PALONEXUS_API_KEY` | unset (`None`) | **used** | ignored | The SDK API key (`pn_live_…` / `pn_test_…`), sent as a `Bearer` on idp + management calls. |
| `PALONEXUS_TENANT_ID` | `""` | **used** | `"offline"` | Default org/tenant id for governance calls (e.g. the Northstar org id `7gdgqfu5j0oo`). |
| `PALONEXUS_AGENT_TOKEN` | `""` | **used** | ignored | Workload token presented as `Authorization` on egress `/authz` calls; absent → anonymous, and private targets deny. |

### SDK API keys (`pn_live_` / `pn_test_`)

The `PALONEXUS_API_KEY` your client presents is created, scoped, rotated, and revoked from the
operator portal's **SDK API keys** console (`/settings/keys`). Keys are **deny-by-default**: a
new key carries only the scopes you toggle on, are **hashed at rest**, and **fail closed the
moment they are revoked** — the next call the SDK makes with a revoked key is rejected. Use a
`pn_test_` key against a sandbox tenant and a `pn_live_` key in production.

![SDK API-keys console: a new-key form with an environment selector and deny-by-default scope toggles, above a keys table listing a revoked test key with its scopes and last-used time.](/docs/screenshots/api-keys.png)

*Create, scope, rotate and revoke the SDK keys the `palonexus` client presents as `PALONEXUS_API_KEY`; keys are hashed at rest and fail closed when revoked.*

## Identity & agent metadata

| Env var | Default | Read by | Purpose |
|---|---|---|---|
| `PALONEXUS_AGENT_NAME` | `unnamed-agent` | `config.py`, middleware | The agent's name — its identity at agent-idp, the `X-Palonexus-Actor` header, and the `x-palonexus-actor` broker meter tag. |
| `PALONEXUS_AGENT_ROLE` | `""` (falls back to name) | `config.py` | The role sent at registration. |
| `PALONEXUS_OFFLINE` | `""` | `config.py` | When truthy (`1`/`true`/`yes`), bootstrap mints a local `did:key` with no agent-idp calls — for tests/dev. |

## agent-idp (identity provider)

| Env var | Default | Purpose |
|---|---|---|
| `PALONEXUS_IDP_URL` | `http://agent-idp.agent-idp.svc:8090` | The agent-idp base URL — register, provision, delegation, and `did:web` resolution. |
| `AGENTDID_ISSUER_DID` | `did:web:agent-idp.agent-idp.svc` | The issuer/root DID used to verify issuer-signed VCs. |

`PALONEXUS_IDP_URL` is also the base URL the bundled enterprise-IAM CLIs
(`directory_cli`, `identity_cli`, `governance_cli`, `authority_cli`, `revocation_cli`,
`sts_cli`) read — point them at a local server or a DOKS port-forward with the same var.

## Enterprise IAM (agent-idp)

The enterprise-IAM layer (directory sync, employee identity resolution, agent
governance, human-authority delegation, revocation cascade, and the agent STS) is
configured **on the agent-idp side**, not in the agent pod. It adds **no new required
env vars**: it persists through the same `IDP_STORE_BACKEND` / `IDP_DB_URL` as the rest
of the IdP, and the STS signer **reuses the existing `ISSUER_PRIVATE_KEY_B64` issuer
key** — no separate signing key.

The knobs an operator would tune are **module constants** today (MVP; a future release
may move them to env):

| Constant | Where | Purpose |
|---|---|---|
| `RESOURCE_OWNERS` | `app/authority.py` | resource → owner map for the `resource_owner` authority basis |
| `ADMIN_GROUPS` / `ADMIN_ROLE` | `app/authority.py` | who counts as the PaloNexus platform admin |
| `AUDIENCE_ALLOWLIST` | `app/sts.py` | the only `aud` values the STS will bind a token to |
| `MAX_TTL` / `DEFAULT_TTL` | `app/sts.py` | agent-token lifetime cap (900s) and default (600s) |

The features create their tables (`idp_employees`, `idp_groups`, `idp_syncs`,
`idp_agent_governance`, `idp_gov_delegations`, `idp_revocations_log`, `idp_tokens`)
automatically on any non-memory backend.

See [Environment variables § agent-idp](/docs/reference/env-vars/#agent-idp) for the full
table and the [Enterprise IAM API](/docs/reference/enterprise-iam-api/) for the
endpoints; the [Connect agents to enterprise authority — hands-on](/docs/develop/enterprise-iam/) walks the CLIs.

## Egress decision point

| Env var | Default | Read by | Purpose |
|---|---|---|---|
| `PALONEXUS_EGRESS_URL` | `http://egress.palonexus.svc.cluster.local` | `config.py`, middleware | The egress gateway the middleware asks at `/authz`. In dev/tests it can point straight at the control-plane `/authz` on `:9191`. |
| `PALONEXUS_TOKEN_PATH` | `/var/run/secrets/palonexus/token` | `config.py`, middleware | File the agent's bearer token is read from for the `Authorization` header on `/authz` calls. |

## Model broker (OpenAI-compatible)

| Env var | Default | Purpose |
|---|---|---|
| `PALONEXUS_BROKER_URL` | `http://model-broker.palonexus.svc.cluster.local:8080` | The model broker base URL. In sidecar mode, point this at the localhost sidecar so model calls can't bypass the gate. `build_llm` appends `/v1`. |
| `BROKER_API_KEY` | `sk-broker-dev` | The broker **master key** (not an OpenAI key) — the agent never holds a provider key. |
| `PALONEXUS_MODEL` | `model-openai` | The default (cheap) logical model name; also the model-egress target the middleware authorizes. |
| `PALONEXUS_MODEL_LARGE` | `model-openai-large` | The model selected by `build_llm(large=True)`. |

## Egress sidecar & proxy routing

| Env var | Default | Read by | Purpose |
|---|---|---|---|
| `PALONEXUS_USE_EGRESS_SIDECAR` | unset | `llm.py` | When set, `build_llm` uses a plain HTTP client (the broker `base_url` already targets the sidecar, which owns the proxy + VP). When unset, the in-process proxied client is used. |
| `PALONEXUS_IDENTITY_FILE` | (agent: unset; sidecar: `/var/run/palonexus-identity/identity.json`) | `app.py`, sidecar | The shared identity file the agent writes (`{did, privateKeyB64, membershipVc}`) and the sidecar reads to mint fresh VPs. The agent only writes it when this is set. |
| `REAL_BROKER_URL` | `http://model-broker.palonexus.svc.cluster.local:8080` | sidecar | The real broker the sidecar forwards to. |
| `EGRESS_PROXY_URL` | `http://egress-proxy.palonexus.svc.cluster.local` | sidecar | The egress proxy the sidecar routes through, with the VP as `Proxy-Authorization`. |
| `VP_TTL_S` | `43200` (12h) | sidecar | Sidecar VP lifetime (revocation still enforced per-call at `/authz`). |
| `PALONEXUS_PROXY_VP_TTL_S` | `43200` (12h) | `egress_proxy.py` | TTL of the proxy-auth VP minted by `proxied_client`/`proxied_async_client` (`PROXY_VP_TTL_S`). |
| `HTTPS_PROXY` / `HTTP_PROXY` (and lowercase) | injected by k8s | `egress_proxy.py` | Point at `egress-proxy.palonexus.svc`; the pod NetworkPolicy permits egress only here, forcing all outbound calls through `/authz`. `proxy_url()` reads these. |
| `NO_PROXY` | injected by k8s | env-respecting clients | Exempts the agent-idp bootstrap (and other in-cluster control traffic) from the proxy, so identity provisioning doesn't loop through the gate. |

## Regulated tools & observability

| Env var | Default | Purpose |
|---|---|---|
| `PALONEXUS_RUNBOOKS_URL` | `http://runbooks-api.apps.svc:8081` | The regulated DID/VC runbooks-api the runbook tool calls (gated egress + challenge-response). |
| `PALONEXUS_PROMETHEUS_URL` | `http://lgtm.observability.svc:9090` | Prometheus endpoint for the diagnostics agent. |
| `PALONEXUS_LOKI_URL` | `http://lgtm.observability.svc:3100` | Loki endpoint for the diagnostics agent. |

## Persistence & tracing

| Env var | Default | Purpose |
|---|---|---|
| `PALONEXUS_AGENT_DB_URL` | `""` | Postgres URL for the LangGraph checkpointer; empty selects an in-memory checkpointer. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `""` | OTLP endpoint; empty disables span export. |

## Other middleware / transport tunables

| Env var | Default | Read by | Purpose |
|---|---|---|---|
| `LANGCHAIN_OPENAI_TCP_KEEPALIVE` | unset | `langchain_openai` transport | Enables TCP keep-alive on the OpenAI client connection — useful for long-lived broker connections under enforcement (set in the agent Deployment). |

## A minimal Deployment env

```yaml
env:
  - name: PALONEXUS_AGENT_NAME
    value: incident-triage
  - name: PALONEXUS_USE_EGRESS_SIDECAR
    value: "1"
  - name: PALONEXUS_BROKER_URL
    value: http://localhost:8788      # the in-pod egress sidecar
  - name: PALONEXUS_IDENTITY_FILE
    value: /var/run/palonexus-identity/identity.json
  - name: HTTPS_PROXY
    value: http://egress-proxy.palonexus.svc.cluster.local:3128
  - name: NO_PROXY
    value: agent-idp.agent-idp.svc,localhost,127.0.0.1
  - name: LANGCHAIN_OPENAI_TCP_KEEPALIVE
    value: "1"
```

## See also

- [palonexus_agent scaffold](/docs/sdk/palonexus-agent/) — `Settings`, `build_llm`, `create_app`.
- [Egress proxy & sidecar](/docs/sdk/egress-proxy-client/) — how the proxy/sidecar env is used.
- [Deploy an agent](/docs/develop/deploy-an-agent/) — the full deployment workflow.
