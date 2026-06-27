#!/usr/bin/env node
/**
 * Manual publishing is intentionally disabled.
 *
 * The PaloNexus docs site is deployed ONLY by the GitHub Actions pipeline
 * (.github/workflows/docs-ci-deploy.yml) on push to `main`, and only after the
 * validate gate (Prettier + docs build + Playwright E2E) passes.
 *
 * Cloudflare credentials live exclusively in GitHub Actions secrets, not on laptops,
 * so there is no supported way to publish from a developer machine.
 */
console.error(
	[
		'',
		'  ✖ Manual deploy is disabled.',
		'',
		'  The docs are published only by CI on push to main, after E2E tests pass.',
		'  To release: open a PR, get it green + reviewed, and merge to main.',
		'  CI then runs: validate → deploy → post-deploy verify.',
		'',
		'  Validate locally instead:',
		'    npm run validate     # Prettier check + docs build + Playwright E2E',
		'    npm run preview      # serve the built site at http://localhost:4321/docs/',
		'',
		'  See: src/content/docs/operations/releasing-the-docs.md',
		'',
	].join('\n'),
);
process.exit(1);
