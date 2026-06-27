---
title: Local quickstart
description: Run this documentation site locally, and bring the PaloNexus platform up on a local kind cluster.
sidebar:
  order: 3
---

Two things you can run locally: **this docs site**, and the **platform** itself.

## Run the docs site locally

The docs site is an [Astro Starlight](https://starlight.astro.build) project under
`../palonexus-web`, served from the `/docs` context.

```bash
cd palonexus-web
npm install
npm run dev          # http://localhost:4321/docs/
```

Build the static site (output in `dist/`):

```bash
npm run build        # static HTML + Pagefind search index
npm run preview      # serve the built site locally
```

## Run the platform locally (kind)

The whole control layer comes up on a local [kind](https://kind.sigs.k8s.io) cluster
with one command (real Kubernetes, nothing mocked). On a Docker-less Mac, use podman.

```bash
cd platform
make demo-up         # build images, create the kind cluster, apply the overlay, port-forward
```

This brings up the six pillars + the four demo agents + Grafana LGTM + the portal. When it
finishes, the consoles are port-forwarded:

- **Portal** — http://localhost:3000 (Overview, Registry, Decisions, Audit, Identity,
  Approvals, Egress Approvals, Agents, Traces)
- **Grafana** — http://localhost:3001

Tear it down with `make demo-down`.

Open the portal's **Tenant settings** to see the organization defaults applied to every new
agent you register — the org id, the environment, and the default data-class and risk-tier:

![PaloNexus tenant settings form showing the organization ID, a sandbox environment, and default data-class (internal) and risk-tier (medium) selectors applied to new agent registrations, beside a summary of current values](/docs/screenshots/tenant-setup.png)

*Organization defaults for the tenant: org id, environment, and the data-class and risk-tier
applied to new agents. These feed the `dataClass` and risk-tier the registry records — see the
[Registry schema](/docs/reference/http-api/) and [Glossary](/docs/getting-started/glossary/).*

### Decision engine only (no cluster)

```bash
make test            # policy matrix + audit hash-chain unit tests
make smoke           # boot the binary, exercise allow(200)/deny(403) over ext_authz
make render          # render the full Kustomize manifest set (no apply)
```

## See the hero flow

With the platform up, run the narrated walkthrough (deny → human-approve → allow → revoke,
model allowlist, audit verify):

```bash
scripts/demo.sh
```

For the **network-layer egress** + human egress-approval demo (3 beats), and the fully
autonomous multi-agent flow, see [Delegations & approvals](/docs/develop/delegations-and-approvals/)
and [the autonomous flow](/docs/develop/autonomous-flow/).

## Next

- [Deploy your own agent](/docs/develop/deploy-an-agent/)
- [Self-host on your cluster](/docs/operations/self-hosting/)
