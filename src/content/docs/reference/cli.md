---
title: CLI reference
description: The command-line surfaces around PaloNexus — the seed-logto reference demo seeder (subcommands, global flags, env, sandbox safety), the platform make targets, the kubectl/kustomize apply path, and the SDK as the programmatic entry point.
sidebar:
  order: 50
---

PaloNexus is **IdP-neutral** and configured almost entirely by environment variables, so it
has a deliberately small CLI surface. There is no single `palonexus` binary. Instead there are
four distinct command-line surfaces:

| Surface | What it is | When you reach for it |
|---|---|---|
| `seed-logto` | the **reference DEMO seeder** — loads the Northstar demo org into a Logto reference tenant | only to stand up the demo identity model |
| `make` (platform `Makefile`) | build/test/render/deploy the control-plane | building images and rendering/applying manifests |
| `kubectl` / kustomize | apply the control layer to a cluster | deploying to DOKS or self-hosting |
| Python SDK (`palonexus`) | the **programmatic** entry point — no standalone CLI binary | embedding governance in your own code/tests |

## `seed-logto` — the reference demo seeder

:::note[Reference demo (Logto) — optional]
`seed-logto` is the **demo seeder**, not part of the product runtime. PaloNexus itself is
**IdP-neutral** and needs no Logto: the seeder only loads the **Northstar demo org**
(workforce identity) into a **Logto reference tenant** so the allow/deny/needs-approval
verdicts have realistic personas and scopes to decide against. A bring-your-own-IdP
deployment skips it entirely and connects its own OIDC/SCIM workforce IdP (Okta, Microsoft
Entra ID, Auth0, Ping, Google Workspace, Amazon Cognito, Keycloak, Logto, …) — see the
[IdP Support Model](/docs/concepts/enterprise-iam/#idp-support-model).
:::

Source: `platform/seed-logto/src/nsr_seeder/cli.py`. The package ships a thin wrapper
(`seed_logto.py`) so the examples run without installing the package:

```bash
cd platform/seed-logto
python3 seed_logto.py <subcommand>
```

### Subcommands

| Subcommand | What it does | Exit codes |
|---|---|---|
| `check` | run the **sandbox safety preflight** only and print the report — no writes | `0` pass · `2` fail |
| `generate` | generate `users.json` + `synthetic_hris.json` from the manifest (no tenant) | `0` |
| `plan` | **dry-run apply** — preview the upserts without writing (forces dry-run) | `0` |
| `apply` | create/reconcile resources in the tenant | `0` ok · `1` had errors · `3` safety failed |
| `validate` | validate the dataset (and the live tenant, unless `--offline`) and write a JSON + Markdown report under `--reports` | `0` passed · `1` failed |
| `cleanup` | delete seed-owned resources (`--mode soft-reset` \| `hard-reset`) | `0` ok · `3` safety failed · `4` aborted (e.g. over `LOGTO_MAX_DELETE`) |
| `reseed` | `hard-reset` cleanup **then** apply | propagates the above |

`apply` and `cleanup` both run the sandbox safety checks first and refuse to proceed
(exit `3`) if the target tenant does not clearly look like sandbox/dev/test.

`cleanup` takes its own `--mode` (default `hard-reset`) and its own `--dry-run` /
`--no-dry-run`:

```bash
python3 seed_logto.py cleanup --mode soft-reset        # remove memberships/roles, keep users
python3 seed_logto.py cleanup --mode hard-reset        # delete all seed-owned resources
python3 seed_logto.py cleanup --mode hard-reset --dry-run   # preview the deletions
```

### Global flags

These are options on the **top-level parser**, so — as with any `argparse` subcommand CLI —
**global flags must precede the subcommand**:

```bash
python3 seed_logto.py --no-dry-run apply        # correct: global flag before subcommand
python3 seed_logto.py --offline plan            # dry-run against the in-memory FakeLogto tenant
```

| Flag | Default | Meaning |
|---|---|---|
| `--manifest` | `seed/northstar` | path to the seed manifest directory |
| `--state` | `run_state.json` | run-state file (resource-id map). Defaults are isolated per seed namespace (`run_state.<namespace>.json`) and per offline run (`run_state.offline.json`) unless you pass an explicit path |
| `--reports` | `reports` | output directory for `validate` reports |
| `--env-file` | *(auto)* | dotenv file to load; if unset, falls back to `.env.local` then `.env` |
| `--offline` | off | use the in-memory `FakeLogtoClient` — no network, no live tenant |
| `--dry-run` / `--no-dry-run` | *(env `LOGTO_DRY_RUN`, default true)* | preview vs. actually write. `--no-dry-run` is what turns `apply` into a real write |
| `--best-effort` | off | continue past individual user-create failures (still aborts on org/role/membership/org-role failures) |

### Key environment

The seeder is configured entirely by `LOGTO_*` (an `.env.example` ships in
`platform/seed-logto/`). The full table — with aliases, examples, and the secret M2M
credentials — is the **reference demo seeder env table** in
[Environment variables](/docs/reference/env-vars/#reference-demo-seeder--logto-logto_).
The load-bearing ones:

| Variable | Meaning |
|---|---|
| `LOGTO_BASE_URL` | Logto reference-tenant base URL (alias `LOGTO_ENDPOINT`) |
| `LOGTO_TENANT_ID` | the Logto tenant id |
| `LOGTO_M2M_APP_ID` / `LOGTO_M2M_APP_SECRET` | Management-API M2M credentials — **secrets** |
| `LOGTO_MGMT_API_RESOURCE` | the Management API resource/audience |
| `ALLOW_LOGTO_SEED` | master enable — must be `true` for any write |
| `LOGTO_ENV` | `sandbox` \| `prod` — must be `sandbox`/`dev`/`test`/`staging` to pass safety |
| `LOGTO_SEED_NAMESPACE` | namespace tag for all seeded objects (default `palonexus-demo`) |
| `LOGTO_DRY_RUN` | preview without writing unless a `--no-dry-run`/`--dry-run` flag overrides |
| `LOGTO_MAX_DELETE` | safety cap on deletions per run (default `400`) |

### Sandbox safety checks

Every mutating command (`apply`, `cleanup`, `reseed`) calls `assert_safe()` first. `check`
runs the same evaluation and reports it. The hard-stops (`nsr_seeder/safety.py`):

| Check | Passes when |
|---|---|
| `base_url_present` | `LOGTO_BASE_URL` is set |
| `host_in_allowlist` | the target host matches `LOGTO_ALLOWED_HOST_SUFFIX` (default `.logto.app,localhost,127.0.0.1`) |
| `tenant_is_sandbox` | the host is local, **or** the host+tenant identity contains one of `sandbox`, `dev`, `test`, `staging`, `demo`, `local` |
| `no_production_marker` | the tenant identity contains neither `prod` nor `production` |
| `logto_env_is_sandbox` | `LOGTO_ENV` is `sandbox` / `dev` / `test` / `staging` |
| `allow_seed_flag` | `ALLOW_LOGTO_SEED` is true |
| `seed_namespace_present` | `LOGTO_SEED_NAMESPACE` is set |
| `email_suffixes_non_routable` | every `LOGTO_ALLOWED_EMAIL_SUFFIX` entry is a non-routable suffix (e.g. `.test`, `.example`, `.invalid`, `.localhost`) |

If any check fails the run aborts with exit `3` and prints the failing checks — the seeder
**refuses to operate on a tenant that does not clearly look like sandbox/dev/test**.

### Typical flow

```bash
cd platform/seed-logto
python3 seed_logto.py check                 # safety preflight (exit 0 = OK)
python3 seed_logto.py plan                   # preview the upserts
python3 seed_logto.py --no-dry-run apply     # apply against the connected tenant
python3 seed_logto.py validate               # write the validation report
```

Add `--offline` to any subcommand to dry-run against the in-memory `FakeLogtoClient` (no live
tenant) — useful to prove the path before real creds. This is the same sequence the
[DOKS runbook Step 4](/docs/operations/doks-runbook/#step-4--seed-the-demo-identity-model)
documents (Option B — CLI), and the same actions the `/settings/seed` portal console drives.

## Platform build & deploy — `make`

The control-plane is built and deployed from the platform `Makefile` (`platform/Makefile`).
`IMAGE` and `OVERLAY` are overridable variables (defaults `palonexus/control-plane:dev` and
`deploy/kustomize/overlays/dev`).

| Target | What it does |
|---|---|
| `make test` | `go test ./...` in `control-plane/` — policy matrix + audit hash-chain unit tests |
| `make smoke` | build the binary, boot it, and exercise the `ext_authz` decision flow (allow 200 / deny 403 over `:9191/authz`) |
| `make image` | `docker build` the container image (`$(IMAGE)`) |
| `make render` | kustomize-render the full control layer to stdout (no apply) |
| `make deploy` | `kubectl apply -k $(OVERLAY)` — apply the control layer to the current kube-context |

```bash
make test
make image IMAGE=ghcr.io/you/control-plane:dev
make render OVERLAY=deploy/kustomize/overlays/selfhost
make deploy
```

:::caution[`make deploy` has prerequisites]
`make deploy` applies the `SecurityPolicy.extAuth` enforcement point, which depends on the
**Gateway API CRDs + Envoy Gateway** already being installed. Install those first (see the
platform README / runbook) or the apply will fail on missing CRDs.
:::

## `kubectl` / kustomize

The whole control layer is one `kubectl apply -k` against a kustomize overlay — the same
manifests `make render` / `make deploy` drive. Apply an overlay directly:

```bash
kubectl apply -k platform/deploy/kustomize/overlays/<overlay> --load-restrictor LoadRestrictionsNone
```

Rather than duplicate the cluster-specific steps (CRDs, Envoy Gateway, secrets, ingress)
here, follow the runbooks:

- [DOKS runbook](/docs/operations/doks-runbook/) — the end-to-end managed-Kubernetes path on DigitalOcean.
- [Self-hosting](/docs/operations/self-hosting/) — the `selfhost` overlay and `install-selfhost` flow on any cluster.

## The SDK — programmatic entry point

The Python SDK (`palonexus` package) is the **programmatic** entry, not a CLI: there is **no
standalone `palonexus` CLI binary**. You drive it from code or a REPL:

```python
from palonexus import PaloNexus

pn = PaloNexus.offline()     # in-memory, no cluster, no network — ideal for tests/dev
pn = PaloNexus.from_env()    # reads PALONEXUS_* (or returns offline() when PALONEXUS_OFFLINE is truthy)
```

`from_env()` reads the `PALONEXUS_*` client variables documented in
[Environment variables — SDK](/docs/reference/env-vars/#sdk-palonexus-package--palonexusfrom_env).
See the [Quickstart](/docs/getting-started/quickstart/) to get started.

## See also

- [Environment variables](/docs/reference/env-vars/) — the full env reference, including the reference demo seeder (`LOGTO_*`) table.
- [agent-idp API (interactive)](/docs/reference/api/agent-idp/) — the try-it API reference generated from the OpenAPI 3.1 spec.
- [DOKS runbook — Step 4](/docs/operations/doks-runbook/#step-4--seed-the-demo-identity-model) · [Self-hosting](/docs/operations/self-hosting/) — where these commands are used end to end.
- [IdP Support Model](/docs/concepts/enterprise-iam/#idp-support-model) — why Logto is only the reference demo, and how any OIDC/SCIM IdP integrates.
- [Quickstart](/docs/getting-started/quickstart/) — the programmatic entry point.
