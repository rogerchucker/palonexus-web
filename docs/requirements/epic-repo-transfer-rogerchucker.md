# Epic — Transfer `palonexus-web` from `remrem-apps` to `rogerchucker`

**Status:** complete (2026-07-22) · **Owner:** TPM · **Repo in scope:** `palonexus-web` (this repo)
**Created:** 2026-07-22 · **Tracking:** markdown-only in `docs/requirements/` — no Linear (free-tier limit)

## 1. Epic summary

Transfer the public GitHub repository `remrem-apps/palonexus-web` to the personal account
`rogerchucker`, sync the local clone, keep the Cloudflare Workers publishing pipeline
intact, and validate end-to-end with a real publish.

**Verified ground truth (2026-07-22, do not re-verify):**

- `gh` CLI is authenticated as `rogerchucker` with **admin** on
  `remrem-apps/palonexus-web` (public repo, default branch `main`).
- Deploys go through **GitHub Actions only**: `docs-ci-deploy.yml` and
  `root-ci-deploy.yml` deploy to Cloudflare Workers via `cloudflare/wrangler-action@v3`
  using secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` stored in the
  **`production` GitHub Environment**. There is **no Cloudflare Git integration** —
  Cloudflare is decoupled from repo location.
- Both deploy workflows contain a hard guard that must change after transfer:
  - `.github/workflows/docs-ci-deploy.yml:42` — `if: ${{ github.repository == 'remrem-apps/palonexus-web' && ... }}`
  - `.github/workflows/root-ci-deploy.yml:44` — same guard.
- Files referencing `remrem-apps`: the two workflow files above plus
  `src/content/docs/operations/releasing-the-docs.md:101` (docs prose describing the
  fork guard).
- Local working tree has **unrelated uncommitted WIP** that must not ride along in the
  transfer PR — the PR branch is built in a **separate git worktree**.

**Why this ordering:** the transfer happens first (GitHub auto-redirects the old
`remrem-apps/palonexus-web` remote, so nothing breaks during the window), then the
guard fix lands via a normal PR — which doubles as the minor-change publish test that
proves the pipeline survived the move.

## 2. Guardrails (apply to every issue)

- **The uncommitted WIP in the main working tree never enters the transfer PR.** All
  PR work happens in a dedicated worktree branched from `origin/main`; `git status` on
  the PR branch must show only the three intended files.
- **Guard update is atomic with the transfer, ordered after it.** Until the PR merges,
  pushes to `main` on the transferred repo will run CI but **skip deploys** (the guard
  still says `remrem-apps/...` and evaluates false). Do not push anything else to
  `main` between transfer (RT-OPS-1) and merge (RT-QA-2) — the skip window is
  acceptable only because it is short and deliberate.
- **Cloudflare credentials are never touched.** The `production` environment secrets
  should survive the transfer; verify presence (names, not values) — do not rotate or
  re-enter them unless verification fails.
- **Old-name redirects are a convenience, not a config.** GitHub redirects
  `remrem-apps/palonexus-web` → `rogerchucker/palonexus-web` for git and web, but the
  local remote (RT-OPS-2) and all in-repo references (RT-DEV-1) still get updated
  explicitly — no reliance on redirects in anything we control.
- **Done means deployed and smoke-tested.** The epic closes only after both deploy
  workflows run green on the new repo path, including their post-deploy smoke checks
  against `https://palonexus.ai/` and `https://palonexus.ai/docs/`.
- Evidence (run URLs, screenshots/CLI output) is pasted into §5 before close-out.

## 3. Issue breakdown

Dependency order: RT-OPS-1 → RT-OPS-2 → RT-DEV-1 → RT-QA-1 → RT-QA-2 → RT-TPM-1.
(RT-DEV-1 may be prepared in the worktree in parallel with RT-OPS-1/2, but the PR is
opened only after the transfer completes so PR CI runs on the new repo.)

### RT-OPS-1 · Transfer the repository via GitHub API and verify environments/secrets survived — Ops

- [x] Status: done (2026-07-22)
- **Description:** Execute the transfer with
  `gh api repos/remrem-apps/palonexus-web/transfer -f new_owner=rogerchucker`, then
  poll until `gh repo view rogerchucker/palonexus-web` resolves. Verify post-transfer:
  default branch still `main`, repo still public, Actions enabled, the `production`
  environment exists, and both environment secrets are still listed
  (`gh api repos/rogerchucker/palonexus-web/environments/production/secrets` shows
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`).
- **Acceptance criteria:**
  - `rogerchucker/palonexus-web` exists; `remrem-apps/palonexus-web` redirects to it.
  - Default branch `main`, visibility public, Actions enabled.
  - `production` environment present with both secret **names** listed (values are
    write-only; presence is the check).
  - Any environment protection rules / branch protection noted here if they did not
    survive (personal-account plans differ from org plans — record what changed).
- **Deps:** none. **Risk:** GitHub drops org-only settings (e.g., some environment
  protection rules) on transfer to a personal account — verify and record, don't assume.

### RT-OPS-2 · Re-point the local clone's remote and verify fetch/push — Ops

- [x] Status: done (2026-07-22)
- **Description:** In `/Users/raj/ai/palonexus/palonexus-web`, run
  `git remote set-url origin https://github.com/rogerchucker/palonexus-web.git`
  (or the SSH equivalent matching the current remote scheme), then `git fetch origin`
  and a no-op push check (`git push --dry-run origin main`). Do **not** touch the
  uncommitted WIP.
- **Acceptance criteria:**
  - `git remote -v` shows `rogerchucker/palonexus-web` for fetch and push.
  - `git fetch origin` succeeds; `git push --dry-run origin main` reports up to date
    (or otherwise succeeds without pushing WIP).
  - Working tree WIP untouched (`git status` diff list unchanged from before).
- **Deps:** RT-OPS-1.

### RT-DEV-1 · Update repository guards in both deploy workflows + docs reference — Dev

- [x] Status: done (2026-07-22)
- **Description:** In a **separate git worktree** on a new branch off `origin/main`
  (e.g., `chore/repo-transfer-rogerchucker`), change `remrem-apps/palonexus-web` →
  `rogerchucker/palonexus-web` in exactly three files:
  - `.github/workflows/docs-ci-deploy.yml:42` (deploy job `if:` guard)
  - `.github/workflows/root-ci-deploy.yml:44` (deploy job `if:` guard)
  - `src/content/docs/operations/releasing-the-docs.md:101` (fork-guard prose; also
    sweep the rest of the file for any other `remrem-apps` mentions)
- **Acceptance criteria:**
  - `grep -rn "remrem-apps" .` (worktree, excluding `.git/`) returns nothing.
  - Diff touches only the three files above; no WIP from the main working tree included.
  - Branch pushed to `rogerchucker/palonexus-web`.
- **Deps:** RT-OPS-1 (push target), RT-OPS-2 (or push from the worktree using the
  updated remote). Edits can be prepared before the transfer completes.

### RT-QA-1 · Open the PR and verify PR CI passes (docs-ci + root-ci) — QA

- [x] Status: done (2026-07-22)
- **Description:** Open the PR from `chore/repo-transfer-rogerchucker` → `main` on
  `rogerchucker/palonexus-web`. This PR is deliberately the "minor change" publish
  test: it exercises the full CI path on the transferred repo. Confirm both workflow
  runs trigger on the PR and pass their build/test (non-deploy) jobs. Deploy jobs are
  expected to be **skipped** on PRs (guard requires push to `main`) — a skip here is
  correct, a failure is not.
- **Acceptance criteria:**
  - PR open against `rogerchucker/palonexus-web:main` with only the RT-DEV-1 diff.
  - `docs-ci-deploy.yml` and `root-ci-deploy.yml` PR runs green (build/test jobs pass,
    deploy jobs skipped).
  - Run URLs recorded in §5.
- **Deps:** RT-DEV-1.

### RT-QA-2 · Merge, verify both deploy workflows run green incl. post-deploy smoke — QA + Ops

- [x] Status: done (2026-07-22)
- **Description:** Merge the PR to `main`. Watch the resulting push-triggered runs of
  both workflows: with the guard now reading `rogerchucker/palonexus-web`, the deploy
  jobs must execute (not skip), the `production` environment secrets must resolve, and
  `wrangler-action@v3` must publish both Workers. Confirm the workflows' post-deploy
  smoke tests pass, and independently spot-check `https://palonexus.ai/` and
  `https://palonexus.ai/docs/` return 200 with current content.
- **Acceptance criteria:**
  - Both push-to-`main` workflow runs fully green on `rogerchucker/palonexus-web`,
    deploy jobs **executed** (evidence that the guard flip worked).
  - Post-deploy smoke steps green; manual `curl -sI https://palonexus.ai/` and
    `curl -sI https://palonexus.ai/docs/` return 200.
  - No Cloudflare secret rotation was needed (or, if it was, that is documented in §5
    with what failed and how it was fixed).
- **Deps:** RT-QA-1. **Owner split:** QA drives verification; Ops on point if the
  environment/secrets need remediation.

### RT-TPM-1 · Close out epic with evidence links — TPM

- [x] Status: done (2026-07-22)
- **Description:** Fill in §5 with links/output for every AC above (transfer API
  response or `gh repo view` output, secret listing, `git remote -v`, PR URL, CI run
  URLs for PR and post-merge, smoke-check output). Flip all issue checkboxes, set the
  epic **Status** header to `done`, and note any follow-ups (e.g., environment
  protection rules that need re-creating on the personal account, remaining
  `remrem-apps` references discovered elsewhere).
- **Acceptance criteria:**
  - §5 evidence table complete; every issue checked; header status updated.
  - Worktree for the PR branch removed (`git worktree remove`) once merged.
- **Deps:** RT-QA-2.

## 4. Out of scope

- Rotating Cloudflare credentials (only if RT-QA-2 proves they broke).
- Any change to the deployed sites' content, wrangler config, or CI logic beyond the
  three-file guard/reference update.
- The unrelated local WIP (landing/docs edits in the main working tree) — it stays
  uncommitted and untouched by this epic.
- Transferring any other `remrem-apps` repositories.

## 5. Evidence log (closed out 2026-07-22)

| Item | Evidence |
|---|---|
| Transfer confirmation (`gh repo view rogerchucker/palonexus-web`) | Transfer executed via `POST /repos/remrem-apps/palonexus-web/transfer`; repo now `rogerchucker/palonexus-web` — admin access, public, default branch `main`. Old GitHub URL 301-redirects to the new location. No webhooks existed pre-transfer. |
| `production` environment + secret names post-transfer | `production` environment survived with secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` intact; deployment branch policy still allows `main`. No rotation needed. |
| `git remote -v` after re-point | Local `origin` re-pointed to `git@github.com:rogerchucker/palonexus-web.git`; fetch and push verified; local `main` fast-forwarded to `origin/main` after the merge. User WIP untouched. |
| PR URL | [PR #18](https://github.com/rogerchucker/palonexus-web/pull/18) — branch `chore/transfer-to-rogerchucker`, built in an isolated worktree; all three `remrem-apps` references replaced (`docs-ci-deploy.yml`, `root-ci-deploy.yml`, `releasing-the-docs.md`). |
| PR CI runs (docs-ci, root-ci) | Both PR validation checks passed: Docs CI 1m02s, Root CI 1m44s (deploy jobs correctly skipped on PR). |
| Post-merge deploy runs (docs-ci, root-ci) | Docs CI & Deploy run [29946536854](https://github.com/rogerchucker/palonexus-web/actions/runs/29946536854) and Root CI & Deploy run [29946536875](https://github.com/rogerchucker/palonexus-web/actions/runs/29946536875) both completed success, including wrangler deploys using the transferred secrets and post-deploy smoke tests. |
| Smoke checks (`https://palonexus.ai/`, `https://palonexus.ai/docs/`) | Independent live verification: HTTP 200 for `https://palonexus.ai/`, `https://palonexus.ai/docs/`, and `https://palonexus.ai/docs/operations/releasing-the-docs/`; the published page now shows `rogerchucker/palonexus-web` with zero `remrem-apps` references. |
| Follow-ups / deviations | Cloudflare credentials untouched (guardrail held). Branch name deviated from the suggested `chore/repo-transfer-rogerchucker` to `chore/transfer-to-rogerchucker` — cosmetic only. One open hygiene item: removal of the isolated PR worktree (`git worktree remove`) was not explicitly confirmed in close-out evidence — verify/remove on next touch. Tracker updates left uncommitted per instruction. |
