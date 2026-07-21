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
			/Give AI agents authority without giving them standing access\./,
		);
		// The §15 one-sentence product line must stay verbatim in the hero lede.
		await expect(page.locator('.hero-lede')).toContainText(
			'entitled to delegate—and only for the task, resource, and time originally approved',
		);

		for (const anchor of SECTION_ANCHORS) {
			await expect(page.locator(anchor)).toBeAttached();
		}

		expect(severe(errors), `console errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('hero carries the runtime / sandbox / PaloNexus three-line distinction', async ({
		page,
	}) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		const lines = page.locator('.hero-distinction li');
		await expect(lines).toHaveCount(3);
		await expect(lines.nth(0)).toContainText('Agent runtimes');
		await expect(lines.nth(0)).toContainText('decide how an agent works');
		await expect(lines.nth(1)).toContainText('Sandboxes');
		await expect(lines.nth(1)).toContainText('decide where its code runs');
		await expect(lines.nth(2)).toContainText('PaloNexus');
		await expect(lines.nth(2)).toContainText('authorized to do');
	});

	test('works-with section lists working and planned ecosystems honestly', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		const section = page.locator('section.works-with');
		await expect(section).toBeAttached();
		await expect(section.locator('.works-with-group').first()).toContainText('Working today');
		// Every planned ecosystem must carry an explicit "Planned" marker (honesty rule).
		const plannedGroup = section.locator('.works-with-group.planned');
		await expect(plannedGroup).toContainText('kagent');
		await expect(plannedGroup).toContainText('Agent Sandbox');
		await expect(plannedGroup).toContainText('OpenAI Agents SDK');
		await expect(plannedGroup).toContainText('MCP');
		await expect(plannedGroup.locator('.planned-tag')).toHaveCount(4);
	});

	test('nav anchors scroll to the right section', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		for (const anchor of SECTION_ANCHORS) {
			await page.locator(`.nav-links a[href="${anchor}"]`).click();
			await expect(page).toHaveURL(new RegExp(`\\${anchor}$`));
			await expect(page.locator(anchor)).toBeInViewport();
		}
	});

	test('primary CTAs point at the request-access page and docs are linked', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		// Nav CTA, hero primary, and closing CTA all route to the on-site form.
		const ctas = page.locator('a[href="/request-access/"]');
		expect(await ctas.count()).toBeGreaterThanOrEqual(3);
		// Docs are reachable from the nav, the hero secondary CTA, and the closing.
		const docsLinks = page.locator('a[href="/docs/"]');
		expect(await docsLinks.count()).toBeGreaterThanOrEqual(2);
		await expect(page.locator('.nav-links a[href="/docs/"]')).toHaveText('Docs');
	});

	test('request-access page renders the form with spam guard and email fallback', async ({
		page,
	}) => {
		const errors = trackErrors(page);
		const res = await page.goto('/request-access/', { waitUntil: 'networkidle' });
		expect(res?.status(), 'request-access HTTP status').toBeLessThan(400);
		const form = page.locator('form.request-form');
		await expect(form).toBeAttached();
		await expect(form).toHaveAttribute('action', '/api/request-access');
		await expect(form).toHaveAttribute('method', 'post');
		await expect(form.locator('input[name="name"]')).toHaveAttribute('required', '');
		await expect(form.locator('input[name="email"]')).toHaveAttribute('required', '');
		await expect(form.locator('textarea[name="details"]')).toBeAttached();
		// Honeypot present but not visible to humans.
		await expect(form.locator('input[name="website"]')).toBeAttached();
		await expect(form.locator('input[name="website"]')).not.toBeInViewport();
		// The error banner stays hidden unless the worker redirects back with ?error=1.
		await expect(page.locator('.form-error')).not.toBeVisible();
		// Email fallback stays available for people who prefer it.
		await expect(page.locator('a[href="mailto:support@palonexus.ai"]').first()).toBeAttached();
		expect(severe(errors), `console errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('request-access error state shows the fallback banner', async ({ page }) => {
		await page.goto('/request-access/?error=1', { waitUntil: 'domcontentloaded' });
		await expect(page.locator('.form-error')).toBeVisible();
	});

	test('request-access thanks page renders with a docs pointer', async ({ page }) => {
		const res = await page.goto('/request-access/thanks/', { waitUntil: 'domcontentloaded' });
		expect(res?.status(), 'thanks HTTP status').toBeLessThan(400);
		await expect(page.locator('h1')).toContainText(/Thanks/);
		await expect(page.locator('a[href="/docs/"]').first()).toBeAttached();
	});
});
