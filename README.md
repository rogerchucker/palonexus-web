# PaloNexus Web

One [Astro](https://astro.build) source tree produces the connected PaloNexus web
experience:

- **Docs** (`/docs`) — the PaloNexus documentation site, built with
  [Starlight](https://starlight.astro.build). See [Docs](#docs-docs) below.
- **Marketing root** (`/`) — the palonexus.ai homepage, built from markdown content. See
  [Marketing root](#marketing-root-) below.

The current production rollout keeps the two existing Cloudflare Workers (`palonexus-docs`
and `palonexus-web`) as an intentionally reversible migration step. The unified artifact
and candidate `palonexus-web-unified` Worker are validated in CI before the production
route is switched.

## Docs (`/docs`)

Covers developer integration, the Python SDK reference, operations (Go + Terraform),
self-hosting, architecture/features, and an HTTP API reference.

### Local development

```sh
npm install
npm run dev        # unified local Worker: http://localhost:8787/
npm run build      # static site -> dist/  (+ Pagefind search index)
npm run preview    # unified local Worker, serving both surfaces
```

`npm run dev` and `npm run preview` build and stage both surfaces, then serve `/`, `/docs/`,
and the request form through the same local Worker. For Starlight-only hot reload while
editing documentation, use `npm run dev:astro` (that server is mounted at `/docs/`).

The site is **static** (no adapter); `dist/` can be served by any static host.

Validate the way CI does before pushing:

```sh
npm run validate   # Prettier format check + docs build + Playwright E2E
```

### Deployment

Publishing is **CI-only**. The site is deployed to the Cloudflare Worker `palonexus-docs`
(served at `palonexus.ai/docs`) **only** by GitHub Actions on a push to `main`, and **only
after** the Playwright E2E tests pass. There is no laptop deploy path — `npm run deploy`
intentionally refuses and points you to the release guide.

- Pipeline: [`.github/workflows/docs-ci-deploy.yml`](.github/workflows/docs-ci-deploy.yml)
  (push to `main` → validate + deploy); PRs run the same validate gate via
  [`.github/workflows/docs-ci.yml`](.github/workflows/docs-ci.yml).
- Full process (local validation, PR checks, merge behavior, verification, rollback,
  troubleshooting, required secrets): **`src/content/docs/operations/releasing-the-docs.md`**
  (published at `/docs/operations/releasing-the-docs/`).
- Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (see `.env.example`).

### Structure

```
astro.config.mjs            # base: '/docs', Starlight integration + sidebar (6 sections)
src/content.config.ts       # shared `docs` and `landing` collection schemas
src/content/docs/
  index.md                  # home (splash)
  getting-started/          # overview, concepts, local quickstart
  develop/                  # developer integration guides
  sdk/                      # Python SDK reference (agentdid, palonexus_agent)
  operations/               # Go control-plane + Kustomize + Terraform/DOKS
  concepts/                 # architecture & features
  reference/                # HTTP API, headers, env vars
```

Content is authored in Markdown with Starlight frontmatter (`title`, `description`,
`sidebar.order`). The sidebar autogenerates per directory (see `astro.config.mjs`).
Source-of-truth drafts live in `../platform/docs/`.

### Add a page

Drop a `.md` file in the relevant `src/content/docs/<section>/` directory with:

```md
---
title: My page
description: One-line summary.
sidebar:
  order: 5
---
```

Cross-link with root-relative paths under the base, e.g. `/docs/sdk/agentdid/`.

## Marketing root (`/`)

The palonexus.ai homepage — a single-page site, plain Astro (no Starlight), content
authored as markdown in the shared `landing` collection instead of hardcoded in a
component. It lives in `src/` alongside the docs collection, with its own marketing
layout and components. The build staging step mounts the generated Starlight output
under `/docs` without merging the two visual shells.

### Local development

```sh
npm run dev             # http://localhost:8787/
npm run build:root      # static site -> dist-root/
npm run preview:root    # serve the built static site
```

Validate the way CI does before pushing:

```sh
npm run validate:root   # Prettier format check + root build + Playwright E2E
```

### Deployment

Publishing is **CI-only**, same policy as docs. The site is deployed to the Cloudflare
Worker `palonexus-web` (bound to the `palonexus.ai` Custom Domain) **only** by GitHub
Actions on a push to `main`, and **only after** the Playwright E2E tests pass. There is
no laptop deploy path — `npm run deploy:root` intentionally refuses.

- Pipeline: [`.github/workflows/root-ci-deploy.yml`](.github/workflows/root-ci-deploy.yml)
  (push to `main` → validate + deploy); PRs run the same validate gate via
  [`.github/workflows/root-ci.yml`](.github/workflows/root-ci.yml).
- Worker config: [`wrangler.jsonc`](wrangler.jsonc) — static assets, no adapter, no KV.
- Required GitHub secrets: shared with docs — `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

### Structure

```
astro.config.root.mjs           # rollback build config for the legacy root Worker
src/content.config.ts           # shared `landing` and `docs` collection schemas
src/content/landing/             # nav, hero, solutions, why-now, platform, use-cases, governance, closing
src/components/landing/          # one presentational component per section
src/pages/index.astro            # assembles the sections in order, wrapped in MarketingLayout
src/layouts/MarketingLayout.astro
src/styles/landing.css
tests/e2e-root/root.spec.ts     # Playwright suite (separate testDir from docs' tests/e2e)
```

### Edit content

Edit the relevant file in `src/content/landing/*.md`. Frontmatter shape is
validated per section by the schema in `src/content.config.ts` — a build fails
loudly if a required field is missing or misspelled. `why-now.md` and `governance.md`
also have a markdown body (their one prose paragraph); every other section is pure
frontmatter.

### Unified deployment candidate

`npm run stage:unified` creates and verifies `dist-unified/`, and
`wrangler.unified.jsonc` points a single Worker at that artifact while preserving the
request-form email binding. Production continues using the two legacy workers until a
reviewed route cutover; this gives us an immediate rollback by restoring the existing
Worker routes.
