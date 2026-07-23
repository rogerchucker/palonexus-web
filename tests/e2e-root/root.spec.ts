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
		await expect(page.locator('.hero-lede')).toContainText(
			'developer SDK, the enforcement Control Plane, and the security Command Center',
		);

		for (const anchor of SECTION_ANCHORS) {
			await expect(page.locator(anchor)).toBeAttached();
		}

		expect(severe(errors), `console errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('hero carries the connected product-surface distinction', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		const lines = page.locator('.hero-distinction li');
		await expect(lines).toHaveCount(3);
		await expect(lines.nth(0)).toContainText('Integrate — SDK');
		await expect(lines.nth(0)).toContainText('developers and agent owners');
		await expect(lines.nth(1)).toContainText('Enforce — Control Plane');
		await expect(lines.nth(1)).toContainText('platform operations');
		await expect(lines.nth(2)).toContainText('Observe — Command Center');
		await expect(lines.nth(2)).toContainText('security teams and leaders');
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

	test('command-center section renders with heading and a live portal capture', async ({
		page,
	}) => {
		const errors = trackErrors(page);
		await page.goto('/', { waitUntil: 'networkidle' });
		const section = page.locator('#command-center');
		await expect(section).toBeAttached();
		await expect(
			section.getByRole('heading', {
				name: 'Give security teams one view of agent authority and accountability.',
			}),
		).toBeVisible();
		// The DOKS portal capture must actually decode — a broken <img> would render
		// the section as an empty frame. The image is lazy-loaded, so scroll first.
		const img = section.locator('img').first();
		await img.scrollIntoViewIfNeeded();
		await expect(img).toBeVisible();
		await expect
			.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
				message: 'command-center screenshot decoded (naturalWidth > 0)',
			})
			.toBeGreaterThan(0);
		// Honesty rules: the only forward-looking line is the explicit "Planned next:"
		// sentence, and the section carries no planned-tags (those live in works-with).
		await expect(section.locator('.command-center-next')).toContainText(/^Planned next:/);
		await expect(section.locator('.planned-tag')).toHaveCount(0);
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

	test('primary CTAs point at the request-changes page and docs are linked', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		// Nav CTA, hero primary, and closing CTA all route to the on-site form.
		const ctas = page.locator('a[href="/request-changes/"]');
		expect(await ctas.count()).toBeGreaterThanOrEqual(3);
		// The nav CTA reads "Request Integration".
		await expect(page.locator('a.nav-cta[href="/request-changes/"]')).toContainText(
			'Request Integration',
		);
		// The hero secondary CTA and the closing link to the docs root (/docs/, which
		// redirects to Overview); the nav "Docs" button goes straight to the Overview page.
		const docsLinks = page.locator('a[href="/docs/"]');
		expect(await docsLinks.count()).toBeGreaterThanOrEqual(2);
		await expect(page.locator('.nav-links a[href="/docs/getting-started/overview/"]')).toHaveText(
			'Docs',
		);
	});

	test('request-changes page renders the form with spam guard and email fallback', async ({
		page,
	}) => {
		const errors = trackErrors(page);
		const res = await page.goto('/request-changes/', { waitUntil: 'networkidle' });
		expect(res?.status(), 'request-changes HTTP status').toBeLessThan(400);
		const form = page.locator('form.request-form');
		await expect(form).toBeAttached();
		await expect(form).toHaveAttribute('action', '/api/request-changes');
		await expect(form).toHaveAttribute('method', 'post');
		await expect(form.locator('input[name="name"]')).toHaveAttribute('required', '');
		await expect(form.locator('input[name="email"]')).toHaveAttribute('required', '');
		await expect(form.locator('textarea[name="details"]')).toBeAttached();
		// The request-type select is present with its options.
		await expect(form.locator('select[name="request_type"]')).toBeAttached();
		// The 2-business-day SLA copy is stated, market-conditions caveat included.
		const main = page.locator('main.request-access');
		await expect(main).toContainText(/2[\s-]business[\s-]day/i);
		await expect(main).toContainText(/market\s+conditions/i);
		// Honeypot present but not visible to humans.
		await expect(form.locator('input[name="website"]')).toBeAttached();
		await expect(form.locator('input[name="website"]')).not.toBeInViewport();
		// The error banner stays hidden unless the worker redirects back with ?error=1.
		await expect(page.locator('.form-error')).not.toBeVisible();
		// Email fallback stays available for people who prefer it.
		await expect(page.locator('a[href="mailto:support@palonexus.ai"]').first()).toBeAttached();
		expect(severe(errors), `console errors:\n${errors.join('\n')}`).toEqual([]);
	});

	test('request-changes error state shows the fallback banner', async ({ page }) => {
		await page.goto('/request-changes/?error=1', { waitUntil: 'domcontentloaded' });
		await expect(page.locator('.form-error')).toBeVisible();
	});

	test('request-changes thanks page renders with a docs pointer', async ({ page }) => {
		const res = await page.goto('/request-changes/thanks/', { waitUntil: 'domcontentloaded' });
		expect(res?.status(), 'thanks HTTP status').toBeLessThan(400);
		await expect(page.locator('h1')).toContainText(/Thanks/);
		await expect(page.locator('a[href="/docs/"]').first()).toBeAttached();
	});
});
