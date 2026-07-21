---
title: Terraform / DOKS
description: Provision a budget DigitalOcean Kubernetes cluster, container registry, and VPC with Terraform — variables, up/down, registry login and image push, the ~$77/mo breakdown, and the ghcr.io alternative.
sidebar:
  order: 6
---

This is one **optional** provisioning example (DigitalOcean). PaloNexus runs on any Kubernetes or via Docker Compose — you do not need DigitalOcean.

`infra/terraform-doks/` brings a budget **DOKS** cluster up and down for the demo. It
provisions only the cloud substrate — VPC, cluster, registry — and wires the
registry pull-credentials into the cluster. The platform workloads themselves are
deployed *on top* via Kustomize (see [Self-hosting](/docs/operations/self-hosting/)).

> **GKE and EKS have their own equivalent modules** — `infra/terraform-gke/` and
> `infra/terraform-eks/`, same `make up`/`make down` shape described below. EKS
> uses public-only subnets (no NAT gateway) and the
> `terraform-aws-modules/eks/aws` community module rather than hand-rolled
> resources; both cost meaningfully more per month than DOKS since neither GKE
> Standard mode nor EKS has a free control plane the way DOKS does. This page
> covers DOKS specifically as the worked example; the platform repo's
> `docs/self-hosting.md` covers all three clouds side by side.

## What gets created

| Resource | Detail |
|---|---|
| `digitalocean_vpc` | private network for the cluster (free) |
| `digitalocean_kubernetes_cluster` | DOKS, one autoscaling default node pool; version is the latest stable patch via the `digitalocean_kubernetes_versions` data source; surge + auto-upgrade on, Sunday 08:00 UTC maintenance window |
| `digitalocean_container_registry` (DOCR) | one private registry holding all platform image repositories |
| `digitalocean_container_registry_docker_credentials` | read-only docker config secret attached to the cluster's default service accounts so pods pull private images without a hand-managed `imagePullSecret` |

> DOCR is only offered in a subset of regions (not `nyc1`). The config falls back
> to `nyc3` for the registry when the cluster region isn't a DOCR region.

## Prerequisites

- Terraform >= 1.5
- `doctl` (authenticated: `doctl auth init`)
- A DigitalOcean API token exported — the provider reads it automatically; **no
  token is stored in any file**:

```bash
export DIGITALOCEAN_TOKEN=dop_v1_xxxxxxxx
```

## Variables

Override via `terraform.tfvars` (copy `terraform.tfvars.example`) or `-var` flags.
Defaults target a tight ~$60–80/mo budget.

| Variable | Default | Notes |
|---|---|---|
| `name_prefix` | `palonexus` | prefix on all resource names; also the (globally-unique) DOCR name |
| `region` | `nyc1` | keep cluster/VPC/registry in one region |
| `kubernetes_version_prefix` | `""` | pin a minor (e.g. `"1.32."`) or empty → latest stable |
| `node_size` | `s-2vcpu-4gb` | ~$24/node/mo budget target |
| `node_count` | `3` | desired (autoscaling) or fixed count; fits ~20–25 pods |
| `enable_autoscale` | `true` | cluster autoscaler on the default pool |
| `node_min` / `node_max` | `2` / `4` | autoscaling bounds (4 × ~$24 ≈ $96/mo ceiling) |
| `registry_tier` | `basic` | `starter` is free but 1 repo/500 MB (too small); `basic` ≈ $5/mo, 5 GB |
| `vpc_ip_range` | `null` | null → DO auto-assigns a non-overlapping /20 |
| `tags` | `["palonexus","demo","managed-by:terraform"]` | billing/visibility tags |

## Up / down

```bash
cd infra/terraform-doks
cp terraform.tfvars.example terraform.tfvars   # edit region/sizes if desired

make up                       # init + plan + apply, then saves kubeconfig
                              # (AUTO_APPROVE=1 to skip the prompt)
make registry-login           # doctl registry login (Docker login to DOCR)

# ... build/push images + deploy (below) ...

make down                     # destroys cluster + registry + VPC
make down KEEP_REGISTRY=1     # keeps the DOCR + images between demos
```

Other targets: `make validate` (no cloud calls), `make fmt`, `make plan`,
`make kubeconfig` (re-merge creds into `~/.kube/config`), `make outputs`.

Write the kubeconfig to a standalone file instead of `~/.kube/config`:

```bash
terraform output -raw kubeconfig > kubeconfig.yaml   # gitignored
export KUBECONFIG=$PWD/kubeconfig.yaml
```

> **State** defaults to local (`terraform.tfstate`, gitignored — it holds the
> kubeconfig and registry creds). For a Spaces remote backend, uncomment the
> `backend "s3"` block in `versions.tf` and `terraform init -migrate-state`.

## Registry login + image push + deploy

After `make up` + `make registry-login`, deploy the whole platform against the
kubeconfig Terraform saved, in one command (builds + pushes images to DOCR,
applies the selfhost overlay, creates secrets, registers agents/tools/model):

```bash
cd ../..   # repo root
REGISTRY="registry.digitalocean.com/<your-docr>" OPENAI_API_KEY="sk-..." \
  make install-selfhost
```

`install-selfhost` works against **any** cluster (the current kube-context), not
just DOKS. See [Self-hosting](/docs/operations/self-hosting/) for the overlay and
component details.

> For the full cold-start path — cluster → Gateway/Envoy CRDs → `kubectl apply -k`
> → seed → deploy an authority-bound agent → verify allow/deny/needs-approval in ≤30
> minutes — follow the [DOKS runbook — zero to authority-bound agent](/docs/operations/doks-runbook/).

## Cost (~$77/mo with defaults)

| Resource | Size | Qty | $/mo |
|---|---|---|---|
| DOKS control plane | managed (free) | 1 | $0 |
| Worker node pool | `s-2vcpu-4gb` autoscale 2→4 | 3 | ~$72 |
| DOCR registry | `basic` (5 GB) | 1 | ~$5 |
| VPC | — | 1 | $0 |
| **Total** | | | **~$77/mo** |

Levers: drop to 2 nodes (~$53/mo, tight on memory with LGTM + postgres); avoid a
`type: LoadBalancer` Service (~$12/mo) — prefer port-forward/Tailscale for the
demo. PVCs (postgres, LGTM) are ~$0.10/GB/mo and are **not** removed by
`terraform destroy` — clean them via `kubectl`/`doctl`.

## The ghcr.io alternative (DOCR basic 5-repo cap)

DOCR `basic` is constrained — the practical cap is **~5 repositories / 10
images**, which the full platform (control-plane, agent-idp, model-broker, four
agents, portal, runbooks images, …) overruns. The alternative is to push the
images to **`ghcr.io`** instead and point the overlay there (the selfhost overlay
already defaults images to `ghcr.io/palonexus/*:dev`):

```bash
# tag/push to ghcr.io instead of DOCR; cross-build amd64 for DOKS nodes
docker buildx build --platform linux/amd64 -t ghcr.io/palonexus/control-plane:dev --push .
```

Then either keep the selfhost overlay's `ghcr.io/palonexus/*` image defaults or
`kustomize edit set image …` per image. You can run `make down KEEP_REGISTRY=1`
to keep DOCR for the images that do fit, or skip DOCR entirely with `ghcr.io`.
