import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { getCarouselProjectById, getCarouselWorkflow } from '$lib/server/carousel-store';

function normalizeText(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed || null;
}

function normalizeNumber(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

export const POST: RequestHandler = async ({ params, request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	try {
		const project = await getCarouselProjectById(params.id);
		if (!project) return json({ error: 'Carousel project not found' }, { status: 404 });

		const workflow = await getCarouselWorkflow(project);
		if (!workflow.linked_schedule) {
			return json({ error: 'Create a schedule handoff before saving publication data' }, { status: 400 });
		}

		const body = await request.json();
		const url = normalizeText(body.url);
		if (!url) {
			return json({ error: 'url is required' }, { status: 400 });
		}

		let publicationId = workflow.published_record?.id ?? null;
		if (!publicationId) {
			const { data: existing, error: existingError } = await supabase
				.from('produced_videos')
				.select('id')
				.eq('calendar_id', workflow.linked_schedule.id)
				.eq('platform', 'instagram')
				.maybeSingle();

			if (existingError && existingError.code !== 'PGRST116') {
				return json({ error: existingError.message }, { status: 500 });
			}
			publicationId = (existing?.id as string | undefined) ?? null;
		}

		const publicationRow = {
			calendar_id: workflow.linked_schedule.id,
			carousel_project_id: project.id,
			content_kind: 'carousel',
			platform: 'instagram',
			url,
			title: normalizeText(body.title) ?? project.title ?? null,
			thumbnail_url: normalizeText(body.thumbnail_url),
			published_at: typeof body.published_at === 'string' ? body.published_at : new Date().toISOString(),
			view_count: normalizeNumber(body.view_count),
			like_count: normalizeNumber(body.like_count),
			comment_count: normalizeNumber(body.comment_count),
			share_count: normalizeNumber(body.share_count),
			save_count: normalizeNumber(body.save_count),
			notes: normalizeText(body.notes)
		};

		if (publicationId) {
			const { error: updateError } = await supabase.from('produced_videos').update(publicationRow).eq('id', publicationId);
			if (updateError) return json({ error: updateError.message }, { status: 500 });
		} else {
			const { error: insertError } = await supabase.from('produced_videos').insert(publicationRow);
			if (insertError) return json({ error: insertError.message }, { status: 500 });
		}

		const { error: scheduleError } = await supabase
			.from('production_calendar')
			.update({ status: 'published' })
			.eq('id', workflow.linked_schedule.id);
		if (scheduleError) return json({ error: scheduleError.message }, { status: 500 });

		const refreshedWorkflow = await getCarouselWorkflow(project);
		return json({
			schedule: refreshedWorkflow.linked_schedule,
			published_record: refreshedWorkflow.published_record
		});
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
