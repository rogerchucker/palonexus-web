#!/usr/bin/env node
/**
 * Manual publishing is intentionally disabled.
 *
 * Both PaloNexus sites — docs (.github/workflows/docs-ci-deploy.yml) and the marketing
 * root (.github/workflows/root-ci-deploy.yml) — are deployed ONLY by GitHub Actions on
 * push to `main`, and only after their respective validate gate passes.
 *
 * Cloudflare credentials live exclusively in GitHub Actions secrets, not on laptops,
 * so there is no supported way to publish from a developer machine.
 */
const site = process.argv[2] === 'root' ? 'root' : 'docs';

const bySite = {
	docs: {
		validate: 'npm run validate     # Prettier check + docs build + Playwright E2E',
		preview: 'npm run preview      # serve the built site at http://localhost:4321/docs/',
		guide: 'src/content/docs/operations/releasing-the-docs.md',
	},
	root: {
		validate: 'npm run validate:root  # Prettier check + root build + Playwright E2E',
		preview: 'npm run preview:root   # serve the built site at http://localhost:4321/',
		guide: '.github/workflows/root-ci-deploy.yml',
	},
};

const copy = bySite[site];

console.error(
	[
		'',
		'  ✖ Manual deploy is disabled.',
		'',
		`  The ${site} site is published only by CI on push to main, after E2E tests pass.`,
		'  To release: open a PR, get it green + reviewed, and merge to main.',
		'  CI then runs: validate → deploy → post-deploy verify.',
		'',
		'  Validate locally instead:',
		`    ${copy.validate}`,
		`    ${copy.preview}`,
		'',
		`  See: ${copy.guide}`,
		'',
	].join('\n'),
);
process.exit(1);
