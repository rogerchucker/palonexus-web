# Epic — Landing/Docs Theme Unification + Access-Request → Integration-Request Repurpose

**Status:** in progress (2026-07-22) · **Owner:** TPM · **Repo in scope:** `palonexus-web` (this repo)
**Created:** 2026-07-22 · **Tracking:** markdown-only in `docs/requirements/` — no Linear (free-tier limit)

## 1. Epic summary

Two coordinated changes to the public surfaces of `palonexus-web`, shipped
together but built by two non-overlapping Dev workstreams, then gated by QA
and deployed by Ops:

1. **Theme unification.** The marketing root (`palonexus.ai`, hand-built Astro
   under `src-root/`) and the Starlight docs (`src/`, base `/docs`) currently
   look like two different products. Give them **one brand identity** — shared
   accent, typography, neutral surface palette, and dark-mode parity — by
   adding a Starlight `customCss` brand file plus a shared design-token file
   consumed by the landing. Docs stay mounted at `/docs` (base unchanged).
2. **Request-flow repurpose.** The current "request access" signup is
   renamed and repurposed into an **integration / change / fix request** flow:
   route `/request-access` → `/request-changes`, endpoint
   `/api/request-access` → `/api/request-changes`, CTA "Request access" →
   "Request Integration", and the form content moves from access-signup to
   structured enhancement requests with defined categories and an SLA.

Both workstreams run in parallel now on disjoint file sets. All work stays
**uncommitted** until the QA gate passes; Ops handles the PR → merge → deploy.

**Verified ground truth (2026-07-22, do not re-verify):**

- **Landing theme:** bespoke warm/cream palette — bg `#f6f4ef`, near-black
  text, navy `#14213d`, rust `#b44d29` eyebrow/eyebrow-accent, Inter font,
  **light-only**. Styles live in `src-root/styles/landing.css` and
  `src-root/layouts/Layout.astro`. No design-token file exists yet.
- **Docs theme:** stock Starlight, **no `customCss`** configured in
  `astro.config.mjs`. Docs are mounted at `base: '/docs'`.
- **Nav:** six elements — brand `PaloNexus`, Solutions, Platform, Governance,
  Docs, + CTA. Nav data in `src-root/content/landing/nav.md`
  (CTA `label: Request access`, `href: '/request-access/'`).
- **Request-flow surface (all must move in lockstep):**
  - CTA hrefs/labels: `src-root/content/landing/nav.md`,
    `src-root/content/landing/hero.md`, `src-root/content/landing/closing.md`
    (each `label: Request access`, `href: '/request-access/'`).
  - Pages: `src-root/pages/request-access/index.astro` (form),
    `src-root/pages/request-access/thanks.astro` (confirmation).
  - Worker: `src-root/worker/index.js` — endpoint guard
    `url.pathname === '/api/request-access'`, error redirects to
    `/request-access/?error=1`, success/honeypot redirects to
    `/request-access/thanks/`, email subject
    `'New access request from palonexus.ai/request-access/'`, and body/log
    strings.
  - Tests: `tests/e2e-root/root.spec.ts` exercises the CTA, the form route,
    and the thanks route.
- Two parallel Dev workstreams are already running: **Dev-A (theme
  specialist)** owns `src/`-docs CSS + `astro.config.mjs` customCss wiring +
  the shared token file + landing style consumption; **Dev-B (request-flow)**
  owns the `request-access` → `request-changes` rename, worker, content, and
  tests. Their file sets are disjoint (see §2).

## 2. Guardrails (apply to every issue)

- **Disjoint file sets — hard boundary.** Dev-A touches theme/token/CSS files
  only; Dev-B touches request-flow route/worker/content/test files only. The
  one shared file, `astro.config.mjs`, is **Dev-A's** (customCss array) — Dev-B
  does not edit it. If a genuine overlap surfaces, it routes through TPM, not a
  silent cross-edit.
- **Docs base unchanged.** Theme work adds `customCss`; it does **not** change
  `base: '/docs'`, sidebar structure, or content. Redirect/base asymmetry in
  `astro.config.mjs` is untouched.
- **One brand, both modes.** The shared identity is defined once (token file)
  and consumed by both surfaces. Dark-mode parity means the docs' existing
  light/dark toggle and the landing render from the **same** token set — no
  divergent hardcoded hex values left in `landing.css` for themed properties.
- **Rename is total.** The `request-access` → `request-changes` change is
  all-or-nothing across route dir, every CTA href, the worker endpoint +
  redirects + email subject/body + log strings, and the thanks route. No
  `/request-access/` string survives outside historical notes.
- **CTA label vs. route.** Two distinct renames: the **visible label**
  "Request access" → "Request Integration" (all three CTA content files) and
  the **route/endpoint** `request-access` → `request-changes`. Do not conflate
  — the label is "Integration", the slug is "changes".
- **Content repurpose, not just relabel.** The form stops being an access
  signup and becomes an enhancement/change/fix request with categories:
  **new IdP**, **new agent platform**, **new agent outbound destination**,
  **custom guardrail (activity to forbid)**, or **something more custom**.
  Include the SLA copy: *2-business-day turnaround for requested-and-agreed
  enhancements/changes/fixes, subject to adjustment based on market
  conditions.*
- **Test lockstep.** Every route/label/copy assertion in
  `tests/e2e-root/root.spec.ts` that a rename touches is updated in the same
  workstream (Dev-B) — the QA gate must not discover drift.
- **Nothing gets committed by Dev/QA.** All edits stay uncommitted in the
  working tree until the QA gate is green; Ops owns the commit/PR/merge/deploy
  step. Pre-existing unrelated WIP in the tree is left untouched.

## 3. Issue breakdown

Dependency order:
`LU-DEV-A1` → `LU-DEV-A2` (theme) and `LU-DEV-B1` → `LU-DEV-B2` → `LU-DEV-B3`
(request-flow) run **in parallel**, both converge on `LU-QA-1` → `LU-OPS-1` →
`LU-TPM-1`.

### LU-DEV-A1 · Define the shared brand token set + Starlight customCss brand file — Dev-A (theme specialist)

- [ ] Status: not started
- **Description:** Establish the single source of brand truth. Create a shared
  design-token file (accent, typography stack, neutral surface palette, and
  the light/dark values for each) and a Starlight `customCss` brand file that
  maps those tokens onto Starlight's CSS custom properties
  (`--sl-color-*`, accent, font families) for **both** light and dark. Wire
  the customCss file into `astro.config.mjs`'s `starlight({ customCss: [...] })`
  (Dev-A owns this shared config edit). Decide and record the brand accent (see
  §5 D-2) and the neutral surface ramp so both surfaces read as one product.
- **Acceptance criteria:**
  - A shared token file exists and defines accent, typography, and a neutral
    surface palette with explicit light **and** dark values.
  - A Starlight `customCss` brand file consumes those tokens and is registered
    in `astro.config.mjs`; docs build green; `base: '/docs'` unchanged.
  - Docs render the shared accent/typography in both light and dark mode
    (dark-mode parity per §5 D-1's agreed scope).
  - No docs content, sidebar, or redirect changes.
- **Deps:** none.

### LU-DEV-A2 · Consume shared tokens in the landing; retire divergent hardcoded values — Dev-A (theme specialist)

- [ ] Status: not started
- **Description:** Refactor `src-root/styles/landing.css` (and
  `src-root/layouts/Layout.astro` where it hardcodes theme values) to consume
  the shared token set from LU-DEV-A1 instead of the bespoke warm/cream hexes
  (`#f6f4ef`, `#14213d`, `#b44d29`, near-black). Bring the landing to the
  unified accent, typography, and neutral surfaces, and honor the agreed
  dark-mode scope (§5 D-1). Preserve landing layout/structure — this is a
  palette/type/token swap, not a redesign of sections.
- **Acceptance criteria:**
  - Landing themed properties reference shared tokens; no orphaned bespoke
    hexes remain for tokenized properties.
  - Landing and docs visibly share accent, typography, and neutral surfaces.
  - Landing honors the agreed dark-mode scope (parity or documented deferral
    per §5 D-1); `build:root` green; no layout/section regressions.
- **Deps:** LU-DEV-A1 (token file + accent decision).

### LU-DEV-B1 · Rename route + worker: request-access → request-changes — Dev-B (request-flow)

- [ ] Status: not started
- **Description:** Move the page directory
  `src-root/pages/request-access/` → `src-root/pages/request-changes/`
  (both `index.astro` and `thanks.astro`), and rewire the worker
  `src-root/worker/index.js`: endpoint guard `/api/request-access` →
  `/api/request-changes`, all error redirects `/request-access/?error=1` →
  `/request-changes/?error=1`, success/honeypot redirects
  `/request-access/thanks/` → `/request-changes/thanks/`, email subject and
  body, and the `request-access` log/comment strings. No `/request-access/`
  string survives.
- **Acceptance criteria:**
  - Route dir renamed; both pages resolve at `/request-changes/` and
    `/request-changes/thanks/`.
  - Worker endpoint, all redirects, email subject/body, and log strings use
    `request-changes` / `/api/request-changes`.
  - Zero remaining `request-access` references in code/content (grep-clean).
- **Deps:** none.

### LU-DEV-B2 · Repurpose CTA labels + form content to integration/change requests — Dev-B (request-flow)

- [ ] Status: not started
- **Description:** Update the three CTA content files
  (`src-root/content/landing/nav.md`, `hero.md`, `closing.md`): label
  "Request access" → "Request Integration", href `/request-access/` →
  `/request-changes/`. Repurpose the form page
  (`src-root/pages/request-changes/index.astro`) from access-signup to an
  enhancement/change/fix request with categories — **new IdP**, **new agent
  platform**, **new agent outbound destination**, **custom guardrail
  (activity to forbid)**, **something more custom** — and add the SLA copy
  (2-business-day turnaround for requested-and-agreed enhancements/changes/
  fixes, subject to adjustment based on market conditions). Update the
  `thanks.astro` confirmation copy to match the new intent.
- **Acceptance criteria:**
  - All three CTAs read "Request Integration" and link to `/request-changes/`.
  - Form presents the five categories and captures a request description.
  - SLA copy present and worded per the guardrail.
  - Thanks page copy reflects integration/change-request intent, not access
    grant.
- **Deps:** LU-DEV-B1 (route exists at new slug).

### LU-DEV-B3 · Update tests/e2e-root/root.spec.ts in lockstep — Dev-B (request-flow)

- [ ] Status: not started
- **Description:** Update `tests/e2e-root/root.spec.ts` so every assertion on
  the CTA label, the request route, the thanks route, and any asserted form
  copy matches the new "Request Integration" / `/request-changes/` surface.
  Add/adjust coverage for the category set and SLA copy where the spec asserts
  form content.
- **Acceptance criteria:**
  - No test references `Request access` label or `/request-access/` route.
  - Spec asserts the new label, `/request-changes/` and
    `/request-changes/thanks/` routes, and (where covered) categories + SLA.
  - Spec passes locally against the renamed surface.
- **Deps:** LU-DEV-B1, LU-DEV-B2.

### LU-QA-1 · QA gate: format, both builds, full Playwright — QA

- [ ] Status: not started
- **Description:** After both Dev workstreams report done, run the gate on the
  combined uncommitted tree: (1) `npm run format:check`, (2) `npm run
  build:root` (landing), (3) `npm run build` (docs), (4) the **full**
  Playwright suite — root spec (`tests/e2e-root/root.spec.ts`) and docs spec
  (`tests/e2e/docs.spec.ts`). Add verification greps: zero `request-access` /
  `Request access` outside historical notes; docs `customCss` registered and
  brand tokens resolving in both modes. Route any failure back to the owning
  workstream (Dev-A or Dev-B) as a callout under the relevant issue, and re-run
  the gate after the fix.
- **Acceptance criteria:**
  - `format:check` clean; `build:root` and docs `build` both green.
  - Full Playwright suite green (root + docs); command output summarized in §6.
  - Grep verification: zero stray `request-access`/`Request access`; theme
    unification visually confirmed (accent/type/surface shared, dark-mode per
    §5 D-1).
  - All work remains uncommitted (Ops owns commit/deploy).
- **Deps:** LU-DEV-A2, LU-DEV-B3.

### LU-OPS-1 · PR, merge, deploy both Cloudflare workers, live smoke test — Ops

- [ ] Status: not started
- **Description:** Once the QA gate is green, branch → PR → merge, then deploy
  **both** Cloudflare workers (landing/root and docs). Run a live smoke test:
  landing and docs both render the unified brand (light + dark);
  `/request-changes/` form loads with categories + SLA; a submitted request
  hits `/api/request-changes` and lands on `/request-changes/thanks/` with the
  founder-inbox email delivered; old `/request-access/` path behavior verified
  (404/redirect as designed). Record deploy + smoke evidence in §6.
- **Acceptance criteria:**
  - PR merged; both workers deployed successfully.
  - Live smoke test passes: unified theme in both modes, working
    `/request-changes/` submission end-to-end, email delivered.
  - Deploy/smoke evidence recorded in §6.
- **Deps:** LU-QA-1.

### LU-TPM-1 · Close out epic with evidence and decisions — TPM

- [ ] Status: not started
- **Description:** Confirm all Dev/QA/Ops checkboxes are done, resolve the §5
  flagged decisions (dark-mode parity scope; brand accent choice) with the
  final call recorded, fill §6 with evidence (build/test output, grep
  summaries, deploy/smoke notes), flip the epic **Status** header, and present
  the change set as merged/deployed.
- **Acceptance criteria:**
  - §6 evidence complete; every issue checked; header status updated.
  - §5 decisions resolved with rationale recorded.
  - Epic reflects live, deployed state.
- **Deps:** LU-OPS-1.

## 4. Out of scope

- Changing the docs `base` (`/docs`), sidebar structure, or docs content —
  theme work is CSS/tokens only.
- Redesigning landing sections/layout — the theme change is a palette/type/
  token swap, not a structural redesign.
- Renaming or restructuring docs routes, or touching `tests/e2e/docs.spec.ts`
  content assertions beyond what the shared theme requires.
- The backend delivery mechanism of the request email (free-tier forwarder)
  beyond the endpoint/subject/body rename — no new provider or storage.
- Committing/pushing before the QA gate is green — Dev/QA leave the tree
  uncommitted; Ops owns commit → PR → merge → deploy.
- Pre-existing unrelated WIP in the working tree.

## 5. Flagged items / decisions (resolve before close-out)

| # | Item | Detail | Disposition |
|---|---|---|---|
| D-1 | Dark-mode parity scope | Docs (Starlight) ship a light/dark toggle out of the box; the landing is currently **light-only**. Decide whether this epic delivers full landing dark-mode (adds a landing toggle + dark token values consumed by `landing.css`) or ships **shared-tokens-with-docs-dark-only** now and defers a landing toggle to a follow-up. Affects LU-DEV-A1/A2 acceptance. | **Open — Dev-A + TPM to decide.** Recommend: define dark token values in the shared file regardless (docs consume them immediately); landing toggle is the scoping variable. |
| D-2 | Brand accent choice | The landing today uses rust `#b44d29` (eyebrow) over navy `#14213d`. The unified accent can (a) keep rust as the single brand accent, (b) promote navy, or (c) pick a new accent that reads well in both light and dark and against Starlight's neutrals. Whatever is chosen becomes the docs link/accent color too. | **Open — Dev-A (design) proposes, TPM approves.** Decision must be recorded before LU-DEV-A2 consumes it, since the landing refactor bakes it in. |

## 6. Evidence log (to be completed at close-out)

| Item | Evidence |
|---|---|
| Theme: token file + Starlight customCss wiring | _pending LU-DEV-A1_ |
| Theme: landing token consumption / bespoke-hex retirement | _pending LU-DEV-A2_ |
| Rename: route/worker `request-access` → `request-changes` (grep-clean) | _pending LU-DEV-B1_ |
| Repurpose: CTA "Request Integration" + categories + SLA copy | _pending LU-DEV-B2_ |
| Tests: `root.spec.ts` updated in lockstep | _pending LU-DEV-B3_ |
| QA gate: `format:check` / `build:root` / docs `build` / Playwright | _pending LU-QA-1_ |
| Deploy: both Cloudflare workers + live smoke test | _pending LU-OPS-1_ |
| Decisions D-1 (dark-mode scope) / D-2 (brand accent) resolved | _pending LU-TPM-1_ |
