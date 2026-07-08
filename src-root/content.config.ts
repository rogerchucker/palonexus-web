import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const cta = z.object({ label: z.string(), href: z.string() });

// One shape per landing-page section, named so components can import their exact prop
// type, and discriminated on `section` so each markdown file's frontmatter is validated
// against exactly the fields that section renders.
const navSchema = z.object({
	section: z.literal('nav'),
	brand: z.string(),
	links: z.array(z.object({ label: z.string(), href: z.string() })).min(1),
	cta,
});
const heroSchema = z.object({
	section: z.literal('hero'),
	eyebrow: z.string(),
	heading: z.string(),
	lede: z.string(),
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
});

const landingSchema = z.discriminatedUnion('section', [
	navSchema,
	heroSchema,
	solutionsSchema,
	whyNowSchema,
	platformSchema,
	useCasesSchema,
	governanceSchema,
	closingSchema,
]);

export type NavData = z.infer<typeof navSchema>;
export type HeroData = z.infer<typeof heroSchema>;
export type SolutionsData = z.infer<typeof solutionsSchema>;
export type WhyNowData = z.infer<typeof whyNowSchema>;
export type PlatformData = z.infer<typeof platformSchema>;
export type UseCasesData = z.infer<typeof useCasesSchema>;
export type GovernanceData = z.infer<typeof governanceSchema>;
export type ClosingData = z.infer<typeof closingSchema>;

export const collections = {
	landing: defineCollection({
		loader: glob({ pattern: '*.md', base: './src-root/content/landing' }),
		schema: landingSchema,
	}),
};
