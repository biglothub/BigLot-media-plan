import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVideoCarouselSlides, upsertVideoCarouselSlides } from '$lib/server/video-carousel-store';
import type { VideoLayoutType, VideoTextPosition, VideoFilterType } from '$lib/video-carousel';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const slides = await getVideoCarouselSlides(params.id);
		return json(slides);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		if (!Array.isArray(body.slides)) return json({ error: 'slides array is required' }, { status: 400 });

		const slides = await upsertVideoCarouselSlides(
			params.id,
			body.slides.map((s: Record<string, unknown>, i: number) => ({
				position: typeof s.position === 'number' ? s.position : i + 1,
				layout_type: (s.layout_type as VideoLayoutType) ?? 'standard',
				text: typeof s.text === 'string' ? s.text : '',
				accent_text: typeof s.accent_text === 'string' ? s.accent_text : null,
				subtext: typeof s.subtext === 'string' ? s.subtext : null,
				options: Array.isArray(s.options_json)
					? (s.options_json as unknown[]).filter((value): value is string => typeof value === 'string')
					: Array.isArray(s.options)
						? (s.options as unknown[]).filter((value): value is string => typeof value === 'string')
						: [],
				text_position: (s.text_position as VideoTextPosition) ?? 'center',
				text_offset_x_px: typeof s.text_offset_x_px === 'number' ? s.text_offset_x_px : 0,
				text_offset_y_px: typeof s.text_offset_y_px === 'number' ? s.text_offset_y_px : 0,
				text_scale_percent: typeof s.text_scale_percent === 'number' ? s.text_scale_percent : 100,
				pexels_video_id: typeof s.pexels_video_id === 'number' ? s.pexels_video_id : null,
				video_url: typeof s.video_url === 'string' ? s.video_url : null,
				thumbnail_url: typeof s.thumbnail_url === 'string' ? s.thumbnail_url : null,
				video_filter: (s.video_filter as VideoFilterType) ?? 'none',
				duration_seconds: typeof s.duration_seconds === 'number' ? s.duration_seconds : 10,
				search_query: typeof s.search_query === 'string' ? s.search_query : null
			}))
		);
		return json(slides);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
