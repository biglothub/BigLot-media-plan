import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasJamendoConfig, searchJamendoMusic } from '$lib/server/jamendo';
import type { VideoCarouselTemplateType } from '$lib/video-carousel';

function normalizeTemplateType(value: string | null): VideoCarouselTemplateType {
	if (value === 'quote' || value === 'listicle' || value === 'stat') return value;
	return 'quiz';
}

function normalizeLimit(value: string | null): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 8;
	return Math.min(Math.max(Math.round(parsed), 1), 20);
}

export const GET: RequestHandler = async ({ url }) => {
	try {
		if (!hasJamendoConfig) {
			return json({ error: 'JAMENDO_CLIENT_ID is required' }, { status: 501 });
		}

		const templateType = normalizeTemplateType(url.searchParams.get('template_type'));
		const result = await searchJamendoMusic({
			query: url.searchParams.get('q'),
			topic: url.searchParams.get('topic'),
			templateType,
			limit: normalizeLimit(url.searchParams.get('limit'))
		});

		return json(result);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
