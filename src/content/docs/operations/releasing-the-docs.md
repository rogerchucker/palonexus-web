---
title: Releasing the docs site
description: How the PaloNexus documentation site is built, tested, and published to Cloudflare Workers — local validation, PR checks, merge behavior, deployment verification, rollback, and troubleshooting.
sidebar:
  order: 99
---

The documentation site is published to **Cloudflare Workers** by a single CI/CD pipeline.
Deployment happens **only** from a push to `main` (a merged, reviewed PR) and **only after**
the end-to-end documentation tests pass. There is no supported manual or laptop deploy path.

## Architecture at a glance

- The site is a static Astro + Starlight build (base path `/docs`).
- It is served by a dedicated Cloudflare Worker, **`palonexus-docs`**, bound by the routes
  `palonexus.ai/docs` and `palonexus.ai/docs/*` (config: `wrangler.docs.jsonc`). The build
  is nested under `docs/` (`npm run stage:docs`) so every `/docs/*` asset path resolves.
- The marketing site (`palonexus.ai/`) is a **separate** worker and is never touched by a
  docs deploy.
- The pipeline lives in `.github/workflows/docs-ci-deploy.yml`.

## Local validation (before you push)

```sh
npm ci
npm run validate     # Prettier format check + docs build + Playwright E2E
```

Useful individual commands:

```sh
npm run format       # auto-fix formatting (code/config; prose is excluded)
npm run format:check # formatting gate only
npm run build        # docs build (also validates content schema + Mermaid)
npm run test:e2e     # Playwright E2E against a freshly built site
npm run preview      # serve the built site at http://localhost:4321/docs/
```

The E2E suite (`tests/e2e/docs.spec.ts`) builds the site, opens it in Chromium, and verifies:
the homepage; key developer pages (`/docs/develop/`, `/docs/sdk/…`); key operator pages
(`/docs/operations/self-hosting/`, `/docs/operations/doks-runbook/`); sidebar and in-page
navigation; that Mermaid diagrams render to `<svg>` without breaking the page; and that there
are no severe browser console errors.

## Pull request checks

Every PR targeting `main` runs the **validate** job: install → Prettier check → docs build →
Playwright E2E. The Playwright HTML report is uploaded as a build artifact. PRs **do not**
deploy. Make these required status checks in branch protection so a PR cannot merge while red.

## Merge / push behavior

When a PR merges to `main`, the same workflow runs `validate` again and — only if it passes —
runs the **deploy** job. Deploy is gated by `needs: validate` and an `if:` guard that requires
the canonical repository, a `push` event, and the `main` ref.

## Deployment verification

The deploy job runs a post-deploy smoke test that asserts HTTP 200 for the docs home and
representative developer/operator pages, checks that `/docs` (no trailing slash) redirects, and
confirms the marketing root is still reachable. A failed check fails the job (red deploy).

After a release, confirm manually if needed:

```sh
curl -I https://palonexus.ai/docs/
curl -I https://palonexus.ai/docs/operations/self-hosting/
```

## Rollback

Cloudflare keeps prior Worker versions. To roll back the docs worker:

```sh
npx wrangler deployments list --name palonexus-docs
npx wrangler rollback --name palonexus-docs            # previous version
# or pin a specific version:
npx wrangler rollback <version-id> --name palonexus-docs
```

`wrangler rollback` is an operational break-glass action and requires Cloudflare credentials;
it does not change git. Prefer **revert the offending commit on `main`** so the deployed state
matches `main` and the next push redeploys the known-good build.

## Required secrets

Configure these as GitHub Actions secrets, scoped to the **`production`** Environment
(`Settings → Environments → production`) so deploys can also require a reviewer:

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Scoped token: Workers Scripts **Edit**, Workers Routes **Edit** (zone `palonexus.ai`), Account **Read**, Zone **Read**. |
| `CLOUDFLARE_ACCOUNT_ID` | Account that owns the `palonexus-docs` worker. |

See `.env.example` for the full token scopes. Use a **scoped** token, never a global API key.

## Safeguards (why a fork or laptop cannot publish)

- **CI-only**: `npm run deploy` / `deploy:docs` refuse to run and point here
  (`scripts/no-manual-deploy.mjs`). Credentials exist only in GitHub Actions.
- **Forks**: the deploy `if:` guard checks `github.repository == 'rogerchucker/palonexus-web'`,
  and fork PRs cannot read repository/Environment secrets.
- **Branches & PRs**: deploy requires `push` to `refs/heads/main`; PRs and feature branches
  only validate.
- **Environment protection**: the `production` Environment can require manual approval and
  restrict deployments to `main`.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Deploy job skipped | Not a push to `main`, or running on a fork — expected. |
| `Authentication error` in Wrangler step | `CLOUDFLARE_API_TOKEN` missing/expired or wrong scopes; reissue with the scopes above. |
| Post-deploy smoke test fails on `/docs/*` | Route or staging issue — confirm `wrangler.docs.jsonc` routes and that `stage:docs` nested the build under `docs/`. |
| E2E fails on a Mermaid page | A diagram failed to render — check the offending `.md` for a `;` inside a Mermaid `Note`/label (a statement separator that breaks the parser). |
| Playwright "webServer timed out" | Build failed or the preview port `4321` was busy; run `npm run build` locally to see the error. |
| Marketing root check fails | A docs deploy must never affect `palonexus.ai/` — investigate the separate marketing worker; do not work around it here. |
