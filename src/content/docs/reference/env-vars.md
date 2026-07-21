---
title: Environment variables
description: The platform-wide environment-variable reference for the control-plane, agent-idp, model-broker, and agents — every component is configured entirely by env, so the same image runs everywhere.
sidebar:
  order: 5
---

Come here when you're configuring or deploying a PaloNexus component and need to know what
each knob does and its default. Every component — control plane, agent-idp, model broker,
agents, and the SDK — is configured **entirely by environment variables**, and if you just
want the smallest set that works, jump to [Minimum viable env, per deployment
mode](#minimum-viable-env-per-deployment-mode).

Because config is all env, the same image runs in dev and prod, and only the Kustomize
overlay changes between them. The dev overlay simply removes the OIDC vars to allow anonymous
passthrough while policy still enforces public-vs-private from the registry.

## Control plane

| Variable | Default | Meaning |
|---|---|---|
| `DECISION_ADDR` | `:9191` | the ext_authz decision listener (`/authz` hot path) |
| `MGMT_ADDR` | `:8181` | the management listener (registry, audit, egress requests, `/metrics`, probes) |
| `EGRESS_PROXY_ADDR` | `:9092` | the egress forward-proxy listener (started only when `AGENT_IDP_URL` is set) |
| `OIDC_ISSUER` | *(unset)* | OIDC issuer URL for human JWT verification; unset → anonymous passthrough |
| `OIDC_AUDIENCE` | *(unset)* | required JWT audience |
| `OIDC_JWKS_URL` | *(unset)* | JWKS endpoint for verifying token signatures |
| `OPA_URL` | *(unset)* | OPA endpoint for the org-wide Rego veto; unreachable → fail-closed deny |
| `AGENT_IDP_URL` | *(unset)* | agent-idp base URL; enables VP verification and the egress proxy |
| `AGENT_IDENTITY_MODE` | `header` | `header` (trust the actor header, verify a VP if present) or `vc` (require a verified Membership VP) |
| `REGISTRY_BACKEND` | `memory` | registry store backend: `memory` · `postgres` · `mysql` · `sqlite` · `mongodb` |
| `REGISTRY_DB_URL` | *(unset)* | DSN for the chosen registry backend (required for non-memory) |
| `CONTROL_PLANE_MGMT_URL` | — | base mgmt URL the broker POSTs usage to (used by callers, e.g. the broker) |

**Egress-approval hold** is governed by the proxy's `ApprovalTimeout` (default 120s)
— a held needs-approval/external request that is not decided in time transitions to
`expired` (fail-closed).

**`REGISTRY_DB_URL` examples**

```bash
REGISTRY_BACKEND=postgres  REGISTRY_DB_URL='postgres://palonexus:pw@pg-rw.palonexus.svc:5432/palonexus?sslmode=disable'
REGISTRY_BACKEND=sqlite    REGISTRY_DB_URL=/var/lib/palonexus/registry.db
REGISTRY_BACKEND=mysql     REGISTRY_DB_URL='palonexus:pw@tcp(mysql.palonexus.svc:3306)/palonexus'
REGISTRY_BACKEND=mongodb   REGISTRY_DB_URL=mongodb://mongo.palonexus.svc:27017/palonexus
```

## agent-idp

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8090` | HTTP listen port |
| `IDP_STORE_BACKEND` | `memory` | store backend for agents/delegations/revocations: `memory` · `postgres` · `mysql` · `sqlite` · `mongodb` |
| `IDP_DB_URL` | *(unset)* | DSN for the chosen store backend (required for non-memory) |
| `LOG_LEVEL` | `INFO` | Python log level |

The issuer/root DID is `did:web:agent-idp.agent-idp.svc` (derived from the in-cluster
host). The default delegation TTL and the StatusList id (`default`) are defined in
`app/issuer.py`.

```bash
IDP_STORE_BACKEND=postgres IDP_DB_URL='postgresql://palonexus:pw@pg-rw.agent-idp.svc:5432/agentidp'
```

### Enterprise IAM (directory, governance, authority, STS)

The enterprise-IAM features add **no new required environment variables**. They persist
through the same `IDP_STORE_BACKEND` / `IDP_DB_URL` already documented above, and the
STS token signer **reuses the existing issuer Ed25519 key** (`ISSUER_PRIVATE_KEY_B64`
— see *agentdid / issuer* below) — there is no separate signing key.

What an operator would tune today lives as **module constants**, not env vars. These are
MVP defaults; a future release may move them to env/config:

| Constant | Where | Default | Meaning |
|---|---|---|---|
| `RESOURCE_OWNERS` | `app/authority.py` | per-tenant map | resource → owner (`employee`/`team`) used to grant the `resource_owner` authority basis |
| `ADMIN_GROUPS` | `app/authority.py` | `{"grp-security"}` | directory groups whose members count as the PaloNexus platform admin |
| `ADMIN_ROLE` | `app/authority.py` | `palonexus_admin` | employee role that counts as platform admin |
| `AUDIENCE_ALLOWLIST` | `app/sts.py` | 3 `*.acme.internal` URLs | the only `aud` values the STS will bind a token to |
| `MAX_TTL` | `app/sts.py` | `900` (s) | hard cap on agent-token lifetime — excessive requests are reduced, not denied |
| `DEFAULT_TTL` | `app/sts.py` | `600` (s) | agent-token lifetime when the request omits a TTL |

**Persisted tables.** The features create their tables automatically on first use
(`CREATE TABLE IF NOT EXISTS`) for any non-memory backend — no migration step:

```text
idp_employees          directory employees (F1)
idp_groups             directory groups (F1)
idp_syncs              per-sync reconcile reports (F1)
idp_agent_governance   agent ownership/governance records (F3)
idp_gov_delegations    authorized governance delegations (F4/F5)
idp_revocations_log    durable revocation log with reason codes (F4)
idp_tokens             STS token audit log — metadata only (F6)
```

See the [Connect agents to enterprise authority — hands-on](/docs/develop/enterprise-iam/) and the
[Enterprise IAM API](/docs/reference/enterprise-iam-api/).

```bash
IDP_STORE_BACKEND=postgres IDP_DB_URL='postgresql://palonexus:pw@pg-rw.agent-idp.svc:5432/agentidp'
ISSUER_PRIVATE_KEY_B64='<generate_keypair priv b64>'   # stable issuer key; also signs STS tokens
```

## Model broker (LiteLLM)

| Variable | Meaning |
|---|---|
| `OPENAI_API_KEY` | the provider key — held **only** here, never in an agent pod |
| `CONTROL_PLANE_MGMT_URL` | base URL the broker POSTs per-call usage to (`/v1/usage`) |

The broker listens on `:8080`, exposes logical models `model-openai` and
`model-openai-large`, and probes on `/health/liveliness` + `/health/readiness`.

## Agents (and the egress sidecar)

| Variable | Meaning |
|---|---|
| `PALONEXUS_AGENT_NAME` | the agent's registry/idp name (also used by the admission webhook) |
| `HTTPS_PROXY` / `HTTP_PROXY` | `http://egress-proxy.palonexus.svc:80` — routes all outbound calls through the egress proxy |
| `NO_PROXY` | bypass list — must include `agent-idp.agent-idp.svc` (identity bootstrap) + DNS + `localhost` |
| `PALONEXUS_USE_EGRESS_SIDECAR` | `1` to enable the localhost egress sidecar for model egress |
| `PALONEXUS_BROKER_URL` | broker base URL the agent uses; points at the sidecar (`http://localhost:8788`) when the sidecar is enabled |
| `PALONEXUS_IDENTITY_FILE` | shared path the agent writes its identity to and the sidecar reads (`/var/run/palonexus-identity/identity.json`) |

The egress sidecar (`agents/egress-sidecar`) additionally reads `REAL_BROKER_URL`,
`EGRESS_PROXY_URL`, and `VP_TTL_S` (default 12h) to mint a fresh, revocable Membership
VP per call and forward through the proxy.

Pods that should be governed are labeled `palonexus.io/agent=true` so the admission
webhook injects the proxy env and rejects them if the agent is not provisioned.

## SDK (`palonexus` package — `PaloNexus.from_env()`)

The Python SDK reads its own `PALONEXUS_*` variables (distinct from the agent-pod vars
in [SDK config & env](/docs/sdk/config-env/) — these configure the `PaloNexus` **client
facade**, which defaults to `localhost` for local dev):

| Variable | Default | Meaning |
|---|---|---|
| `PALONEXUS_CONTROL_PLANE_URL` | `http://localhost:9191` | the `/authz` decision endpoint the SDK calls |
| `PALONEXUS_MGMT_URL` | `http://localhost:8181` | the management plane (registry, audit) the SDK reads |
| `PALONEXUS_IDP_URL` | `http://localhost:8090` | agent-idp base URL (register, provision, delegations, revocation) |
| `PALONEXUS_API_KEY` | *(unset)* | SDK API key (`pn_live_…` / `pn_test_…`); sent as the bearer for SDK calls |
| `PALONEXUS_TENANT_ID` | `""` | tenant/org id (e.g. `7gdgqfu5j0oo` for Northstar) |
| `PALONEXUS_AGENT_TOKEN` | `""` | the agent workload token for live egress decisions |
| `PALONEXUS_OFFLINE` | `""` | when truthy (`1`/`true`/`yes`), `from_env()` returns an in-memory `PaloNexus.offline()` — no cluster, no network |

```python
from palonexus import PaloNexus
pn = PaloNexus.from_env()          # reads the table above
pn = PaloNexus.offline()           # or force offline regardless of env
```

## Reference demo seeder — Logto (`LOGTO_*`)

:::note[Reference demo (Logto) — optional]
These variables configure the **demo seeder** that loads the Northstar **demo**
identity model into a **Logto** reference tenant. They are **only needed to run the
demo seed** — PaloNexus itself does not require Logto. Any OIDC/SCIM workforce IdP
(Okta, Microsoft Entra ID, Auth0, Ping, Google Workspace, Amazon Cognito, Keycloak,
Logto, …) integrates via the standard patterns — see
[IdP Support Model](/docs/concepts/enterprise-iam/#idp-support-model).
:::

The `seed-logto` tool seeds the Northstar demo org (workforce identity) into a Logto tenant.
It is configured entirely by `LOGTO_*` (an `.env.example` ships in `platform/seed-logto/`):

| Variable | Example | Meaning |
|---|---|---|
| `LOGTO_BASE_URL` | `https://your-tenant.logto.app` | Logto tenant base URL (alias `LOGTO_ENDPOINT`) |
| `LOGTO_TENANT_ID` | `your-sandbox-tenant-id` | the Logto tenant id |
| `LOGTO_M2M_APP_ID` | — | M2M app client id (alias `LOGTO_M2M_CLIENT_ID`) — **a secret** |
| `LOGTO_M2M_APP_SECRET` | — | M2M app client secret (alias `LOGTO_M2M_CLIENT_SECRET`) — **a secret** |
| `LOGTO_MGMT_API_RESOURCE` | `https://your-tenant.logto.app/api` | the Management API resource/audience (alias `LOGTO_MANAGEMENT_API_AUDIENCE`) |
| `LOGTO_ENV` | `sandbox` | `sandbox` \| `prod` — guards destructive ops |
| `LOGTO_SEED_NAMESPACE` | `palonexus-demo` | namespace tag for all seeded objects (alias `SEED_NAMESPACE`) |
| `LOGTO_DRY_RUN` | `true` | preview (`plan`) without writing |
| `LOGTO_ALLOWED_HOST_SUFFIX` | `.logto.app,localhost` | guard: only these hosts may be targeted |
| `LOGTO_ALLOWED_EMAIL_SUFFIX` | `.test,.example` | guard: only these email suffixes may be seeded |
| `LOGTO_MAX_DELETE` | `400` | safety cap on deletions per run |
| `ALLOW_LOGTO_SEED` | `true` | master enable for any write |

The M2M id/secret are credentials — handle them per [Secrets](/docs/operations/secrets/), never
bake them into an image.

## Minimum viable env, per deployment mode

The smallest set that works in each mode — everything else has a working default:

| Mode | Minimum viable env |
|---|---|
| **SDK offline (tests/dev)** | `PALONEXUS_OFFLINE=1` — nothing else; no cluster, no keys |
| **SDK against a local stack** | `PALONEXUS_CONTROL_PLANE_URL`, `PALONEXUS_IDP_URL`, `PALONEXUS_MGMT_URL` (defaults already point at `localhost`) |
| **SDK against a sandbox tenant** | the three URLs above + `PALONEXUS_API_KEY` (+ `PALONEXUS_TENANT_ID`) |
| **Control plane (dev/anon)** | none required — `DECISION_ADDR`/`MGMT_ADDR` default; OIDC unset → anonymous passthrough |
| **Control plane (governed egress)** | `AGENT_IDP_URL` (enables VP verification + egress proxy); add `OPA_URL` for the org veto; `AGENT_IDENTITY_MODE=vc` for production |
| **Durable control plane** | `REGISTRY_BACKEND` + `REGISTRY_DB_URL` and `IDP_STORE_BACKEND` + `IDP_DB_URL` |
| **Model broker** | `OPENAI_API_KEY` (held only here) + `CONTROL_PLANE_MGMT_URL` |
| **Reference demo seeder (Logto)** | `LOGTO_BASE_URL`, `LOGTO_TENANT_ID`, `LOGTO_M2M_APP_ID`, `LOGTO_M2M_APP_SECRET`, `LOGTO_MGMT_API_RESOURCE`, `ALLOW_LOGTO_SEED=true` |

## Related

- [Headers](/docs/reference/headers/)
- [HTTP API](/docs/reference/http-api/)
- [SDK config & env (agent pod)](/docs/sdk/config-env/)
- [Agent identity & credentials](/docs/concepts/identity-and-credentials/)
- [Operations — self-hosting](/docs/operations/self-hosting/) · [Secrets](/docs/operations/secrets/) · [Migrations](/docs/operations/migrations/)
