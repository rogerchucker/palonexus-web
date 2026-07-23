import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const cta = z.object({ label: z.string(), href: z.string() });

// One shape per landing-page section, named so components can import their exact prop
// type, and discriminated on `section` so each markdown file's frontmatter is validated
// against exactly the fields that section renders.
//
// Nav has no entry here: the top nav (brand, links, CTA) now comes from the shared
// ../shared/site-nav.mjs module — see src-root/components/landing/Nav.astro — so it
// can't drift from the Starlight docs header, which imports the same module.
const heroSchema = z.object({
	section: z.literal('hero'),
	eyebrow: z.string(),
	heading: z.string(),
	lede: z.string(),
	// The runtime / sandbox / PaloNexus three-line category distinction, rendered on
	// the first screen directly under the hero actions.
	distinction: z.array(z.object({ label: z.string(), text: z.string() })).length(3),
	primaryCta: cta,
	secondaryCta: cta,
});
const solutionsSchema = z.object({
	section: z.literal('solutions'),
	eyebrow: z.string(),
	heading: z.string(),
	cards: z
		.array(
			z.object({
				kicker: z.string(),
				title: z.string(),
				description: z.string(),
				items: z.array(z.string()).min(1),
			}),
		)
		.min(1),
});
const whyNowSchema = z.object({
	section: z.literal('why-now'),
	eyebrow: z.string(),
	heading: z.string(),
});
const platformSchema = z.object({
	section: z.literal('platform'),
	eyebrow: z.string(),
	heading: z.string(),
	columns: z.array(z.object({ title: z.string(), description: z.string() })).min(1),
	// "Every result → authority trail" line rendered under the three-column diagram.
	footer: z.string().optional(),
});
const commandCenterSchema = z.object({
	section: z.literal('command-center'),
	eyebrow: z.string(),
	heading: z.string(),
	lede: z.string(),
	// The two differentiators + fleet-ownership card, rendered under the live
	// portal capture. Honesty rule: copy must describe only what the capture shows.
	points: z.array(z.object({ title: z.string(), text: z.string() })).min(1),
	// One conditional-mood sentence max about what's coming next; never a claim.
	comingNext: z.string().optional(),
});
const worksWithSchema = z.object({
	section: z.literal('works-with'),
	eyebrow: z.string(),
	heading: z.string(),
	// Honesty rule: `working` lists only integrations that ship today; everything
	// else goes in `planned` and is rendered with a visible "Planned" marker.
	working: z.array(z.string()).min(1),
	planned: z.array(z.string()).min(1),
});
const useCasesSchema = z.object({
	section: z.literal('use-cases'),
	eyebrow: z.string(),
	heading: z.string(),
	items: z.array(z.string()).min(1),
});
const governanceSchema = z.object({
	section: z.literal('governance'),
	eyebrow: z.string(),
	heading: z.string(),
	items: z.array(z.string()).min(1),
});
const closingSchema = z.object({
	section: z.literal('closing'),
	eyebrow: z.string(),
	heading: z.string(),
	cta,
	secondaryCta: cta.optional(),
});

const landingSchema = z.discriminatedUnion('section', [
	heroSchema,
	solutionsSchema,
	whyNowSchema,
	platformSchema,
	commandCenterSchema,
	worksWithSchema,
	useCasesSchema,
	governanceSchema,
	closingSchema,
]);

export type HeroData = z.infer<typeof heroSchema>;
export type SolutionsData = z.infer<typeof solutionsSchema>;
export type WhyNowData = z.infer<typeof whyNowSchema>;
export type PlatformData = z.infer<typeof platformSchema>;
export type CommandCenterData = z.infer<typeof commandCenterSchema>;
export type WorksWithData = z.infer<typeof worksWithSchema>;
export type UseCasesData = z.infer<typeof useCasesSchema>;
export type GovernanceData = z.infer<typeof governanceSchema>;
export type ClosingData = z.infer<typeof closingSchema>;

export const collections = {
	landing: defineCollection({
		loader: glob({ pattern: '*.md', base: './src-root/content/landing' }),
		schema: landingSchema,
	}),
};
