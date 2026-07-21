---
title: Secrets
description: How PaloNexus handles every secret — the demo seeder's Logto M2M credentials (optional, reference demo), the agent-idp issuer key, agent workload tokens, the model-broker provider key, and SDK API keys — with the never-in-image rule and External Secrets / sealed-secrets patterns.
sidebar:
  order: 8
---

PaloNexus is **same-image-everywhere**: no secret is ever baked into a container image, and none
are in the rendered Kustomize set. This page catalogs every secret the platform handles, where it
lives, and how to deliver it safely.

:::danger[The never-in-image rule]
No provider key, issuer key, M2M secret, or API key belongs in a Docker image, a Git-tracked
manifest, or an agent pod. Images are public-by-assumption; secrets arrive at runtime as mounted
Kubernetes `Secret`s, ideally synced from an external manager.
:::

## The secret catalog

| Secret | Where it lives | Used by | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` (`model-broker-secrets`) | `palonexus` ns | model-broker only | The real provider key — **the only place it exists**. No agent pod ever holds it; agents call the broker, the broker calls the provider. |
| Issuer key `ISSUER_PRIVATE_KEY_B64` | `agent-idp` ns | agent-idp | The `did:web` issuer Ed25519 private key. Signs Membership/Delegation VCs **and** STS tokens. **Must be stable across restarts** or every previously-issued VC fails to verify. Unset → agent-idp generates an ephemeral dev key and warns. |
| Logto M2M `LOGTO_M2M_APP_ID` / `_SECRET` | seeder env / `seed-logto` | `seed-logto`, portal seed surface | **Reference demo (Logto) — optional.** Machine-to-machine credentials for the Logto Management API, used **only** by the optional demo seeder; PaloNexus itself does not require Logto. Scope to the Management API resource only. Any OIDC/SCIM workforce IdP integrates via the standard patterns — see [IdP Support Model](/docs/concepts/enterprise-iam/#idp-support-model). |
| Agent workload tokens (`PALONEXUS_AGENT_TOKEN`) | per-agent | the agent + SDK | The agent's own bearer for live egress decisions. Short-lived; prefer the agent STS / SPIFFE over a long-lived static token. |
| Agent identity material (`did:key` priv + Membership VC) | per-pod `emptyDir` | agent + egress-sidecar | Written by the agent at bootstrap, read by the sidecar. Never leaves the pod; rotated by re-provisioning. |
| SDK API keys (`PALONEXUS_API_KEY`, `pn_live_…`/`pn_test_…`) | developer / CI | the SDK facade | Scope and rotate per environment; `pn_test_…` for sandbox, `pn_live_…` for prod. |
| Registry / store DSNs (`REGISTRY_DB_URL`, `IDP_DB_URL`) | control-plane / agent-idp | persistence layer | Contain DB passwords. With the `postgres` component, CloudNativePG generates the `*-app` secret and the component wires the DSN in — you never write the password by hand. |
| `portal-ts-auth` (`TS_AUTHKEY`) | `palonexus` ns | portal | Optional Tailscale auth key for tailnet ingress. Deploy succeeds without it (use port-forward). |

## Cluster secret / env fail-closed matrix

The catalog above is the *what*; this matrix is the **operational** view used by
your cluster rollout — every cluster Secret/env, its namespace, the consumer, what it
unlocks, and the **fail-closed default** when it's absent. Grounded against the
live `palonexus-doks` reference rollout (`ops-portal-deploy-note.md`). The guiding rule:
absence never crash-loops the platform — it degrades to the *safe* (closed) state.

| Secret / env | Namespace · component | Consumed by | Enables | Fail-closed default if absent |
|---|---|---|---|---|
| `model-broker-secrets` → `OPENAI_API_KEY` | `palonexus` | model-broker | a real **allowed** model call returns 200 | broker won't serve model calls; deploy still succeeds |
| `agent-idp-secrets` → `ISSUER_PRIVATE_KEY_B64` | `agent-idp` | agent-idp | stable VC/STS signing across restarts | ephemeral dev key + warn; restart breaks prior VCs |
| `agent-idp-keys` → `IDP_KEY_HASH_SALT` | `agent-idp` | agent-idp `/v1/keys` | salted hashing of SDK API keys at rest | key store unusable / unsalted; mint+verify fails closed |
| `simulate-operator` → `SIMULATE_OPERATOR_TOKEN` | `palonexus` (control-plane **and** portal BFF, same value) | control-plane dry-run gate + portal `/simulate` | the `/authz` **dry-run** ("Live decision" simulator); per-request `X-Palonexus-Simulate-Operator` must match | **empty = dry-run disabled entirely** |
| `logto-m2m` → 5× `LOGTO_*` ᴰ | `palonexus` via `components/portal-seed-logto` (`optional: true`) | portal `/settings/logto` + `/settings/seed` | seed-from-UI against a live tenant; form becomes read-only / Ops-managed | falls back to `0600` file / offline mode; never crash-loops |
| `SEED_LOGTO_DIR` = `/opt/seed-logto` ᴰ | portal image **and** agent-idp | portal seed spawn + agent-idp `authority_preview` | locate `seed_logto.py` / `nsr_seeder` + Northstar manifests | agent-idp `/v1/authority/preview` → **503 `authority_engine_unavailable`** |
| `SEED_LOGTO_PYTHON` = `/opt/seedvenv/bin/python3` ᴰ | portal image | portal seed spawn | the venv interpreter for `child_process.spawn` | spawn falls back to `python3` on PATH (`ENOENT` on a plain `node:*` image) |
| `ALLOW_LOGTO_SEED` = `true` ᴰ | portal (`palonexus`) | portal seed route | the apply/reseed/cleanup mutations | seed mutations disabled (plan/preview only) |
| `agent-db` → `uri` | `apps` (per-agent, `optional: true`) | agent pods | durable LangGraph checkpointer (HITL survives restart) | `MemorySaver` (in-process HITL only) |

ᴰ **Reference demo (Logto) — optional.** Rows marked ᴰ (`logto-m2m`,
`SEED_LOGTO_DIR`, `SEED_LOGTO_PYTHON`, `ALLOW_LOGTO_SEED`) are **demo-seed** secrets
for the **optional** Logto reference seed — they load the Northstar **demo** identity
model and are not required for PaloNexus to run. A "bring-your-own IdP" deployment
connects its own OIDC/SCIM workforce IdP instead — see
[IdP Support Model](/docs/concepts/enterprise-iam/#idp-support-model).

:::note[Issuer Secret name]
The live cluster's issuer key is the Secret **`agent-idp-secrets`** (key
`ISSUER_PRIVATE_KEY_B64`), matching `base/agent-idp/secret.example.yaml`. Earlier
docs that named `agent-idp-issuer` describe the same role — the deployed Secret is
`agent-idp-secrets`. Never rotate it as part of a code upgrade (it would
invalidate still-valid VCs).
:::

## Delivering secrets out-of-band

The base deploy succeeds **without** these — the broker just won't serve model calls and
agent-idp uses an ephemeral key. Apply the real ones separately:

```bash
cp deploy/kustomize/base/model-broker/secret.example.yaml \
   deploy/kustomize/base/model-broker/secret.yaml          # edit OPENAI_API_KEY (gitignored)
kubectl apply -f deploy/kustomize/base/model-broker/secret.yaml

# Stable issuer key (generate once, store in your secret manager):
kubectl -n agent-idp create secret generic agent-idp-issuer \
  --from-literal=ISSUER_PRIVATE_KEY_B64="$(your-keygen)"
```

## Recommended: External Secrets or sealed-secrets

Hand-applied `Secret`s are fine for a demo but don't belong in a real cluster. Use one of:

- **External Secrets Operator** — keep the source of truth in Vault / AWS Secrets Manager / DO
  Secrets and sync into Kubernetes `Secret`s. The cluster never stores the canonical value.

  ```yaml
  apiVersion: external-secrets.io/v1beta1
  kind: ExternalSecret
  metadata: { name: model-broker-secrets, namespace: palonexus }
  spec:
    secretStoreRef: { name: vault-backend, kind: ClusterSecretStore }
    target: { name: model-broker-secrets }
    data:
      - secretKey: OPENAI_API_KEY
        remoteRef: { key: palonexus/model-broker, property: openai_api_key }
  ```

- **Sealed-secrets** — commit an *encrypted* `SealedSecret` to Git; only the in-cluster
  controller can decrypt it. Good when GitOps is the source of truth.

  ```bash
  kubeseal --format yaml < secret.yaml > sealed-secret.yaml   # safe to commit
  ```

Either way the rendered manifest set stays secret-free, and rotation is a manager-side operation.

## Rotation

- **Issuer key** is the sensitive one: rotating it invalidates every VC signed by the old key.
  Rotate by publishing the new public key at the `did:web` document, then cutting over — agents
  re-provision to get VCs under the new key. Plan this as a coordinated upgrade.
- **Provider key / M2M / API keys** rotate independently with no platform-wide impact — update
  the secret, restart the consumer (broker / seeder), or roll a new SDK key.
- **Agent tokens** should be short-lived via the STS so rotation is automatic.

## Related

- [Self-hosting — secrets to provide out-of-band](/docs/operations/self-hosting/#secrets-to-provide-out-of-band).
- [Production hardening](/docs/operations/hardening/) · [Environment variables](/docs/reference/env-vars/).
- [Agent identity & credentials — issuer key](/docs/concepts/identity-and-credentials/).
