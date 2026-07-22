import { test, expect, type Page } from '@playwright/test';

// End-to-end checks for the published documentation site. Every page listed here is a
// "critical" surface: if any of these fail to render, deployment must be blocked.

const HOMEPAGE = '/docs/';

// Developer-facing integration + SDK docs.
const DEVELOPER_PAGES = [
	{ path: '/docs/getting-started/quickstart/', label: 'Quickstart (tabbed, Epic 30)' },
	{ path: '/docs/develop/', label: 'Developer Integration index' },
	{ path: '/docs/develop/deploy-an-agent/', label: 'Deploy an agent' },
	{ path: '/docs/sdk/', label: 'SDK index' },
	{ path: '/docs/sdk/agentdid/', label: 'AgentDID SDK' },
	{ path: '/docs/getting-started/what-palonexus-is-not/', label: 'What PaloNexus is not' },
	{ path: '/docs/concepts/identity-and-credentials/', label: 'Identity & credentials (merged)' },
	{ path: '/docs/integrations/', label: 'Integrations index' },
	{ path: '/docs/integrations/deep-agents-sandboxes/', label: 'Deep Agents integration (working)' },
	{ path: '/docs/integrations/kagent/', label: 'kagent integration (planned)' },
];

// Epic 30 merged/renamed slugs. Each old URL must keep working via a static
// meta-refresh stub whose refresh target AND canonical carry the '/docs' base
// (see the `redirects` note in astro.config.mjs — destinations are emitted
// verbatim, so a missing '/docs' prefix would 404 in production).
const REDIRECTS = [
	{ from: '/docs/getting-started/quickstart-agent-dev/', to: '/docs/getting-started/quickstart' },
	{ from: '/docs/getting-started/quickstart-local/', to: '/docs/getting-started/quickstart' },
	{ from: '/docs/sdk/quickstart/', to: '/docs/getting-started/quickstart' },
	{ from: '/docs/concepts/security-and-trust/', to: '/docs/concepts/security-model' },
	{ from: '/docs/concepts/verifiable-credentials/', to: '/docs/concepts/identity-and-credentials' },
	{
		from: '/docs/concepts/persistence-and-identity/',
		to: '/docs/concepts/identity-and-credentials',
	},
	{ from: '/docs/concepts/idp-support/', to: '/docs/concepts/enterprise-iam' },
	{ from: '/docs/concepts/consoles/', to: '/docs/concepts/architecture' },
];

// Epic 30 IA-1: the exact six top-level sidebar groups, in order.
const SIDEBAR_GROUPS = [
	'Get started',
	'Concepts',
	'Guides',
	'Integrations',
	'Reference',
	'Self-host & operate',
];

// Operator / self-hosting docs.
const OPERATOR_PAGES = [
	{ path: '/docs/operations/', label: 'Operations index' },
	{ path: '/docs/operations/self-hosting/', label: 'Self-hosting' },
	{ path: '/docs/operations/doks-runbook/', label: 'DOKS runbook' },
	{ path: '/docs/operations/command-center/', label: 'Operate the Command Center (Epic 31)' },
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
		// The §15 one-sentence product line must stay verbatim on the docs homepage
		// (em dash included; asserted on a robust substring spanning it).
		await expect(page.locator('main')).toContainText(
			'entitled to delegate—and only for the task, resource, and time originally approved',
		);
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

test.describe('quickstart consolidation (Epic 30)', () => {
	test('quickstart renders both persona tabs', async ({ page }) => {
		await page.goto('/docs/getting-started/quickstart/', { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('tab', { name: /Govern an agent/i })).toBeVisible();
		await expect(page.getByRole('tab', { name: /Run the platform locally/i })).toBeVisible();
	});
});

test.describe('merged-slug redirects (Epic 30)', () => {
	for (const { from, to } of REDIRECTS) {
		test(`old slug redirects: ${from} → ${to}`, async ({ page }) => {
			// The static preview server returns the meta-refresh stub with a 200; assert
			// the stub's refresh target and canonical rather than a Location header.
			const res = await page.request.get(from);
			expect(res.status(), `${from} stub status`).toBeLessThan(400);
			const html = await res.text();
			expect(html, `${from} meta-refresh destination`).toContain(
				`http-equiv="refresh" content="0;url=${to}"`,
			);
			expect(html, `${from} canonical destination`).toContain(
				`rel="canonical" href="https://palonexus.ai${to}"`,
			);
			// And a real browser lands on the destination page.
			await page.goto(from, { waitUntil: 'domcontentloaded' });
			await expect(page).toHaveURL(new RegExp(`${to.replace(/[/]/g, '\\/')}\\/?$`), {
				timeout: 10_000,
			});
			await expect(page.locator('h1').first()).toBeVisible();
		});
	}
});

test.describe('sidebar information architecture (Epic 30)', () => {
	test('exactly six top-level groups with the approved labels', async ({ page }) => {
		await page.goto('/docs/concepts/architecture/', { waitUntil: 'domcontentloaded' });
		const groups = page.locator(
			'#starlight__sidebar ul.top-level > li > details > summary .group-label',
		);
		await expect(groups).toHaveCount(SIDEBAR_GROUPS.length);
		await expect(groups).toHaveText(SIDEBAR_GROUPS, { useInnerText: true });
	});

	test('nested subgroups render (Guides / Integrations / Self-host)', async ({ page }) => {
		await page.goto('/docs/concepts/architecture/', { waitUntil: 'domcontentloaded' });
		const nested = page.locator('#starlight__sidebar ul.top-level details details summary');
		for (const label of [
			'Build & govern an agent',
			'Walkthroughs',
			'Recipes',
			'Frameworks',
			'Deploy',
			'Configure',
			'Operate',
		]) {
			await expect(
				nested.filter({ hasText: label }).first(),
				`nested group "${label}"`,
			).toBeAttached();
		}
	});
});

test.describe('honesty markers', () => {
	test('planned integration page carries a visible planned banner', async ({ page }) => {
		await page.goto('/docs/integrations/kagent/', { waitUntil: 'domcontentloaded' });
		const banner = page.locator('.starlight-aside--caution').first();
		await expect(banner, 'planned-integration caution aside').toBeVisible();
		await expect(banner).toContainText(/planned integration/i);
	});
});

test.describe('feature-matrix honesty pins (Epic 31)', () => {
	test('Human SSO row is Planned, not Shipped', async ({ page }) => {
		await page.goto('/docs/concepts/feature-matrix/', { waitUntil: 'domcontentloaded' });
		const row = page.locator('main tr', { hasText: 'Human SSO' }).first();
		await expect(row, 'Human SSO feature row').toBeAttached();
		// Column order is Capability | What it does | Status | Documented in — pin the status cell
		// exactly so a regression back to the over-claimed "Shipped" fails loudly.
		await expect(row.locator('td').nth(2), 'Human SSO status cell').toHaveText('Planned');
	});

	test('operator-consoles row lists the renamed portal tabs', async ({ page }) => {
		await page.goto('/docs/concepts/feature-matrix/', { waitUntil: 'domcontentloaded' });
		const row = page.locator('main tr', { hasText: 'Operator consoles' }).first();
		await expect(row, 'Operator consoles feature row').toBeAttached();
		const tabsCell = row.locator('td').nth(1);
		await expect(tabsCell).toContainText('Authority Trail');
		await expect(tabsCell).toContainText('Authority Delegation');
		await expect(tabsCell).toContainText('Credential-Safe Enforcement');
		// The old bare tab label must not linger in the tab list. Scoped to this cell:
		// "Audit" legitimately appears elsewhere on the page (e.g. audit-trail rows).
		await expect(tabsCell).not.toContainText(/\bAudit\b/);
	});
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
