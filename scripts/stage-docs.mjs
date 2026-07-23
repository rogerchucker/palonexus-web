import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'dist');
const target = path.join(root, 'dist-deploy', 'docs');
const marketingOnly = new Set(['index.html', 'request-changes']);

await rm(path.join(root, 'dist-deploy'), { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const entry of await readdir(source)) {
	if (marketingOnly.has(entry)) continue;
	await cp(path.join(source, entry), path.join(target, entry), { recursive: true });
}
await writeFile(
	path.join(target, 'index.html'),
	'<!doctype html><title>Redirecting to: /docs/getting-started/overview</title><meta http-equiv="refresh" content="0;url=/docs/getting-started/overview"><meta name="robots" content="noindex"><link rel="canonical" href="https://palonexus.ai/docs/getting-started/overview">',
);
console.log(`Staged docs assets at ${path.relative(root, target)}/`);
