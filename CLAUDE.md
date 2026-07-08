# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`palonexus-web` is the PaloNexus **documentation site** — an Astro + Starlight static site
served under the `/docs` base path at `palonexus.ai/docs`. It is *not* the product (the
agent control plane, SDK, portal) — those live in the separate `platform/` repo. This repo
only documents them. Source-of-truth drafts for some content live in `../platform/docs/`.

The homepage (`src/content/docs/index.mdx`) also carries marketing copy for the site root
(`/`), checked by `scripts/check-homepage.mjs` (see below).

## Commands

```sh
npm run dev              # astro dev -> http://localhost:4321/docs/
npm run build            # static build -> dist/ (also validates content schema + Mermaid transform)
npm run preview          # build + serve the static build (required to eyeball Mermaid diagrams)
npm run format           # prettier --write .
npm run format:check     # prettier --check .   (CI gate)
npm run test:e2e         # playwright test      (same as test:docs; CI gate)
npm run validate         # format:check + build + test:e2e — run this before opening a PR, mirrors CI exactly
npm run test:homepage    # astro build + scripts/check-homepage.mjs (asserts required marketing strings in dist/client/index.html)
```

Run a single Playwright test: `npx playwright test tests/e2e/docs.spec.ts -g "homepage loads"`.
Playwright auto-starts `npm run preview` as its web server (see `playwright.config.ts`), so a
plain `npm run test:e2e` is sufficient — no need to run `preview` separately first.

There is no unit test runner; correctness is enforced by the Astro/content-schema build,
Playwright E2E, and (in the separate `platform/` repo) a doc-test gate that executes every
` ```python ` fence in CI.

**Deployment is CI-only.** `npm run deploy` / `npm run deploy:docs` intentionally fail
(`scripts/no-manual-deploy.mjs`) — publishing happens only via `.github/workflows/docs-ci-deploy.yml`
on push to `main`, after `validate` passes. Never try to work around this script to deploy manually.

## Architecture

- **Astro + Starlight**, static output, `base: '/docs'` (`astro.config.mjs`). No adapter —
  `dist/` is plain static files served by any host / Cloudflare Worker.
- **Integration order matters**: `astro-mermaid` must precede `starlight()` in the
  `integrations` array so it transforms ` ```mermaid ` fences before Expressive Code touches
  them. Don't reorder.
- **Content collection**: all docs are Markdown/MDX under `src/content/docs/<section>/`,
  loaded via `docsLoader()`/`docsSchema()` in `src/content.config.ts`. Each top-level
  directory is one sidebar section, configured explicitly in `astro.config.mjs`:
  `getting-started`, `concepts`, `develop` (+ `develop/guides`, `develop/recipes`), `sdk`,
  `operations`, `reference`. Sidebar order within a section is `sidebar.order` in page
  frontmatter.
- **Generated API reference**: the "Reference" section's interactive API docs are generated
  by `starlight-openapi` from `openapi/agent-idp.json` — don't hand-edit those generated
  pages; edit the OpenAPI spec instead.
- **Screenshots**: `public/screenshots/`, referenced with absolute `/docs/screenshots/...`
  paths. Every PNG must have a corresponding row in `public/screenshots/MANIFEST.md` (route,
  alt text, caption, capture state — `rich`/`initial`/`empty`).
- **Diagrams**: Mermaid fences (`flowchart`, `sequenceDiagram`, `stateDiagram-v2` only),
  rendered client-side — `npm run build` does *not* catch Mermaid syntax errors, only
  `npm run preview` + manual viewing does. A stray `;` in a `Note`/label breaks the parser;
  use an em dash or comma instead.
- `docs/superpowers/` at the repo root is unrelated tooling content, not part of the
  Starlight `docs` content collection.

## Content conventions (from CONTRIBUTING.md)

- **IdP-neutral positioning is load-bearing, not stylistic.** PaloNexus issues and owns
  *agent* identity; the workforce IdP (Okta, Entra ID, Auth0, Google Workspace, Keycloak,
  Logto, …) owns *humans* and syncs in via OIDC/SCIM. Lead with the standard (OIDC/SAML/SCIM),
  name vendors only as examples. **Logto is labeled as the reference/demo IdP**, never
  implied to be a dependency.
- Keep real artifact names verbatim even when neutralizing positioning — e.g. `seed-logto`,
  `LOGTO_*`, `FakeLogtoClient`, `/settings/logto` stay as-is.
- Python snippets in docs are executed in CI (in the `platform/` repo's doc-test gate)
  against an offline `palonexus` instance (`pn` / `offline_pn`, `PaloNexus.offline()`).
  Snippets must be self-contained and offline-runnable. Live-only or illustrative snippets
  need an HTML comment immediately before the fence:
  `<!-- no-doctest: reason -->`.
- End reference-style pages with a "Related"/"See also" list of absolute `/docs/...` links
  (trailing slash).
- Every diagram and screenshot must be introduced in prose beforehand and followed by an
  *italic* caption — never dropped in bare.

## Before opening a PR

Run `npm run validate` (mirrors the CI `validate` job exactly: format check → build →
Playwright E2E) and, if diagrams changed, visually check them via `npm run preview` since the
build won't catch Mermaid errors. See `BACKLOG.md` for known non-blocking gaps (unresolved
screenshot states, deferred routes, IdP-neutralization follow-ups) before assuming something
is a new bug.
