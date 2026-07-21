---
title: Bring your own IdP (Logto / OIDC)
description: Wire your own enterprise IdP as the human sign-in issuer for a self-hosted PaloNexus — Logto is the first supported IdP; any standard OIDC/SCIM provider (Okta, Entra ID, Auth0, Keycloak) plugs in the same way. Agent egress identity (DID/VC) is independent of this.
sidebar:
  order: 4
---

PaloNexus governs **agent egress** with cryptographic agent identity (DID/VC) that does
**not** depend on your IdP — egress works out of the box. This page is for the *other*
identity seam: **human workforce sign-in** (the people who own agents, approve elevations,
and operate the portal). The self-host overlay ships **anonymous-passthrough** by default;
this runbook wires *your* IdP so the control plane verifies inbound human identity against
your issuer.

**Logto is the first supported IdP** — the worked example below. Okta, Entra ID, Auth0,
Keycloak, and any standard OIDC provider integrate through the **same** three env vars and
the same SCIM `/v1/directory` seam; only the issuer URLs differ. Others are near-term
roadmap for *shipped connectors*, not a limitation of the standards path.

:::note[Two identity planes, decoupled]
- **Agent egress identity** = DID/VC (agent-idp). No IdP required. Already on.
- **Human ingress identity** = OIDC against your IdP. This page. Optional but recommended
  for production so ownership/approval/audit carry a real workforce subject.
:::

## What you need from your IdP

Three public URLs + one audience. For Logto (tenant `YOUR-TENANT`):

| Value | Env var | Logto example |
|---|---|---|
| Issuer | `OIDC_ISSUER` | `https://YOUR-TENANT.logto.app/oidc` |
| JWKS | `OIDC_JWKS_URL` | `https://YOUR-TENANT.logto.app/oidc/jwks` |
| Audience | `OIDC_AUDIENCE` | `palonexus` (the API resource indicator you register) |

These are **not secrets** (public discovery URLs) — they live in a Kustomize component, not a
Secret.

## Step 1 — register PaloNexus in Logto (fresh tenant)

1. **Create an API resource** named e.g. `PaloNexus` with **API identifier** `palonexus`.
   This identifier is your `OIDC_AUDIENCE` — access tokens must carry it as `aud`.
2. **Create an application** for the human sign-in surface (the portal / your SSO front
   door). Note its issuer is the tenant's `/oidc` endpoint above.
3. Grab the **issuer** and **JWKS** URLs from the tenant's OIDC discovery
   (`https://YOUR-TENANT.logto.app/oidc/.well-known/openid-configuration`).

> Any OIDC IdP: register an app + an API/audience, then read `issuer` and `jwks_uri` from
> that provider's `/.well-known/openid-configuration`. Okta/Entra/Auth0/Keycloak all expose it.

## Step 2 — enable the `oidc` Kustomize component

The self-host overlay strips the built-in Dex OIDC vars (anonymous-passthrough). To point at
**your** issuer, enable the `oidc` component **and remove the strip patch** (they conflict —
the component sets the vars the strip patch removes):

In `deploy/kustomize/overlays/selfhost/kustomization.yaml`:

1. Under `components:`, uncomment `- ../../components/oidc`.
2. In `patches:`, **delete the three `op: remove … /env/0` lines** (the anonymous-passthrough
   patch). The component re-adds OIDC; leaving the strip would undo it.

Set your issuer values by editing `deploy/kustomize/components/oidc/kustomization.yaml`
(replace `YOUR-TENANT.logto.app` and the audience). Render to confirm:

```bash
make render-selfhost | grep -A1 OIDC_ISSUER     # shows YOUR issuer + jwks + audience
```

Apply (or `make install-selfhost`):

```bash
kubectl apply -k deploy/kustomize/overlays/selfhost --load-restrictor LoadRestrictionsNone
kubectl -n palonexus rollout status deploy/control-plane
```

The control plane now verifies inbound bearer JWTs against your IdP's JWKS, requiring
`iss == OIDC_ISSUER` and `OIDC_AUDIENCE ∈ aud`. A token from your IdP is accepted; anything
else is denied (fail-closed). Egress decisions are unchanged.

## Step 3 — push your workforce directory (SCIM / API)

Human ownership, approval authority, and the revocation cascade key off a **stable directory
subject** (not email). Feed your directory into agent-idp's directory seam so those subjects
resolve:

```bash
# Full-snapshot reconcile (the supported model — joiner/mover/leaver):
curl -sS -X POST "$AGENT_IDP_URL/v1/directory/sync" \
  -H 'content-type: application/json' \
  -d @your-directory-snapshot.json
```

The snapshot maps each employee to a stable `employeeId` subject + org/group membership; a
leaver in a later snapshot triggers the revocation cascade (agents owned by that subject lose
their delegations). See [Connect agents to enterprise authority](/docs/concepts/enterprise-iam/) for the schema. A
turnkey vendor SCIM *connector* (Logto/Okta push) is near-term roadmap; today you push the
snapshot from your directory of record (the seeder in `seed-logto/` is the worked example for
Logto, and a template for any source).

## Step 4 — verify

```bash
# A human token from YOUR IdP resolves to a stable subject:
curl -sS -X POST "$AGENT_IDP_URL/v1/identity/resolve" \
  -H 'content-type: application/json' -d '{"token":"<a real login JWT from your IdP>"}'
# -> {"subject":"NST-1011", "source":"scim", ...}  (not "unresolved")

# An inbound call with that token is accepted at /authz; without it, denied.
```

Acceptance: a real login token from your IdP is verified at `/authz` (right `iss`/`aud`),
resolves to a stable workforce subject via `/v1/identity/resolve`, and that subject can own
agents / approve elevations in the portal. Removing the component (or supplying a token from a
different issuer) fails closed.

## Notes & limits

- **Logto is the first *supported* IdP** (worked example + seeder). Other OIDC IdPs use the
  identical three-env-var + SCIM-snapshot path; shipped vendor connectors are roadmap
  ([BACKLOG](/docs/) → Deferred IdP Integrations).
- **Real JWT/JWKS verification** is enforced at the control-plane edge; `/v1/identity/resolve`
  MVP trusts decoded claims from that verified edge (see the IdP-support concept page).
- **Docker Compose** has its own OIDC turn-on (3 env vars in `.env`); see
  [Docker Compose](/docs/operations/docker-compose/). This page is the Kubernetes equivalent.
