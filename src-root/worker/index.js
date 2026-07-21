// Marketing-root Worker. Static assets (dist-root) are served by the assets pipeline
// first; this script only sees requests that no asset matches — in practice the
// request-access form POST, which it forwards to the founder inbox via the free
// Cloudflare Email Routing `send_email` binding (no third-party form vendor).
import { EmailMessage } from 'cloudflare:email';

// Public-facing contact is support@palonexus.ai (an Email Routing custom address on the
// zone, forwarding to the inbox below). The send_email binding, however, can only
// target a VERIFIED DESTINATION address (the external inbox those routing rules
// forward to) — zone addresses are routing rules, not destinations — so form
// submissions deliver straight to the same inbox support@ forwards to. This address
// never appears on the site.
const DESTINATION = 'rajarshic@gmail.com';
const SENDER = 'access@palonexus.ai';

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === '/api/request-access' && request.method === 'POST') {
			return handleRequestAccess(request, env);
		}
		return env.ASSETS.fetch(request);
	},
};

const redirect = (path) => new Response(null, { status: 303, headers: { Location: path } });

// Strip CR/LF so user input can never inject additional MIME headers.
const clean = (value, max) =>
	String(value ?? '')
		.replace(/[\r\n]+/g, ' ')
		.trim()
		.slice(0, max);

async function handleRequestAccess(request, env) {
	let form;
	try {
		form = await request.formData();
	} catch {
		return redirect('/request-access/?error=1');
	}

	const name = clean(form.get('name'), 200);
	const email = clean(form.get('email'), 200);
	const company = clean(form.get('company'), 200);
	const details = String(form.get('details') ?? '')
		.trim()
		.slice(0, 4000);
	const honeypot = clean(form.get('website'), 200);

	// Bots fill the hidden field; pretend success so they stop retrying.
	if (honeypot) return redirect('/request-access/thanks/');
	if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
		return redirect('/request-access/?error=1');
	}

	const body = [
		'New access request from palonexus.ai/request-access/',
		'',
		`Name:    ${name}`,
		`Email:   ${email}`,
		`Company: ${company || '-'}`,
		'',
		'What do your agents need to reach?',
		details || '-',
		'',
		`Submitted: ${new Date().toISOString()}`,
	].join('\r\n');

	const raw = [
		`From: PaloNexus website <${SENDER}>`,
		`To: ${DESTINATION}`,
		`Reply-To: ${email}`,
		'Subject: PaloNexus access request',
		`Message-ID: <${crypto.randomUUID()}@palonexus.ai>`,
		`Date: ${new Date().toUTCString()}`,
		'MIME-Version: 1.0',
		'Content-Type: text/plain; charset=utf-8',
		'',
		body,
	].join('\r\n');

	try {
		await env.REQUEST_ACCESS_EMAIL.send(new EmailMessage(SENDER, DESTINATION, raw));
	} catch (err) {
		console.error('request-access email send failed:', err instanceof Error ? err.message : err);
		return redirect('/request-access/?error=1');
	}
	return redirect('/request-access/thanks/');
}
