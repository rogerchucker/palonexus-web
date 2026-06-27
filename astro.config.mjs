// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi';

// PaloNexus documentation site (Astro + Starlight), served from the /docs context.
// Static output for local + static hosting. Local dev: `npm run dev` -> http://localhost:4321/docs/
// (The Cloudflare adapter was removed for the static docs build; re-add for CF deploy later.)
export default defineConfig({
	site: 'https://palonexus.ai',
	base: '/docs',
	integrations: [
		// Mermaid diagrams (client-side rendering, build-safe — no headless browser).
		// MUST precede starlight() so it transforms ```mermaid fences before Expressive Code.
		mermaid({ theme: 'default', autoTheme: true }),
		starlight({
			title: 'PaloNexus Docs',
			description:
				'Developer integration, Python SDK reference, and operations (Go + Terraform) for the PaloNexus agent control plane.',
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 },
			// Interactive API reference generated from the agent-idp OpenAPI 3.1 spec.
			plugins: [
				starlightOpenAPI([
					{
						base: 'reference/api/agent-idp',
						schema: './openapi/agent-idp.json',
						label: 'agent-idp API (interactive)',
						sidebarMethodBadges: true,
					},
				]),
			],
			sidebar: [
				// Concepts moved up (standard IA: orient before integrating).
				{ label: 'Getting Started', items: [{ autogenerate: { directory: 'getting-started' } }] },
				{ label: 'Architecture & Features', items: [{ autogenerate: { directory: 'concepts' } }] },
				{ label: 'Developer Integration', items: [{ autogenerate: { directory: 'develop' } }] },
				{ label: 'SDK Reference (Python)', items: [{ autogenerate: { directory: 'sdk' } }] },
				{
					label: 'Operations (Go + Terraform)',
					items: [{ autogenerate: { directory: 'operations' } }],
				},
				{ label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
				// Generated interactive API reference group(s).
				...openAPISidebarGroups,
			],
		}),
	],
});
