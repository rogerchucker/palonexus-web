import { test, expect, type Page } from '@playwright/test';

// End-to-end checks for the published marketing root (palonexus.ai). If any of these
// fail to render, deployment must be blocked — see .github/workflows/root-ci-deploy.yml.

const SECTION_ANCHORS = ['#solutions', '#platform', '#governance'];

const IGNORED_CONSOLE = [/favicon\.ico/i];

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

test.describe('marketing root renders', () => {
	test('homepage loads with title, heading, and every section', async ({ page }) => {
		const errors = trackErrors(page);
		const res = await page.goto('/', { waitUntil: 'networkidle' });
		expect(res?.status(), 'homepage HTTP status').toBeLessThan(400);
		await expect(page).toHaveTitle(/PaloNexus/i);
		await expect(page.locator('h1').first()).toHaveText(
			/Build, govern, and scale enterprise AI agents\./,
		);

		for (const anchor of SECTION_ANCHORS) {
			await expect(page.locator(anchor)).toBeAttached();
		}

		expect(severe(errors), `console errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('nav anchors scroll to the right section', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		for (const anchor of SECTION_ANCHORS) {
			await page.locator(`.nav-links a[href="${anchor}"]`).click();
			await expect(page).toHaveURL(new RegExp(`\\${anchor}$`));
			await expect(page.locator(anchor)).toBeInViewport();
		}
	});

	test('primary CTAs point at the request-access mailto', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		const ctas = page.locator('a[href="mailto:rajarshi@remrem.org"]');
		expect(await ctas.count()).toBeGreaterThanOrEqual(3);
	});
});
