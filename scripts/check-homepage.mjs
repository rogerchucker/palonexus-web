import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/client/index.html', import.meta.url), 'utf8');

const requiredContent = [
	'PaloNexus',
	'Build, govern, and scale enterprise AI agents',
	'Agents',
	'Platforms for agents',
	'Frameworks for agents',
	'gateway, registry, identity',
	'Design your agentic operating model',
];

const missingContent = requiredContent.filter((content) => !html.includes(content));

if (missingContent.length > 0) {
	console.error('Missing expected homepage content:');
	for (const content of missingContent) {
		console.error(`- ${content}`);
	}
	process.exit(1);
}
