import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateVideoTopicSuggestions } from '$lib/server/video-ai';
import {
	VIDEO_QUOTE_CATEGORY_LABELS,
	type VideoCarouselTemplateType,
	type VideoQuoteCategory
} from '$lib/video-carousel';

function normalizeQuoteCategory(value: unknown): VideoQuoteCategory | undefined {
	if (typeof value !== 'string') return undefined;
	return Object.prototype.hasOwnProperty.call(VIDEO_QUOTE_CATEGORY_LABELS, value)
		? (value as VideoQuoteCategory)
		: undefined;
}

function normalizeCustomQuoteCategory(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized ? normalized.slice(0, 80) : undefined;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const templateType: VideoCarouselTemplateType =
			body.template_type === 'quote' ||
			body.template_type === 'listicle' ||
			body.template_type === 'stat'
				? body.template_type
				: 'quiz';
		const quoteCategory = normalizeQuoteCategory(body.quote_category);
		const customQuoteCategory = normalizeCustomQuoteCategory(body.quote_category_custom);
		const seed = typeof body.seed === 'string' ? body.seed.trim() : '';
		const count = typeof body.count === 'number' ? body.count : 6;
		const suggestions = await generateVideoTopicSuggestions({
			templateType,
			quoteCategory: templateType === 'quote' && !customQuoteCategory ? quoteCategory : undefined,
			quoteCategoryCustom: templateType === 'quote' ? customQuoteCategory : undefined,
			seed: seed || undefined,
			count
		});

		return json({ suggestions });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
