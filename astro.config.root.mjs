// @ts-check
import { defineConfig } from 'astro/config';

// PaloNexus marketing root (palonexus.ai). Static output, no adapter, no Starlight —
// this is a single-page site built from the `landing` content collection
// (src-root/content/landing/*.md), independent of the docs build (astro.config.mjs).
//
// Uses its own srcDir (src-root/), separate from docs' src/. Astro/Starlight lets a
// project-defined src/pages/index.astro override Starlight's injected homepage route —
// sharing srcDir with docs made this page silently hijack the docs homepage at /docs/.
// A dedicated srcDir keeps the two builds' page routing and content collections fully
// isolated (this also removes the "shared content.config.ts" risk entirely, since each
// srcDir gets its own content.config.ts).
// Local dev: `npm run dev:root` -> http://localhost:4321/
export default defineConfig({
	site: 'https://palonexus.ai',
	srcDir: './src-root',
	outDir: './dist-root',
});
