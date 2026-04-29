import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { updateVideoCarouselSlide } from '$lib/server/video-carousel-store';
import { uploadVideoCarouselFile } from '$lib/server/video-carousel-upload';

export const POST: RequestHandler = async ({ params, request }) => {
	if (!supabaseAdmin) return json({ error: 'Supabase service role is not configured' }, { status: 500 });

	try {
		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File)) {
			return json({ error: 'file is required' }, { status: 400 });
		}

		const { error: slideError } = await supabaseAdmin
			.from('video_carousel_slides')
			.select('id')
			.eq('id', params.slideId)
			.eq('project_id', params.id)
			.single();

		if (slideError) {
			return json({ error: slideError.message }, { status: 404 });
		}

		const stored = await uploadVideoCarouselFile(file, params.id, params.slideId);
		const slide = await updateVideoCarouselSlide(params.slideId, {
			pexels_video_id: null,
			video_url: stored.publicUrl,
			thumbnail_url: null
		});

		return json({ slide, video_url: stored.publicUrl, storage_path: stored.path });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
