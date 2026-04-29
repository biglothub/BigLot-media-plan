import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertJamendoAudioUrl } from '$lib/server/jamendo';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const rawUrl = url.searchParams.get('url');
		if (!rawUrl) return json({ error: 'url is required' }, { status: 400 });

		const audioUrl = assertJamendoAudioUrl(rawUrl);
		const upstream = await fetch(audioUrl, {
			headers: { Accept: 'audio/mpeg,audio/ogg,audio/*;q=0.8,*/*;q=0.5' }
		});

		if (!upstream.ok || !upstream.body) {
			return json({ error: `Jamendo audio request failed (${upstream.status})` }, { status: 502 });
		}

		const headers = new Headers();
		headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'audio/mpeg');
		const contentLength = upstream.headers.get('Content-Length');
		if (contentLength) headers.set('Content-Length', contentLength);
		headers.set('Cache-Control', 'private, max-age=3600');

		return new Response(upstream.body, { headers });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
	}
};
