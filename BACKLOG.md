# PaloNexus Docs — Backlog

Tracked work for the documentation site that could not be completed in the product-readiness
pass (diagrams, screenshots, pages). Everything here is **non-blocking** — the site builds clean,
all 20 Mermaid diagrams render, all 16 screenshots resolve, and the doc-test gate passes.

Last updated: 2026-06-27 (docs diagram/screenshot/table pass).

## Screenshots — re-capture in richer state

The live portal (`http://165.227.252.142`, image `:h13`) was captured read-only at 1440×900.
Two surfaces were captured in their genuine **empty/resting** state and embedded with honest
captions; they should be re-captured once the demo tenant has live data in the right state.

| Screenshot | Current state | What it needs | Owner |
|---|---|---|---|
| `approvals.png` | Empty queue (0 pending / 0 active) | A **pending** task-scoped delegation in the queue — run the SDK hero flow to `request_delegation` and capture **before** approving (within TTL). | QA + docs |
| `egress.png` | Nothing held | An outbound model/tool call **held** at the egress proxy (a governed agent call that triggers a hold). | QA + docs |
| `identity.png`, `governance.png`, `directory.png` | Delegations mostly `expired`; 0 active | A fresh hero-flow run captured **within** the delegation TTL window so an **active** delegation shows; illustrates temporary elevation better. | QA + docs |
| `agent-registry.png`, `identity.png` | Show QA/probe agents (`qa-*`, `apps-target-qa-*`) | Re-capture against a **freshly seeded** tenant (canonical Northstar agents only) for cleaner published images. | Ops (reseed) + docs |

## Screenshots — not yet captured

| Route | Why deferred | Decision needed |
|---|---|---|
| `/registry`, `/traces` | Present in portal nav, out of scope for this pass | Decide whether they warrant doc coverage; if so capture + embed. |

## Diagrams — optional additions

| Page | Candidate diagram | Notes |
|---|---|---|
| `concepts/egress-enforcement.md` | Mermaid version of the egress **defense-in-depth layers** (proxy / gateway / admission / sidecar) | Page already has a clear ASCII sketch + numbered sections; the requested decision-flow diagram was prioritized. Convert if a Mermaid version is wanted. |

## Content grounded on upstream TODOs

| Page | Item | Blocked on |
|---|---|---|
| `operations/secrets.md`, `operations/upgrades.md` | API-keys / tenant env rows for the secret + version matrices | REM-161 leaves those env values as upstream TODO placeholders; tables stay grounded in **deployed** values until they land. |

## IdP neutralization (follow-ups)

PaloNexus is positioned as **IdP-neutral**; Logto is the labeled reference/demo IdP. The docs
pass neutralized positioning, diagrams, tables, and labeling, and added the
[IdP Support Model](/docs/concepts/idp-support/) page. Remaining items:

| Item | Detail | Owner |
|---|---|---|
| **`authority-preview` ↔ Logto seed coupling** | agent-idp `POST /v1/authority/preview` ("Authority preview") returns **503** without `SEED_LOGTO_DIR` (it resolves the Northstar **demo** seed package/manifests). If this is meant to be a GA, IdP-neutral capability rather than demo-only, decouple it from the Logto seed package. Docs currently describe it as demo-seed tooling. | Dev / TPM |
| **Vendor connectors not shipped** | The docs name Okta, Entra ID, Auth0, Ping, Google Workspace, Cognito, Keycloak as **supported via standard OIDC/SCIM** — there are no shipped one-click vendor connectors. The IdP Support Model page states this honestly; building/validating a concrete non-Logto OIDC + SCIM integration (e.g. Entra or Okta) end-to-end would let us show a real second IdP. | Dev + DevRel |
| **SAML sign-in unverified** | Only **OIDC** JWT/JWKS verification is a verified path today (`OIDC_ISSUER/AUDIENCE/JWKS_URL`); SAML is listed as a standard pattern but not exercised. Confirm or qualify. | Dev |
| **Demo screenshots are Logto-specific** | The `/settings/logto` connector, onboarding "Connect Logto", and `/settings/seed` screenshots are now captioned as **reference demo**. A neutral/production-IdP equivalent (or a generic OIDC/SCIM connector mockup) would round out the IdP-neutral story. | Docs (capture) |
| **Glossary M2M example** | The `M2M` glossary entry cites "the Logto seeder's client id/secret" as a concrete example — accurate demo context, optional to soften to "the demo seeder's". | Docs (low priority) |

## DevRel polish (audit vs Logto / Ory)

Benchmarked PaloNexus docs against Logto (`docs.logto.io`) and Ory (`ory.com/docs`). Implemented
the front-door path-picker hub (`index.mdx`), a **Security & Trust** page, a **Releases &
Changelog** page, an **interactive agent-idp API reference** (OpenAPI 3.1 → `starlight-openapi`),
a **CLI reference**, repo **`SECURITY.md`** + `security.txt`, a docs **`CONTRIBUTING.md`**, the
nav reorder (concepts moved up), and value-first reference intros. Status:

| Item | Status |
|---|---|
| **Interactive API reference** | ✅ **Done** — `openapi/agent-idp.json` (47 paths) rendered via `starlight-openapi` at `/docs/reference/api/agent-idp/` (52 generated pages, try-it). The control-plane (Go) has no OpenAPI spec; its HTTP contract stays the curated [http-api](/docs/reference/http-api/) tables — generating one is optional future work. |
| **CLI reference page** | ✅ **Done** — `reference/cli.md` (seed-logto subcommands/flags + safety, `make` targets, kubectl/kustomize, SDK entry), linked from `reference/index`. |
| **Per-release changelog** | ✅ **Content done** — `reference/changelog.md` now carries dated, themed release history (real `:h<N>` image tags + SDK `0.1.0`). Remaining: an automated per-tagged-release feed once releases are git-tagged. |
| **Security contact / policy** | ✅ **Artifacts done** — repo `SECURITY.md` + `public/.well-known/security.txt` (RFC 9116) + the disclosure section. **Remaining (user action): replace the placeholder `security@palonexus.example` with the real mailbox before publishing.** |
| **Status / SLA page** | ⏸ **Excluded** — relevant only for a hosted offering; revisit if PaloNexus is offered as a managed service. |
| **Nav ordering** | ✅ **Done** — "Architecture & Features" moved directly after "Getting Started" in the sidebar. |
| **Tone polish** | ✅ **Done** — value-first "when to use this" intros on `http-api`, `headers`, `env-vars`, `enterprise-iam-api`. Optional: extend to deeper operations pages. |

## Conventions (for future doc contributors)

✅ **Promoted to a permanent contributor guide:** [`palonexus-web/CONTRIBUTING.md`](./CONTRIBUTING.md).
It covers project layout, Mermaid rules (incl. the no-semicolons-in-`Note`/label gotcha),
screenshots, IdP-neutral terminology, cross-links/frontmatter (`sidebar.order`), the doc-test
gate, and the full validation workflow (build → browser Mermaid check → links/images).
