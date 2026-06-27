---
title: Upgrades & rollback
description: How to upgrade PaloNexus safely — the control-plane ↔ agent-idp ↔ SDK compatibility matrix, the same-image rolling-upgrade procedure, schema-change handling, and a tested rollback.
sidebar:
  order: 11
---

PaloNexus upgrades are low-drama by design: **same image everywhere**, config-by-env, idempotent
schemas, and a fail-closed decision path mean a rolling upgrade rarely needs a maintenance window.
This page covers the compatibility contract, the procedure, and rollback.

## Compatibility matrix

The three moving versions are the **control-plane**, **agent-idp**, and the **SDK**. They speak
versioned HTTP contracts; keep them within one minor of each other and upgrade in the order below.

| Pair | Contract | Rule |
|---|---|---|
| control-plane ↔ agent-idp | `/v1/agents/verify-presentation`, `/v1/delegations/check`, `/v1/revoke` | Upgrade **agent-idp first** (it's the dependency the control plane calls). New idp must keep serving the old endpoints. |
| control-plane ↔ SDK | `/authz`, `/v1/registry/*`, `/v1/audit/*` | SDK tolerates older control-planes for read paths; upgrade the **control-plane before** relying on a new SDK feature. |
| agent-idp ↔ SDK | `/v1/governance/agents`, `/v1/delegations/*`, `/v1/revocation/cascade` | Upgrade **agent-idp before** the SDK uses a new governance/delegation field. |
| agent-idp ↔ issuer key | VC signatures | The issuer key is **independent of version** — never rotate it as part of a code upgrade (see [Secrets](/docs/operations/secrets/)). |

General rule: **dependencies first** — agent-idp → control-plane → SDK/agents. Each new version
keeps serving the previous wire contract for one minor, so a brief version skew during the roll is
safe (and fail-closed if it isn't).

### Image / version compatibility (live tags)

The live `palonexus-doks` cluster runs the hand-rolled `:h<N>` tag scheme. The
governance spine images (`control-plane`, `agent-idp`, `portal`) move together;
the agent runtime (`remediation` and the shared `palonexus_agent` package) versions
independently. This is the **known-good** set as shipped — upgrade *into* it, and
roll back *to* the prior tag in the same row.

| Image | Current tag | Rollback tag | Moves with | Notes |
|---|---|---|---|---|
| `control-plane` | `:h13` | `:h11` → `:h4` | agent-idp, portal | the decision engine; upgrade **after** agent-idp |
| `agent-idp` | `:h13` | `:h11` → `:h8` | control-plane | the dependency — upgrade **first**; keeps the old endpoints |
| `portal` | `:h13` | `:h11` → `:h10` | control-plane | operator console + BFF; carries the optional demo-seed tooling (`SEED_LOGTO_DIR`/`SEED_LOGTO_PYTHON`) since `:h11` |
| `remediation` (agent runtime) | `:h12` | `:h6` | — (independent) | pure-Python agent; carries the async-gate fix in `palonexus_agent`. Other demo agents track the same package |
| `model-broker` | `:dev` | — | — | unchanged across the recent waves (no code delta) |

The published `ghcr.io/palonexus/*:dev` manifests are the canonical shape; the live
cluster runs the equivalent `ghcr.io/rogerchucker/*:h<N>` variant. Pin whichever
registry your cluster pulls from — the wire contract is identical.

## Before you upgrade

1. **Back up** the audit chain + registry + agent-idp store, and verify the chain
   ([Backups](/docs/operations/backups/)). Take the backup *before* touching anything.
2. **Read the [changelog / migration notes](/docs/reference/)** for the target version — schema
   or contract changes are called out there.
3. **Render-check** the new images against your overlay:

   ```bash
   kubectl kustomize --load-restrictor LoadRestrictionsNone deploy/kustomize/overlays/selfhost
   ```

## Rolling upgrade

Because all config is env and the schema is idempotent, an upgrade is a normal Kubernetes rollout:

```bash
# 1) agent-idp first (the dependency)
kubectl -n agent-idp set image deploy/agent-idp agent-idp=ghcr.io/palonexus/agent-idp:<new>
kubectl -n agent-idp rollout status deploy/agent-idp

# 2) control-plane next
kubectl -n palonexus set image deploy/control-plane control-plane=ghcr.io/palonexus/control-plane:<new>
kubectl -n palonexus rollout status deploy/control-plane

# 3) agents / SDK consumers last
kubectl -n palonexus rollout restart deploy -l palonexus.io/agent=true
```

The decision path is **fail-closed**, so if a new control-plane can't reach an old agent-idp it
**denies** rather than mis-allowing — a failed roll degrades to "deny", never to "open".

### Schema changes

New tables are created idempotently on boot (`CREATE TABLE IF NOT EXISTS` / checkpointer
`setup()`), so additive schema changes need **no manual migration** — the new pod creates what it
needs and old pods ignore it. For a rare **non-additive** change, the changelog will say so;
follow its note and treat it as a coordinated (not rolling) upgrade.

## Rollback

Roll back in the **reverse** order (consumers → control-plane → agent-idp), since the newer
agent-idp keeps serving the old contract while consumers revert:

```bash
kubectl -n palonexus  rollout undo deploy/control-plane
kubectl -n agent-idp  rollout undo deploy/agent-idp
kubectl -n palonexus  rollout restart deploy -l palonexus.io/agent=true
```

Then **re-verify**:

```bash
make smoke                                   # allow(200) / deny(403) over ext_authz
curl -s localhost:8181/v1/audit/verify       # chain still intact
```

Because schema changes are additive, a code rollback does not require a schema rollback — the
extra tables/columns are simply unused by the older image. (For a non-additive change, restore
from the pre-upgrade backup instead.)

## Verify after every upgrade or rollback

| Check | Command |
|---|---|
| allow/deny still enforced | `make smoke` |
| audit chain intact | `curl -s localhost:8181/v1/audit/verify` |
| an agent is provisioned | portal **Agents** tab / `GET /v1/agents/<name>` |
| a revoked credential still denies | re-run the [revocation race](/docs/develop/recipes/revocation-race/) check |
| deny rate normal | `palonexus_authz_decisions_total{decision="deny"}` on the dashboard |

## Related

- [Backups & restore](/docs/operations/backups/) — take one before upgrading.
- [Migrations](/docs/operations/migrations/) — the idempotent schema behavior.
- [Production hardening](/docs/operations/hardening/) — the posture to upgrade *into*.
