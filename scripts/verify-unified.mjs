import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const site = path.join(root, 'dist-unified');

const required = [
	'index.html',
	'docs/index.html',
	'docs/getting-started/overview/index.html',
	'docs/operations/command-center/index.html',
	'request-changes/index.html',
	'_astro',
	'docs/_astro',
];

for (const entry of required) {
	try {
		await access(path.join(site, entry));
	} catch {
		throw new Error(`Unified site is missing ${entry}`);
	}
}

const rootHtml = await readFile(path.join(site, 'index.html'), 'utf8');
if (!rootHtml.includes('PaloNexus')) throw new Error('Marketing homepage title/content is missing');

const docsHtml = await readFile(
	path.join(site, 'docs/getting-started/overview/index.html'),
	'utf8',
);
if (!docsHtml.includes('PaloNexus Docs')) throw new Error('Docs page title/content is missing');

const redirect = await readFile(path.join(site, 'docs/index.html'), 'utf8');
if (!redirect.includes('/docs/getting-started/overview/'))
	throw new Error('Docs index redirect is missing');

console.log('Unified site verification passed.');
