import { test, expect, type Page } from '@playwright/test';

// End-to-end checks for the published documentation site. Every page listed here is a
// "critical" surface: if any of these fail to render, deployment must be blocked.

const HOMEPAGE = '/docs/';

// Developer-facing integration + SDK docs.
const DEVELOPER_PAGES = [
	{ path: '/docs/develop/', label: 'Developer Integration index' },
	{ path: '/docs/develop/deploy-an-agent/', label: 'Deploy an agent' },
	{ path: '/docs/sdk/', label: 'SDK index' },
	{ path: '/docs/sdk/agentdid/', label: 'AgentDID SDK' },
];

// Operator / self-hosting docs.
const OPERATOR_PAGES = [
	{ path: '/docs/operations/', label: 'Operations index' },
	{ path: '/docs/operations/self-hosting/', label: 'Self-hosting' },
	{ path: '/docs/operations/doks-runbook/', label: 'DOKS runbook' },
];

// Pages that embed Mermaid diagrams. astro-mermaid emits `<pre class="mermaid">` which
// mermaid.js renders client-side into an inline <svg>; we assert that render succeeds.
const DIAGRAM_PAGES = ['/docs/concepts/architecture/', '/docs/develop/autonomous-flow/'];

// Console noise we deliberately tolerate — environment-dependent and non-fatal.
const IGNORED_CONSOLE = [/favicon\.ico/i, /pagefind/i];

function trackErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
	page.on('console', (msg) => {
		if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
	});
	return errors;
}

function severe(errors: string[]): string[] {
	return errors.filter((e) => !IGNORED_CONSOLE.some((re) => re.test(e)));
}

test.describe('critical pages render', () => {
	test('homepage loads with title and heading', async ({ page }) => {
		const errors = trackErrors(page);
		const res = await page.goto(HOMEPAGE, { waitUntil: 'networkidle' });
		expect(res?.status(), 'homepage HTTP status').toBeLessThan(400);
		await expect(page).toHaveTitle(/PaloNexus/i);
		await expect(page.locator('h1').first()).toBeVisible();
		expect(severe(errors), `console errors:\n${errors.join('\n')}`).toEqual([]);
	});

	for (const { path, label } of DEVELOPER_PAGES) {
		test(`developer page loads: ${label}`, async ({ page }) => {
			const errors = trackErrors(page);
			const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
			expect(res?.status(), `${path} status`).toBeLessThan(400);
			await expect(page.locator('main')).toBeVisible();
			await expect(page.locator('h1').first()).toBeVisible();
			expect(severe(errors), `console errors on ${path}:\n${errors.join('\n')}`).toEqual([]);
		});
	}

	for (const { path, label } of OPERATOR_PAGES) {
		test(`operator page loads: ${label}`, async ({ page }) => {
			const errors = trackErrors(page);
			const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
			expect(res?.status(), `${path} status`).toBeLessThan(400);
			await expect(page.locator('main')).toBeVisible();
			await expect(page.locator('h1').first()).toBeVisible();
			expect(severe(errors), `console errors on ${path}:\n${errors.join('\n')}`).toEqual([]);
		});
	}
});

test.describe('navigation', () => {
	test('sidebar link navigates to another doc', async ({ page }) => {
		// Start on a content page (the splash homepage hides the sidebar).
		await page.goto('/docs/develop/', { waitUntil: 'domcontentloaded' });
		const link = page.locator('a[href$="/docs/operations/self-hosting/"]').first();
		await expect(link).toBeVisible();
		await link.click();
		await expect(page).toHaveURL(/\/docs\/operations\/self-hosting\/?$/);
		await expect(page.locator('h1').first()).toBeVisible();
	});

	test('a homepage content link resolves to a real page', async ({ page }) => {
		await page.goto(HOMEPAGE, { waitUntil: 'domcontentloaded' });
		const link = page.locator('main a[href*="/docs/"]').first();
		await expect(link).toBeVisible();
		const href = await link.getAttribute('href');
		const res = await page.goto(href!, { waitUntil: 'domcontentloaded' });
		expect(res?.status(), `link ${href}`).toBeLessThan(400);
		await expect(page.locator('h1').first()).toBeVisible();
	});
});

test.describe('mermaid diagrams', () => {
	for (const path of DIAGRAM_PAGES) {
		test(`diagram renders without breaking the page: ${path}`, async ({ page }) => {
			const errors = trackErrors(page);
			await page.goto(path, { waitUntil: 'networkidle' });
			const container = page.locator('pre.mermaid, .mermaid').first();
			await expect(container, 'mermaid container present').toBeVisible();
			// Client-side render replaces the fence content with an <svg>.
			await expect(container.locator('svg').first(), 'rendered Mermaid <svg>').toBeVisible({
				timeout: 15_000,
			});
			await expect(page.locator('h1').first()).toBeVisible();
			expect(severe(errors), `console errors on ${path}:\n${errors.join('\n')}`).toEqual([]);
		});
	}
});
