import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeCarouselQuoteFontScale, normalizeCarouselTextLetterSpacingEm, normalizeHashtags } from '$lib/carousel';
import { supabase } from '$lib/supabase';
import {
	getCarouselBundle,
	getCarouselWorkflow,
	isMissingCarouselProjectColumnError,
	recomputeCarouselStatus
} from '$lib/server/carousel-store';
import type { CarouselContentMode, CarouselFontPreset, CarouselProjectStatus, CarouselReviewStatus } from '$lib/types';

function normalizeContentMode(value: unknown): CarouselContentMode {
	return value === 'quote' ? 'quote' : 'standard';
}

function normalizeTextOrNull(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return normalized ? normalized : null;
}

function normalizeAccountHandle(value: unknown): string | null {
	const normalized = normalizeTextOrNull(value);
	if (!normalized) return null;
	const stripped = normalized.replace(/^@+/, '').trim();
	return stripped ? stripped : null;
}

function normalizeReviewStatus(value: unknown): CarouselReviewStatus {
	if (value === 'pending_review' || value === 'approved' || value === 'changes_requested') {
		return value;
	}
	return 'draft';
}

export const GET: RequestHandler = async ({ params }) => {
	try {
		const bundle = await getCarouselBundle(params.id);
		const workflow = await getCarouselWorkflow(bundle.project);
		return json({
			...bundle.project,
			carousel_slides: bundle.slides,
			linked_schedule: workflow.linked_schedule,
			published_record: workflow.published_record
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
		if (body.content_mode !== undefined) updates.content_mode = normalizeContentMode(body.content_mode);
		if (body.font_preset !== undefined) updates.font_preset = body.font_preset as CarouselFontPreset;
		if (body.text_letter_spacing_em !== undefined) {
			updates.text_letter_spacing_em = normalizeCarouselTextLetterSpacingEm(body.text_letter_spacing_em);
		}
		if (body.quote_font_scale !== undefined) {
			updates.quote_font_scale = normalizeCarouselQuoteFontScale(body.quote_font_scale);
		}
		if (body.visual_direction !== undefined) {
			updates.visual_direction = normalizeTextOrNull(body.visual_direction);
		}
		if (body.caption !== undefined) updates.caption = normalizeTextOrNull(body.caption);
		if (body.hashtags_json !== undefined) {
			updates.hashtags_json = normalizeHashtags(Array.isArray(body.hashtags_json) ? body.hashtags_json : []);
		}
		if (body.review_status !== undefined) {
			updates.review_status = normalizeReviewStatus(body.review_status);
		}
		if (body.review_notes !== undefined) {
			updates.review_notes = normalizeTextOrNull(body.review_notes);
		}
		if (body.reviewed_by !== undefined) {
			updates.reviewed_by = normalizeTextOrNull(body.reviewed_by);
		}
		if (body.reviewed_at !== undefined) {
			updates.reviewed_at = typeof body.reviewed_at === 'string' ? body.reviewed_at : null;
		}
		if (body.account_display_name !== undefined) {
			updates.account_display_name = normalizeTextOrNull(body.account_display_name);
		}
		if (body.account_handle !== undefined) {
			updates.account_handle = normalizeAccountHandle(body.account_handle);
		}
		if (body.account_avatar_url !== undefined) {
			updates.account_avatar_url = normalizeTextOrNull(body.account_avatar_url);
		}
		if (body.account_avatar_storage_path !== undefined) {
			updates.account_avatar_storage_path = normalizeTextOrNull(body.account_avatar_storage_path);
		}
		if (body.account_is_verified !== undefined) {
			updates.account_is_verified = Boolean(body.account_is_verified);
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
			const unsupportedColumns = [
				'content_mode',
				'font_preset',
				'text_letter_spacing_em',
				'quote_font_scale',
				'review_status',
				'review_notes',
				'reviewed_by',
				'reviewed_at',
				'account_display_name',
				'account_handle',
				'account_avatar_url',
				'account_avatar_storage_path',
				'account_is_verified'
			].filter(
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
		const workflow = await getCarouselWorkflow(bundle.project);
		return json({
			...bundle.project,
			carousel_slides: bundle.slides,
			linked_schedule: workflow.linked_schedule,
			published_record: workflow.published_record
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
