/**
 * Single source of truth for the PaloNexus top navigation bar.
 *
 * Imported by BOTH builds — the marketing root (src-root/components/landing/Nav.astro)
 * and the Starlight docs header override (src/components/Header.astro) — so the brand,
 * links, and CTA can never drift between the two. Astro can import outside its `srcDir`
 * via a relative path; a repo-root module is the shared home since the two builds have
 * separate srcDirs (src-root/, src/) and therefore separate content collections/types.
 *
 * Deliberately plain JS (not .ts): each build has its own tsconfig/content-collection
 * boundary, and this module has no dependency on either.
 */

export const brand = {
	label: 'PaloNexus',
	mark: 'PN',
	href: '/',
};

// Canonical in-page sections on the marketing homepage (`<section id="...">`).
// Consumers decide how to turn `id` into an href: an in-page hash on the homepage
// itself, or a homepage-qualified hash (`/#id`) from anywhere else — subpages and docs.
export const sections = [
	{ id: 'solutions', label: 'Solutions' },
	{ id: 'platform', label: 'Platform' },
	{ id: 'governance', label: 'Governance' },
];

export const docsLink = { label: 'Docs', href: '/docs/' };

export const cta = { label: 'Request Integration', href: '/request-changes/' };

/**
 * Build the full nav link list (sections + Docs) for a given context.
 *
 * @param {'homepage' | 'absolute'} [context]
 *   'homepage' -> in-page hashes (`#solutions`), for the marketing homepage itself.
 *   'absolute' (default) -> homepage-qualified hashes (`/#solutions`), for every other
 *   page: marketing subpages (/request-changes) and every docs page.
 */
export function navLinks(context = 'absolute') {
	const prefix = context === 'homepage' ? '#' : '/#';
	return [...sections.map((s) => ({ label: s.label, href: `${prefix}${s.id}` })), docsLink];
}
