---
title: Releases & Changelog
description: How PaloNexus is versioned — the 0.x SDK packages under semver and the platform images on the :h<N> tag scheme — the current compatible set, release notes for the current build, and how upgrades and rollbacks work.
sidebar:
  order: 90
---

This is the docs-site changelog: the versioning policy, the current compatible component set, and
**dated, themed release notes** grounded in the real rollout history. It deliberately does **not**
duplicate the full [upgrade compatibility matrix](/docs/operations/upgrades/) — it points to it.

## Versioning policy

PaloNexus has two version surfaces that move on different schedules:

- **SDK packages** — `palonexus`, `agentdid`, and `idp-sdk` follow **semver**. They are all at
  **0.x** (pre-1.0), so per semver the **minor** version may carry breaking changes. Pin ranges
  accordingly (e.g. `palonexus>=0.1,<0.2`) rather than tracking latest.
- **Platform images** — `control-plane`, `agent-idp`, `portal`, `remediation`, and `model-broker`
  are tagged with the hand-rolled **`:h<N>`** scheme on the live cluster. The governance-spine
  images (`control-plane`, `agent-idp`, `portal`) **move together**; the agent runtime
  (`remediation`) and `model-broker` version independently.

**How to read versions.** An SDK pin like `palonexus 0.1.0` is a Python/TS package version; an image
tag like `control-plane:h13` is a deployment artifact. They are versioned separately and connected
only by the wire contracts (`/authz`, `/v1/registry/*`, `/v1/audit/*`, the agent-idp endpoints),
which each new version keeps serving for one minor of skew.

:::caution[Pre-1.0 breaking-change policy]
While the SDKs are **0.x**, a minor release (`0.1 → 0.2`) may introduce breaking changes — that is
standard semver for pre-1.0. Pin to a compatible range and read these release notes before bumping.
The platform images keep serving the **previous** wire contract for one minor, so a brief version
skew during a rolling upgrade is safe (and fail-closed if it isn't).
:::

## Compatibility

The full, authoritative matrix — including rollback tags and upgrade order — lives in
[Upgrades & rollback](/docs/operations/upgrades/#image--version-compatibility-live-tags). The
**current compatible set** is:

| Component | Version | Notes |
|---|---|---|
| `control-plane` | `:h13` | decision engine; upgrade **after** agent-idp |
| `agent-idp` | `:h13` | the dependency — upgrade **first** |
| `portal` | `:h13` | operator console + BFF |
| `remediation` (agent runtime) | `:h12` | versions independently of the spine |
| `model-broker` | `:dev` | unchanged across recent waves |
| `palonexus` (SDK) | `0.1.0` | with `agentdid 0.1.0` and `idp-sdk 0.1.0` |

The governance-spine images (`control-plane` / `agent-idp` / `portal`) are kept on the same `:h<N>`;
upgrade in dependency order (agent-idp → control-plane → agents/SDK).

## Release notes

These entries are **dated, themed roll-ups** — not a per-tagged-release feed. They are deliberately
high-level and factual; the detailed, per-workstream status (issue IDs, on-cluster validation
evidence, follow-ups) lives in the repo's `docs/requirements/` (`initiative-status-final.md`,
`ops-portal-deploy-note.md`, `qa-doks-validation-report.md`). Version numbers below are only the ones
that are real: the `0.1.0` SDK packages and the live `:h<N>` image tags.

### Current build — 2026-06-27

**Label:** governance-spine `:h13`-class · agent runtime `remediation :h12` · `model-broker :dev` ·
SDK `palonexus 0.1.0`. This is the consolidated set the rest of these docs describe.

- **Portal `:h11 → :h13`.** The portal image advanced past the batched `:h11` rollout — `:h13` is the
  clean rebuild that drops a baked seed credential file from the image (the k8s `logto-m2m` Secret is
  authoritative) and carries the live-tenant Logto seed leg validated against a real tenant. The
  governance-spine images (`control-plane` / `agent-idp` / `portal`) are kept on the same `:h<N>`
  line, so the current compatible spine is **`:h13`-class**.
- **Agent runtime** stays on the independently-versioned `remediation :h12`-class line (carries the
  async model-gate, issuer-key, and NetworkPolicy fixes from the autonomous-hero-flow wave).
- **Docs program.** Added the [Security &amp; Trust](/docs/concepts/security-and-trust/) overview, this
  changelog, the interactive **agent-idp API reference**, and a pass of diagrams, screenshots, and
  comparison tables. Repositioned the docs as **IdP-neutral** — Logto is an optional reference demo
  seed, not a requirement.
- **TypeScript SDK** `@palonexus/sdk` is **offline-validated** alongside the Python facade; live-sandbox
  validation and a Deep Agents TS adapter remain future work.

:::note[Where the detail lives]
A clean portal rebuild and an M2M-secret rotation are tracked as follow-ups in the repo's
`docs/requirements/` rather than re-stated here. This page does not duplicate per-issue status.
:::

### Platform rollout — 2026-06-26 — batched DOKS `:h11` + agent runtime `:h12`

The first full batched rollout onto the live `palonexus-doks` cluster, moving the spine images
together and the agent runtime independently:

| Component | This wave | Prior (rollback) |
|---|---|---|
| `control-plane` | `:h4 → :h11` | `:h4` |
| `agent-idp` | `:h8 → :h11` | `:h8` |
| `portal` | `:h10 → :h11` | `:h10` |
| `remediation` (agent runtime) | `:h6 → :h12` | `:h6` |
| `model-broker` | `:dev` (unchanged) | — |

What shipped in this wave:

- **control-plane `/authz` dry-run** — an operator-gated, **meta-audited**, side-effect-free decision
  path (verdict read from the response body), so a reviewer can preview an allow/deny/needs-approval
  without making it happen.
- **agent-idp `POST /v1/authority/preview`** (delegation-eligibility preview) and the **API-keys
  endpoint** (salted-SHA-256 backing store; revoked keys deny at `/authz`).
- **Operator portal surfaces** — onboarding, the **policy simulator** ("Live decision" against the
  `/authz` dry-run), **API keys**, **tenant / Logto settings**, the hash-chained **audit explorer**
  with chain-verify, and the **playground**.
- **Egress enforcement** stayed in force — forward proxy + NetworkPolicy + admission webhook, with
  `AGENT_IDENTITY_MODE=vc` (verified Membership VP mandatory) and sub-second revocation.
- On-cluster smoke confirmed allow `200` / deny `403`, the dry-run `needs_approval` verdict, the
  governed deny → approve → succeed hero flow, and `audit/verify ok:true`.

### SDK, adapters &amp; deployment — consolidation wave

The platform-SDK and deployment foundation the rollout above sits on (high-level; not separately
image-tagged):

- **Consolidated `palonexus` SDK `0.1.0`** — a single Python facade over registry, `/authz`,
  delegations, and audit-verify, with an offline `FakeControlPlane` and pytest plugin for
  network-free tests — layered over **`agentdid 0.1.0`** (DID/VC crypto) and **`idp-sdk 0.1.0`**
  (vendored agent-idp client).
- **Framework adapters** for **LangChain**, **LangGraph**, and **Deep Agents** (plus a
  `palonexus-governance` skill), so existing agents are governed without a rewrite.
- **Deployment paths** — a **Docker Compose** stack (with 200/403/401 smoke) and a **DOKS** path
  (Kustomize overlays + components), plus a **backup / restore drill** that restores the audit chain
  and proves `verify_chain()` detects tampering while production stays untouched.

See the [Feature matrix](/docs/concepts/feature-matrix/) for the per-capability Shipped / Partial /
Planned breakdown.

## How upgrades work

Upgrades are a normal rolling Kubernetes rollout — **same image everywhere**, config-by-env,
idempotent schemas, and a fail-closed decision path. Upgrade in dependency order
(agent-idp → control-plane → agents/SDK) and **roll back by the prior tag** in the same matrix row.
The full procedure, schema-change handling, and post-upgrade verification are in
[Upgrades & rollback](/docs/operations/upgrades/).

:::note[Themed roll-ups, not a per-release feed]
The entries above are **dated, themed roll-ups**, not an automated feed keyed to each individual
`:h<N>` image tag. A finer-grained, per-tagged-release changelog feed is **future work** (flagged in
the platform `BACKLOG.md`); until then the repo's `docs/requirements/` holds the per-issue detail.
:::

## See also

- [Upgrades & rollback](/docs/operations/upgrades/) — the authoritative compatibility matrix and procedure.
- [Feature matrix](/docs/concepts/feature-matrix/) — capabilities with Shipped/Partial/Planned status.
- [Security & Trust](/docs/concepts/security-and-trust/) — the enterprise security overview.
- [SDK reference](/docs/sdk/reference/) — the generated `palonexus` API surface.
