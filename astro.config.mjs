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
	// Epic 30 (IA-1/IA-2/IA-3): merged/renamed slugs keep working via static
	// meta-refresh redirect pages. Note the base ('/docs') asymmetry, verified
	// against the build output: SOURCE paths are base-relative (Astro places the
	// redirect page inside the base-mounted dist), but DESTINATION URLs are
	// emitted verbatim into the meta-refresh, so they must carry '/docs'.
	redirects: {
		'/getting-started/quickstart-agent-dev': '/docs/getting-started/quickstart',
		'/getting-started/quickstart-local': '/docs/getting-started/quickstart',
		'/sdk/quickstart': '/docs/getting-started/quickstart',
		'/concepts/security-and-trust': '/docs/concepts/security-model',
		'/concepts/verifiable-credentials': '/docs/concepts/identity-and-credentials',
		'/concepts/persistence-and-identity': '/docs/concepts/identity-and-credentials',
		'/concepts/idp-support': '/docs/concepts/enterprise-iam',
		'/concepts/consoles': '/docs/concepts/architecture',
	},
	integrations: [
		// Mermaid diagrams (client-side rendering, build-safe — no headless browser).
		// MUST precede starlight() so it transforms ```mermaid fences before Expressive Code.
		mermaid({ theme: 'default', autoTheme: true }),
		starlight({
			title: 'PaloNexus Docs',
			description:
				'Developer integration, Python SDK reference, and operations (Go + Terraform) for PaloNexus — the authorization and accountability layer between AI agents and the systems they act upon.',
			// Brand override (accent + font) shared conceptually with the marketing root's
			// token layer at src-root/styles/theme.css — see src/styles/brand.css for details.
			customCss: ['./src/styles/brand.css'],
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
			// Epic 30 IA-1: explicit reader-first sidebar (6 groups). Pages are listed
			// by slug so files stay put; anything not listed here is intentionally out
			// of the nav (develop/index, develop/guides/index, develop/recipes/index,
			// operations/releasing-the-docs — contributor meta, linked from CONTRIBUTING).
			sidebar: [
				{
					label: 'Get started',
					items: [
						{ label: 'Overview', slug: 'getting-started/overview' },
						{
							label: 'Quickstart',
							slug: 'getting-started/quickstart',
							badge: { text: 'Start here', variant: 'tip' },
						},
						{ label: 'Core concepts', slug: 'getting-started/concepts' },
						{ label: 'What PaloNexus is not', slug: 'getting-started/what-palonexus-is-not' },
					],
				},
				{
					label: 'Concepts',
					items: [
						{ label: 'The authorization model', slug: 'concepts' },
						{ label: 'Architecture', slug: 'concepts/architecture' },
						{ label: 'Security model', slug: 'concepts/security-model' },
						{ label: 'Agent identity & credentials', slug: 'concepts/identity-and-credentials' },
						{ label: 'Connect agents to enterprise authority', slug: 'concepts/enterprise-iam' },
						{ label: 'Credential-safe action enforcement', slug: 'concepts/egress-enforcement' },
					],
				},
				{
					label: 'Guides',
					items: [
						{
							label: 'Build & govern an agent',
							items: [
								{ label: 'Accountable agent identity', slug: 'develop/agent-identity' },
								{ label: 'Authority delegation', slug: 'develop/delegations-and-approvals' },
								{ label: 'Budgets and allowlists', slug: 'develop/budgets-and-allowlists' },
								{ label: 'The autonomous flow', slug: 'develop/autonomous-flow' },
								{
									label: 'Credential-safe enforcement — hands-on',
									slug: 'develop/egress-enforcement',
								},
								{ label: 'Enterprise authority — hands-on', slug: 'develop/enterprise-iam' },
								{ label: 'Deploy an agent', slug: 'develop/deploy-an-agent' },
								{ label: 'Troubleshooting', slug: 'develop/troubleshooting' },
							],
						},
						{
							label: 'Walkthroughs',
							items: [
								{
									label: 'Temporary elevation',
									slug: 'develop/guides/temporary-elevation-walkthrough',
								},
							],
						},
						{
							label: 'Recipes',
							items: [
								{ label: 'A2A delegation', slug: 'develop/recipes/a2a-delegation' },
								{ label: 'Budget exhaustion', slug: 'develop/recipes/budget-exhaustion' },
								{ label: 'Multi-scenario agent', slug: 'develop/recipes/multi-scenario-agent' },
								{ label: 'Offline tests', slug: 'develop/recipes/offline-tests' },
								{ label: 'Revocation race', slug: 'develop/recipes/revocation-race' },
							],
						},
					],
				},
				{
					label: 'Integrations',
					items: [
						{ label: 'Overview', slug: 'integrations' },
						{
							label: 'Frameworks',
							items: [
								{ label: 'LangChain adapter', slug: 'sdk/langchain' },
								{ label: 'LangGraph adapter', slug: 'sdk/langgraph' },
								{ label: 'Deep Agents adapter', slug: 'sdk/deep-agents' },
							],
						},
						{
							label: 'Keep secrets outside Deep Agents sandboxes',
							slug: 'integrations/deep-agents-sandboxes',
						},
						{ label: 'Govern A2A delegation', slug: 'integrations/a2a-delegation' },
						{
							label: 'kagent',
							slug: 'integrations/kagent',
							badge: { text: 'Planned', variant: 'caution' },
						},
						{
							label: 'Agent Sandbox',
							slug: 'integrations/agent-sandbox',
							badge: { text: 'Planned', variant: 'caution' },
						},
						{
							label: 'OpenAI Agents SDK',
							slug: 'integrations/openai-agents',
							badge: { text: 'Planned', variant: 'caution' },
						},
						{
							label: 'MCP',
							slug: 'integrations/mcp',
							badge: { text: 'Planned', variant: 'caution' },
						},
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Overview', slug: 'reference' },
						{
							label: 'Python SDK',
							items: [
								{ label: 'SDK overview & layers', slug: 'sdk' },
								{ label: 'API reference', slug: 'sdk/reference' },
								{ label: 'palonexus_agent', slug: 'sdk/palonexus-agent' },
								{ label: 'agentdid (DID & VC)', slug: 'sdk/agentdid' },
								{ label: 'Egress proxy client', slug: 'sdk/egress-proxy-client' },
								{ label: 'Configuration & env', slug: 'sdk/config-env' },
							],
						},
						{
							label: 'APIs',
							items: [
								{ label: 'HTTP API', slug: 'reference/http-api' },
								{ label: 'Enterprise IAM API', slug: 'reference/enterprise-iam-api' },
								// Generated interactive API reference group(s).
								...openAPISidebarGroups,
							],
						},
						{
							label: 'Platform',
							items: [
								{ label: 'CLI', slug: 'reference/cli' },
								{ label: 'Environment variables', slug: 'reference/env-vars' },
								{ label: 'Headers', slug: 'reference/headers' },
								{ label: 'Feature matrix', slug: 'concepts/feature-matrix' },
								{ label: 'Glossary', slug: 'getting-started/glossary' },
								{ label: 'Releases & changelog', slug: 'reference/changelog' },
							],
						},
					],
				},
				{
					label: 'Self-host & operate',
					items: [
						{ label: 'Overview', slug: 'operations' },
						{
							label: 'Deploy',
							items: [
								{ label: 'Docker Compose', slug: 'operations/docker-compose' },
								{ label: 'Self-hosting (Kustomize)', slug: 'operations/self-hosting' },
								{ label: 'Terraform / DOKS', slug: 'operations/terraform-doks' },
								{ label: 'DOKS runbook', slug: 'operations/doks-runbook' },
							],
						},
						{
							label: 'Configure',
							items: [
								{ label: 'Secrets', slug: 'operations/secrets' },
								{ label: 'Persistence', slug: 'operations/persistence' },
								{ label: 'Bring your own IdP', slug: 'operations/bring-your-own-idp' },
							],
						},
						{
							label: 'Operate',
							items: [
								{ label: 'Control plane', slug: 'operations/control-plane' },
								{ label: 'Command Center', slug: 'operations/command-center' },
								{ label: 'Observability', slug: 'operations/observability' },
								{ label: 'Performance', slug: 'operations/performance' },
								{ label: 'Backups & restore', slug: 'operations/backups' },
								{ label: 'Migrations', slug: 'operations/migrations' },
								{ label: 'Upgrades & rollback', slug: 'operations/upgrades' },
								{ label: 'Production hardening', slug: 'operations/hardening' },
								{ label: 'Enforcement (Ops)', slug: 'operations/egress-enforcement-ops' },
							],
						},
					],
				},
			],
		}),
	],
});
