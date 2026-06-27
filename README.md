# PaloNexus Docs

The PaloNexus documentation site — built with [Astro](https://astro.build) +
[Starlight](https://starlight.astro.build) and served from the **`/docs`** context.

Covers developer integration, the Python SDK reference, operations (Go + Terraform),
self-hosting, architecture/features, and an HTTP API reference.

## Local development

```sh
npm install
npm run dev        # http://localhost:4321/docs/
npm run build      # static site -> dist/  (+ Pagefind search index)
npm run preview    # serve the built static site
```

The site is **static** (no adapter); `dist/` can be served by any static host. (The
Cloudflare adapter was removed for the static docs build — re-add `@astrojs/cloudflare`
in `astro.config.mjs` for a Cloudflare Workers deploy.)

## Structure

```
astro.config.mjs            # base: '/docs', Starlight integration + sidebar (6 sections)
src/content.config.ts       # Starlight docs collection
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

## Add a page

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
