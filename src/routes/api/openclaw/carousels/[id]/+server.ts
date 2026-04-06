import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeCarouselTextLetterSpacingEm, normalizeHashtags } from '$lib/carousel';
import { supabase } from '$lib/supabase';
import { getCarouselBundle, isMissingCarouselProjectColumnError, recomputeCarouselStatus } from '$lib/server/carousel-store';
import type { CarouselFontPreset, CarouselProjectStatus } from '$lib/types';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const bundle = await getCarouselBundle(params.id);
		return json({
			...bundle.project,
			carousel_slides: bundle.slides
		});
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
	}
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	try {
		const body = await request.json();
		const updates: Record<string, unknown> = {
			updated_at: new Date().toISOString()
		};

		if (body.title !== undefined) updates.title = typeof body.title === 'string' ? body.title.trim() || null : null;
		if (body.font_preset !== undefined) updates.font_preset = body.font_preset as CarouselFontPreset;
		if (body.text_letter_spacing_em !== undefined) {
			updates.text_letter_spacing_em = normalizeCarouselTextLetterSpacingEm(body.text_letter_spacing_em);
		}
		if (body.visual_direction !== undefined) {
			updates.visual_direction = typeof body.visual_direction === 'string' ? body.visual_direction.trim() || null : null;
		}
		if (body.caption !== undefined) updates.caption = typeof body.caption === 'string' ? body.caption.trim() || null : null;
		if (body.hashtags_json !== undefined) {
			updates.hashtags_json = normalizeHashtags(Array.isArray(body.hashtags_json) ? body.hashtags_json : []);
		}
		if (body.last_exported_at !== undefined) {
			updates.last_exported_at = typeof body.last_exported_at === 'string' ? body.last_exported_at : null;
		}
		if (body.status !== undefined) {
			updates.status = body.status;
		}

		const allowedKeys = Object.keys(updates).filter((key) => key !== 'updated_at' || Object.keys(updates).length > 1);
		if (allowedKeys.length === 0) {
			return json({ error: 'No fields to update' }, { status: 400 });
		}

		let pendingUpdates: Record<string, unknown> = { ...updates };
		let { error } = await supabase.from('carousel_projects').update(pendingUpdates).eq('id', params.id);
		while (error) {
			const unsupportedColumns = ['font_preset', 'text_letter_spacing_em'].filter(
				(column) => column in pendingUpdates && isMissingCarouselProjectColumnError(error, column)
			);
			if (unsupportedColumns.length === 0) break;
			for (const column of unsupportedColumns) {
				delete pendingUpdates[column];
			}
			if (Object.keys(pendingUpdates).length === 1) {
				error = null;
				break;
			}
			const retryResult = await supabase.from('carousel_projects').update(pendingUpdates).eq('id', params.id);
			error = retryResult.error;
		}

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		await recomputeCarouselStatus(params.id, body.status as CarouselProjectStatus | undefined);
		const bundle = await getCarouselBundle(params.id);
		return json({
			...bundle.project,
			carousel_slides: bundle.slides
		});
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	try {
		const { data, error } = await supabase
			.from('carousel_projects')
			.delete()
			.eq('id', params.id)
			.select('id');

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		if (!data || data.length === 0) {
			return json({ error: 'Carousel project not found or delete blocked by RLS' }, { status: 404 });
		}

		return new Response(null, { status: 204 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
