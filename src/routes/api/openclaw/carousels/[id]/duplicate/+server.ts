import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { getCarouselBundle, recomputeCarouselStatus } from '$lib/server/carousel-store';
import { createBacklogIdeaFromCarouselDraft } from '$lib/server/backlog';

export const POST: RequestHandler = async ({ params }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	try {
		const { project, slides } = await getCarouselBundle(params.id);

		const sourceTitle = project.title ?? project.idea_backlog?.title ?? 'Untitled carousel';
		const idea = await createBacklogIdeaFromCarouselDraft({
			title: `${sourceTitle} (copy)`,
			description: project.idea_backlog?.description ?? null,
			content_category: project.idea_backlog?.content_category ?? null,
			notes: project.idea_backlog?.notes ?? null
		});

		const now = new Date().toISOString();
		const { data: newProject, error: projectError } = await supabase
			.from('carousel_projects')
			.insert({
				backlog_id: idea.id,
				platform: 'instagram',
				status: 'draft',
				content_mode: project.content_mode,
				font_preset: project.font_preset,
				text_letter_spacing_em: project.text_letter_spacing_em,
				quote_font_scale: project.quote_font_scale,
				title: `${sourceTitle} (copy)`,
				visual_direction: project.visual_direction,
				caption: project.caption,
				hashtags_json: project.hashtags_json ?? [],
				account_display_name: project.account_display_name,
				account_handle: project.account_handle,
				account_avatar_url: project.account_avatar_url,
				account_avatar_storage_path: project.account_avatar_storage_path,
				account_is_verified: project.account_is_verified,
				review_status: 'draft',
				review_notes: null,
				reviewed_by: null,
				reviewed_at: null,
				slide_count: slides.length,
				created_at: now,
				updated_at: now
			})
			.select('*, idea_backlog(*)')
			.single();

		if (projectError) return json({ error: projectError.message }, { status: 500 });

		if (slides.length > 0) {
			const slideInserts = slides.map((slide) => ({
				project_id: newProject.id,
				position: slide.position,
				role: slide.role,
				layout_variant: slide.layout_variant,
				headline: slide.headline,
				body: slide.body,
				cta: slide.cta,
				visual_brief: slide.visual_brief,
				freepik_query: slide.freepik_query,
				quote_font_scale_override: slide.quote_font_scale_override,
				quote_text_offset_x_px: slide.quote_text_offset_x_px,
				quote_text_offset_y_px: slide.quote_text_offset_y_px,
				candidate_assets_json: [],
				selected_asset_json: null,
				selected_asset_storage_path: null,
				created_at: now,
				updated_at: now
			}));

			const { error: slidesError } = await supabase.from('carousel_slides').insert(slideInserts);
			if (slidesError) return json({ error: slidesError.message }, { status: 500 });
		}

		await recomputeCarouselStatus(newProject.id as string);

		return json({ project: newProject }, { status: 201 });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
