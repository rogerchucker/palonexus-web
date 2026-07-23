import { defineConfig, devices } from '@playwright/test';

// End-to-end documentation tests. These build and stage the docs Worker artifact
// (base path "/docs"), then serve it with Wrangler before driving a real browser.
// CI gates deployment on these passing — see .github/workflows/docs-ci-deploy.yml.

const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	// Never let a stray test.only land in CI.
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	timeout: 30_000,
	expect: { timeout: 10_000 },
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	// The docs Worker artifact excludes the unified marketing root and supplies the
	// /docs/ redirect expected by the rollback deployment.
	webServer: {
		command:
			'npm run build && npm run stage:docs && node scripts/serve-static.mjs dist-deploy 4321',
		url: `${BASE_URL}/docs/`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		stdout: 'pipe',
		stderr: 'pipe',
	},
});
