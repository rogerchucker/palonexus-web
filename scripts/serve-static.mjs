import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 4321);
const contentTypes = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.ico': 'image/x-icon',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain; charset=utf-8',
	'.webp': 'image/webp',
};

const server = createServer(async (request, response) => {
	const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
	const relative = pathname.replace(/^\/+/, '');
	const candidates = [path.join(root, relative), path.join(root, relative, 'index.html')];
	for (const candidate of candidates) {
		if (!candidate.startsWith(`${root}${path.sep}`) && candidate !== root) continue;
		try {
			await access(candidate);
			if (!(await stat(candidate)).isFile()) continue;
			const extension = path.extname(candidate);
			response.writeHead(200, {
				'Content-Type': contentTypes[extension] ?? 'application/octet-stream',
				'Cache-Control': 'no-cache',
			});
			createReadStream(candidate).pipe(response);
			return;
		} catch {
			// Try the directory index candidate next.
		}
	}
	response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
	response.end('Not found');
});

server.listen(port, '127.0.0.1', () => {
	console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});

process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
