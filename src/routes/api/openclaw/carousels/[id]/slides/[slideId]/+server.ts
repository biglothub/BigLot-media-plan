import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { getCarouselBundle, recomputeCarouselStatus } from '$lib/server/carousel-store';

export const PATCH: RequestHandler = async ({ params, request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	try {
		const body = await request.json();
		const updates: Record<string, unknown> = {
			updated_at: new Date().toISOString()
		};

		for (const key of ['headline', 'body', 'cta', 'visual_brief', 'freepik_query']) {
			if (body[key] !== undefined) {
				updates[key] = typeof body[key] === 'string' ? body[key].trim() || null : null;
			}
		}
		if (body.layout_variant !== undefined) {
			updates.layout_variant = body.layout_variant;
		}

		if (Object.keys(updates).length === 1) {
			return json({ error: 'No fields to update' }, { status: 400 });
		}

		const { data, error } = await supabase
			.from('carousel_slides')
			.update(updates)
			.eq('id', params.slideId)
			.eq('project_id', params.id)
			.select('*')
			.single();

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		const projectStatus = await recomputeCarouselStatus(params.id);
		return json({ slide: data, project_status: projectStatus });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
