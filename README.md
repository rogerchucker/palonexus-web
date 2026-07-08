# PaloNexus Web

Two independent [Astro](https://astro.build) sites, built and deployed separately from
this one repo:

- **Docs** (`/docs`) — the PaloNexus documentation site, built with
  [Starlight](https://starlight.astro.build). See [Docs](#docs-docs) below.
- **Marketing root** (`/`) — the palonexus.ai homepage, built from markdown content. See
  [Marketing root](#marketing-root-) below.

They ship on separate Cloudflare Workers (`palonexus-docs` / `palonexus-web`), separate
CI pipelines, and separate Playwright suites — a change to one can never block or break
the other.

## Docs (`/docs`)

Covers developer integration, the Python SDK reference, operations (Go + Terraform),
self-hosting, architecture/features, and an HTTP API reference.

### Local development

```sh
npm install
npm run dev        # http://localhost:4321/docs/
npm run build      # static site -> dist/  (+ Pagefind search index)
npm run preview    # serve the built static site
```

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
- Full process (local validation, PR checks, merge behavior, verification, rollback,
  troubleshooting, required secrets): **`src/content/docs/operations/releasing-the-docs.md`**
  (published at `/docs/operations/releasing-the-docs/`).
- Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (see `.env.example`).

### Structure

```
astro.config.mjs            # base: '/docs', Starlight integration + sidebar (6 sections)
src/content.config.ts       # Starlight docs collection (unchanged, unrelated to the root site)
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
authored as markdown in a dedicated `landing` collection instead of hardcoded in a
component. Lives in its own `src-root/` source directory (a separate Astro `srcDir`,
not `src/`) so its page routing and content collection are fully isolated from docs —
sharing `src/pages/` let a root `index.astro` silently override Starlight's own
homepage route, which is why the two builds don't share a source tree.

### Local development

```sh
npm run dev:root        # http://localhost:4321/
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
- Worker config: [`wrangler.jsonc`](wrangler.jsonc) — static assets, no adapter, no KV.
- Required GitHub secrets: shared with docs — `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

### Structure

```
astro.config.root.mjs           # base: '/' (default), srcDir: 'src-root', outDir 'dist-root'
src-root/content.config.ts      # `landing` collection (discriminated union, one schema per section)
src-root/content/landing/       # nav, hero, solutions, why-now, platform, use-cases, governance, closing
src-root/components/landing/    # one presentational component per section
src-root/pages/index.astro      # assembles the sections in order, wrapped in Layout.astro
src-root/layouts/Layout.astro   # document metadata, imports landing.css
src-root/styles/landing.css     # page CSS
tests/e2e-root/root.spec.ts     # Playwright suite (separate testDir from docs' tests/e2e)
```

### Edit content

Edit the relevant file in `src-root/content/landing/*.md`. Frontmatter shape is
validated per section by the schema in `src-root/content.config.ts` — a build fails
loudly if a required field is missing or misspelled. `why-now.md` and `governance.md`
also have a markdown body (their one prose paragraph); every other section is pure
frontmatter.
