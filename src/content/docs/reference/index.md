---
title: Reference overview
description: The two HTTP API planes (control-plane management + agent-idp), the X-Palonexus-* headers and Proxy-Authorization VP, and the platform-wide environment variables.
sidebar:
  order: 1
---

The PaloNexus contract consists of its HTTP APIs, request and response headers,
and component environment variables.

## The two API planes

PaloNexus exposes its contracts on a small number of listeners (`ext_authz` below is
Envoy's external-authorization hook — the filter that calls the decision plane):

| Plane | Listener | Served by | Reference |
|---|---|---|---|
| **Decision (ext_authz)** | `:9191` `/authz` | control-plane | [HTTP API](/docs/reference/http-api/) |
| **Egress forward-proxy** | `:9092` (HTTP proxy) | control-plane | [HTTP API](/docs/reference/http-api/) |
| **Management** | `:8181` (registry, audit, egress requests, `/metrics`) | control-plane | [HTTP API](/docs/reference/http-api/) |
| **Identity** | `:8090` (agents, delegations, revocation, VP verify) | agent-idp | [HTTP API](/docs/reference/http-api/) |
| **Enterprise IAM** | `:8090` (directory sync, employee identity, governance, authority delegations, revocation, the Security Token Service, STS) | agent-idp | [Enterprise IAM API](/docs/reference/enterprise-iam-api/) |
| **Model broker** | `:8080` (OpenAI-compatible) | model-broker (LiteLLM) | [HTTP API](/docs/reference/http-api/) |

## Headers

The decision is shaped by — and produces — a set of `X-Palonexus-*` headers, plus the
`Proxy-Authorization` Verifiable Presentation (VP) at the egress proxy. The presence of
`X-Palonexus-Actor` is what selects the egress decision path. See
[Headers](/docs/reference/headers/).

## Environment variables

Every component is configured entirely by environment variables — the same image runs
everywhere; only the Kustomize overlay changes. `AGENT_IDENTITY_MODE`,
`REGISTRY_BACKEND`/`REGISTRY_DB_URL`, `OIDC_*`, `EGRESS_PROXY_ADDR`, and the agent-idp
`IDP_*` vars are the load-bearing ones. See
[Environment variables](/docs/reference/env-vars/).

## See also

- [CLI reference](/docs/reference/cli/) — the `seed-logto` identity seeder, the platform `make` targets, the `kubectl`/kustomize apply path, and the SDK as the programmatic entry point.
- [agent-idp API (interactive)](/docs/reference/api/agent-idp/) — try-it reference generated from the OpenAPI 3.1 spec.
- [Releases & Changelog](/docs/reference/changelog/) — versioning policy, the current compatible component set, and release notes.
- [Enterprise IAM API](/docs/reference/enterprise-iam-api/) — enterprise identity and access management (IAM): directory sync, employee identity, ownership governance, revocation cascade, human-authority delegation, and the STS token exchange.
- [Connect agents to enterprise authority (concept)](/docs/concepts/enterprise-iam/) — the control loop those endpoints implement.
- [Architecture](/docs/concepts/architecture/) — how the listeners and packages fit together.
- [Credential-safe action enforcement](/docs/concepts/egress-enforcement/) — the proxy and approval contracts in context.
- [Agent identity & credentials](/docs/concepts/identity-and-credentials/) — the identity modes and backends.
