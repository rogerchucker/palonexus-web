import { defineConfig, devices } from '@playwright/test';

// End-to-end documentation tests. These build the static docs site and serve it with
// `astro preview` (base path "/docs"), then drive it in a real Chromium browser.
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
	// `npm run preview` builds the site then serves it. The url uses the "/docs" base
	// because the site root (/) is not owned by this build.
	webServer: {
		command: 'npm run preview',
		url: `${BASE_URL}/docs/`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
		stdout: 'pipe',
		stderr: 'pipe',
	},
});
