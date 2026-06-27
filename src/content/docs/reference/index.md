---
title: Reference overview
description: The two HTTP API planes (control-plane management + agent-idp), the X-Palonexus-* headers and Proxy-Authorization VP, and the platform-wide environment variables.
sidebar:
  order: 1
---

This section is the precise, code-accurate contract reference for PaloNexus. It
covers the HTTP APIs, the request/response headers, and the environment variables
that configure every component.

## The two API planes

PaloNexus exposes its contracts on a small number of listeners:

| Plane | Listener | Served by | Reference |
|---|---|---|---|
| **Decision (ext_authz)** | `:9191` `/authz` | control-plane | [HTTP API](/docs/reference/http-api/) |
| **Egress forward-proxy** | `:9092` (HTTP proxy) | control-plane | [HTTP API](/docs/reference/http-api/) |
| **Management** | `:8181` (registry, audit, egress requests, `/metrics`) | control-plane | [HTTP API](/docs/reference/http-api/) |
| **Identity** | `:8090` (agents, delegations, revocation, VP verify) | agent-idp | [HTTP API](/docs/reference/http-api/) |
| **Enterprise IAM** | `:8090` (directory sync, employee identity, governance, authority delegations, revocation, STS) | agent-idp | [Enterprise IAM API](/docs/reference/enterprise-iam-api/) |
| **Model broker** | `:8080` (OpenAI-compatible) | model-broker (LiteLLM) | [HTTP API](/docs/reference/http-api/) |

## Headers

The decision is shaped by — and produces — a set of `X-Palonexus-*` headers, plus the
`Proxy-Authorization` Verifiable Presentation at the egress proxy. The presence of
`X-Palonexus-Actor` is what selects the egress decision path. See
[Headers](/docs/reference/headers/).

## Environment variables

Every component is configured entirely by environment variables — the same image runs
everywhere; only the Kustomize overlay changes. `AGENT_IDENTITY_MODE`,
`REGISTRY_BACKEND`/`REGISTRY_DB_URL`, `OIDC_*`, `EGRESS_PROXY_ADDR`, and the agent-idp
`IDP_*` vars are the load-bearing ones. See
[Environment variables](/docs/reference/env-vars/).

## See also

- [CLI reference](/docs/reference/cli/) — the `seed-logto` reference demo seeder, the platform `make` targets, the `kubectl`/kustomize apply path, and the SDK as the programmatic entry point.
- [agent-idp API (interactive)](/docs/reference/api/agent-idp/) — try-it reference generated from the OpenAPI 3.1 spec.
- [Releases & Changelog](/docs/reference/changelog/) — versioning policy, the current compatible component set, and release notes.
- [Enterprise IAM API](/docs/reference/enterprise-iam-api/) — directory sync, employee identity, ownership governance, revocation cascade, human-authority delegation, and the STS token exchange.
- [Enterprise IAM (concept)](/docs/concepts/enterprise-iam/) — the control loop those endpoints implement.
- [Architecture](/docs/concepts/architecture/) — how the listeners and packages fit together.
- [Egress enforcement](/docs/concepts/egress-enforcement/) — the proxy and approval contracts in context.
- [Persistence & identity](/docs/concepts/persistence-and-identity/) — the identity modes and backends.
