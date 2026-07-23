import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'dist');
const target = path.join(root, 'dist-unified');

await rm(target, { recursive: true, force: true });
await mkdir(path.join(target, 'docs'), { recursive: true });

// The unified Astro build emits the marketing homepage and request flow at the
// root, while Starlight emits its pages flat with /docs-prefixed URLs. Keep the
// root surface at / and place every other generated page under /docs.
const rootEntries = new Set(['index.html', 'request-changes', '_astro', 'favicon.svg', 'favicon.ico']);
for (const entry of await readdir(source)) {
	const destination = rootEntries.has(entry) ? target : path.join(target, 'docs');
	await cp(path.join(source, entry), destination === target ? path.join(target, entry) : path.join(target, 'docs', entry), { recursive: true });
}

// Starlight references its hashed assets and favicon under /docs; duplicate the
// shared generated assets rather than rewriting every HTML document.
await cp(path.join(source, '_astro'), path.join(target, 'docs', '_astro'), { recursive: true });
for (const file of ['favicon.svg', 'favicon.ico']) {
	await cp(path.join(source, file), path.join(target, 'docs', file));
}

await writeFile(
	path.join(target, 'docs', 'index.html'),
	'<!doctype html><title>Redirecting to: /docs/getting-started/overview/</title><meta http-equiv="refresh" content="0;url=/docs/getting-started/overview/"><meta name="robots" content="noindex"><link rel="canonical" href="/docs/getting-started/overview/">'
);

console.log(`Staged unified site at ${path.relative(root, target)}/`);
