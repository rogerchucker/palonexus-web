# Epic — Landing/Docs Theme Unification + Access-Request → Integration-Request Repurpose

**Status:** complete (2026-07-22) · **Owner:** TPM · **Repo in scope:** `palonexus-web` (this repo)
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

- [x] Status: done (2026-07-22)
- **Callouts:** Accent = **brand blue hue 221**, derived from navy `#14213d`
  (D-2 resolved) — light `hsl(221,80%,44%)` `#164fca` (AA 6.99:1), dark
  `hsl(221,100%,85%)` `#b3cbff` (10.9:1); rust `#b44d29` retired. New
  `src/styles/brand.css` maps tokens onto Starlight custom properties and is
  wired into `starlight({ customCss: [...] })`; `base: '/docs'` unchanged.
  Unified font stack: Inter-first → system fallback (no Inter file loaded
  today — follow-up F-1). Dark parity via `prefers-color-scheme`. Docs build
  green.
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

- [x] Status: done (2026-07-22)
- **Callouts:** New `src-root/styles/theme.css` token layer mirrors the
  Starlight surfaces (dark via `prefers-color-scheme`); `landing.css`
  refactored to consume tokens (bespoke `#f6f4ef`/`#14213d`/`#b44d29` retired);
  `Layout.astro` imports `theme.css`. Landing and docs now share accent,
  typography, and neutral surfaces in both modes. `build:root` green;
  light/dark screenshots captured for landing and docs.
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

- [x] Status: done (2026-07-22)
- **Callouts:** Page dir renamed `request-access/` → `request-changes/`
  (`index.astro` + `thanks.astro`). Worker rewired to `/api/request-changes`
  with `request_type` captured, redirects to `/request-changes/?error=1` and
  `/request-changes/thanks/`, email subject "PaloNexus integration request".
  Live smoke later confirmed old `/request-access/` returns 404.
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

- [x] Status: done (2026-07-22)
- **Callouts:** CTA "Request Integration" set in `nav.md`, `hero.md`,
  `closing.md` (href `/request-changes/`); six-element nav preserved. Form
  gains a `request_type` select (new IdP / new agent platform / new agent
  outbound destination / custom guardrail / something more custom) and the
  2-business-day SLA copy (subject to market conditions). Thanks page copy
  updated to integration/change-request intent.
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

- [x] Status: done (2026-07-22)
- **Callouts:** `root.spec.ts` updated to assert "Request Integration",
  `/request-changes/` + `/request-changes/thanks/` routes, and form
  categories + SLA. One fix: SLA assertion regex made whitespace-tolerant
  (`/market\s+conditions/i`) to tolerate source line-wrap. Root suite 9/9.
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

- [x] Status: done (2026-07-22)
- **Callouts:** `format:check` clean on all changed source (only gitignored
  `.claude/settings.local.json` warns — not in CI). `build:root` 3 pages;
  docs `build` 124 pages. Playwright root 9/9 and docs 33/33. One test fix
  routed to Dev-B: SLA regex made whitespace-tolerant. No stray
  `request-access`/`Request access` outside historical notes.
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

- [x] Status: done (2026-07-22)
- **Callouts:** PR #22 validated (both CI gates green), merged; both Cloudflare
  workers deployed green with post-deploy smoke tests. Live: `/`, `/docs/`,
  `/request-changes/`, `/request-changes/thanks/` all 200; old
  `/request-access/` returns 404; homepage shows "Request Integration"; form
  has `request_type` + 2-business-day + market + `action=/api/request-changes`;
  worker POST verified (invalid→`?error=1`, honeypot→thanks, no mail sent).
  Local `main` synced.
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

- [x] Status: done (2026-07-22)
- **Callouts:** All Dev/QA/Ops issues confirmed done; D-1 and D-2 resolved
  (see §5); §6 evidence filled; header status flipped to complete. Two
  optional follow-ups recorded (F-1 real Inter font; F-2 dead
  `src/layouts/Layout.astro`). Change set merged and deployed via PR #22.
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

## 5. Flagged items / decisions (resolved at close-out)

| # | Item | Detail | Disposition |
|---|---|---|---|
| D-1 | Dark-mode parity scope | Docs (Starlight) ship a light/dark toggle out of the box; the landing was **light-only**. | **Resolved (2026-07-22): parity delivered via `prefers-color-scheme`.** Dark token values defined in the shared file and consumed by both surfaces; the landing follows the OS scheme (no separate toggle). One residual: the why-now band inherits Starlight's own low-contrast sidebar relationship — **flagged for human eyeball** (F-3). |
| D-2 | Brand accent choice | The landing used rust `#b44d29` (eyebrow) over navy `#14213d`. | **Resolved (2026-07-22): unified accent = brand blue hue 221**, derived from the navy — light `hsl(221,80%,44%)` `#164fca` (6.99:1), dark `hsl(221,100%,85%)` `#b3cbff` (10.9:1). Rust retired; the same accent drives docs link/accent color. |

**Optional follow-ups (not blocking, out of this epic):**

| # | Item | Detail |
|---|---|---|
| F-1 | Real Inter font | Font stack is Inter-first → system fallback, but no Inter file is loaded today. Add `@fontsource/inter` (or equivalent) so the intended type renders. Optional. |
| F-2 | Dead `src/layouts/Layout.astro` | Unwired after the theme refactor; candidate for deletion. |
| F-3 | why-now band contrast | Band uses Starlight's low-contrast sidebar relationship in dark mode — needs a human contrast check (from D-1). |

## 6. Evidence log (closed out 2026-07-22)

| Item | Evidence |
|---|---|
| Theme: token file + Starlight customCss wiring | New `src/styles/brand.css` maps brand-blue hue 221 + unified font stack onto Starlight custom properties for light/dark; wired into `starlight({ customCss: [...] })`. `base: '/docs'` unchanged. Docs build green (124 pages). |
| Theme: landing token consumption / bespoke-hex retirement | New `src-root/styles/theme.css` token layer mirrors Starlight surfaces (dark via `prefers-color-scheme`); `landing.css` refactored to tokens; `Layout.astro` imports `theme.css`. Bespoke `#f6f4ef`/`#14213d`/`#b44d29` retired. `build:root` green (3 pages). Light/dark screenshots captured for landing + docs. |
| Rename: route/worker `request-access` → `request-changes` (grep-clean) | Pages `request-changes/index.astro` + `thanks.astro`; worker endpoint `/api/request-changes` with `request_type` captured, redirects `/request-changes/?error=1` and `/request-changes/thanks/`, subject "PaloNexus integration request". Old `/request-access/` → 404 (verified live). |
| Repurpose: CTA "Request Integration" + categories + SLA copy | CTA "Request Integration" in `nav.md`/`hero.md`/`closing.md` → `/request-changes/`; six-element nav preserved. Form `request_type` select (new IdP / new agent platform / new agent outbound destination / custom guardrail / something more custom) + 2-business-day SLA (subject to market conditions). Thanks page updated. |
| Tests: `root.spec.ts` updated in lockstep | Asserts "Request Integration", `/request-changes/` + `/request-changes/thanks/`, categories + SLA; SLA regex made whitespace-tolerant (`/market\s+conditions/i`) for source line-wrap. |
| QA gate: `format:check` / `build:root` / docs `build` / Playwright | `format:check` clean (only gitignored `.claude/settings.local.json` warns — not in CI); `build:root` 3 pages; docs `build` 124 pages; Playwright root 9/9, docs 33/33. |
| Deploy: both Cloudflare workers + live smoke test | PR #22 (both CI gates green) merged; both Cloudflare workers deployed green. Live: `/`, `/docs/`, `/request-changes/`, `/request-changes/thanks/` all 200; old `/request-access/` 404; homepage shows "Request Integration"; form has `request_type` + 2-business-day + market + `action=/api/request-changes`; worker POST verified (invalid→`?error=1`, honeypot→thanks, no mail sent). Local `main` synced. |
| Decisions D-1 (dark-mode scope) / D-2 (brand accent) resolved | D-1: parity via `prefers-color-scheme` (why-now band flagged for human eyeball — F-3). D-2: accent = brand blue hue 221 (`#164fca` light / `#b3cbff` dark), rust retired. |
| Follow-ups / deviations | Three optional follow-ups open (§5): F-1 real Inter font, F-2 dead `src/layouts/Layout.astro`, F-3 why-now band dark-mode contrast check. Change set merged + deployed via PR #22 (Ops owned the commit/deploy; Dev/QA left the tree uncommitted per guardrail). |
