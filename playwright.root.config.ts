import { defineConfig, devices } from '@playwright/test';

// End-to-end tests for the marketing root (palonexus.ai). These build the static root
// site and serve it with `astro preview` (base path "/"), then drive it in a real
// Chromium browser. CI gates deployment on these passing — see
// .github/workflows/root-ci-deploy.yml. Kept in a separate test dir (tests/e2e-root)
// from the docs suite (tests/e2e) so `npm run test:e2e` never picks up root specs and
// vice versa.

const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: './tests/e2e-root',
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
	webServer: {
		command: 'npm run preview:root',
		url: `${BASE_URL}/`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		stdout: 'pipe',
		stderr: 'pipe',
	},
});
