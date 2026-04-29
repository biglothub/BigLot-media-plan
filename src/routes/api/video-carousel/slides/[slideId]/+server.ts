import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateVideoCarouselSlide } from '$lib/server/video-carousel-store';
import type { VideoTextPosition, VideoLayoutType, VideoFilterType, VideoTextBoxTransforms } from '$lib/video-carousel';

export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const body = await request.json();
		const patch: Parameters<typeof updateVideoCarouselSlide>[1] = {};
		if (typeof body.layout_type === 'string') patch.layout_type = body.layout_type as VideoLayoutType;
		if (typeof body.text === 'string') patch.text = body.text;
		if ('accent_text' in body) patch.accent_text = typeof body.accent_text === 'string' ? body.accent_text : null;
		if ('subtext' in body) patch.subtext = typeof body.subtext === 'string' ? body.subtext : null;
		if (Array.isArray(body.options_json)) patch.options_json = body.options_json as string[];
		if (typeof body.text_position === 'string') patch.text_position = body.text_position as VideoTextPosition;
		if (typeof body.text_offset_x_px === 'number') patch.text_offset_x_px = body.text_offset_x_px;
		if (typeof body.text_offset_y_px === 'number') patch.text_offset_y_px = body.text_offset_y_px;
		if (typeof body.text_scale_percent === 'number') patch.text_scale_percent = body.text_scale_percent;
		if (body.text_box_transforms_json && typeof body.text_box_transforms_json === 'object' && !Array.isArray(body.text_box_transforms_json)) {
			patch.text_box_transforms_json = body.text_box_transforms_json as VideoTextBoxTransforms;
		}
		if ('pexels_video_id' in body) patch.pexels_video_id = typeof body.pexels_video_id === 'number' ? body.pexels_video_id : null;
		if (typeof body.video_url === 'string') patch.video_url = body.video_url;
		if (typeof body.thumbnail_url === 'string') patch.thumbnail_url = body.thumbnail_url;
		if (typeof body.video_filter === 'string') patch.video_filter = body.video_filter as VideoFilterType;
		if (typeof body.duration_seconds === 'number') patch.duration_seconds = body.duration_seconds;
		if ('caption' in body) {
			patch.caption =
				typeof body.caption === 'string' && body.caption.trim() ? body.caption.trim() : null;
		}

		const slide = await updateVideoCarouselSlide(params.slideId, patch);
		return json(slide);
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
