import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import { regenerateCarouselSlide } from '$lib/server/carousel-ai';
import { getCarouselBundle, recomputeCarouselStatus } from '$lib/server/carousel-store';
import type { CarouselContentMode, CarouselSlideRow } from '$lib/types';

function normalizeContentMode(value: unknown): CarouselContentMode {
	return value === 'quote' ? 'quote' : 'standard';
}

export const POST: RequestHandler = async ({ params }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	try {
		const bundle = await getCarouselBundle(params.id);
		const slide = bundle.slides.find((item) => item.id === params.slideId);

		if (!slide) {
			return json({ error: 'Carousel slide not found' }, { status: 404 });
		}

		const contentMode = normalizeContentMode(bundle.project.content_mode);
		const idea = bundle.project.idea_backlog;
		const projectTitle = bundle.project.title ?? idea?.title ?? '';
		const projectDescription = idea?.description ?? bundle.project.caption ?? null;
		const projectNotes = idea?.notes ?? null;
		const projectVisualDirection = bundle.project.visual_direction ?? null;

		if (!projectTitle.trim() && !projectDescription?.trim()) {
			return json({ error: 'Carousel project must contain title or description before regenerating slides' }, { status: 400 });
		}

		const regeneratedSlide = await regenerateCarouselSlide({
			projectTitle: projectTitle || 'Untitled carousel',
			projectDescription,
			projectVisualDirection,
			notes: projectNotes,
			contentCategory: idea?.content_category ?? null,
			contentMode,
			slideCount: bundle.slides.length || bundle.project.slide_count || 0,
			targetSlide: {
				position: slide.position,
				role: slide.role,
				layout_variant: slide.layout_variant,
				headline: slide.headline,
				body: slide.body,
				cta: slide.cta,
				visual_brief: slide.visual_brief,
				freepik_query: slide.freepik_query
			},
			existingSlides: bundle.slides.map((item) => ({
				position: item.position,
				role: item.role,
				headline: item.headline,
				body: item.body,
				cta: item.cta
			}))
		});

		const now = new Date().toISOString();

		// Push current copy to history (keep last 3 entries)
		const existingHistory = slide.history_json ?? [];
		const historyEntry = {
			saved_at: now,
			headline: slide.headline,
			body: slide.body,
			cta: slide.cta,
			visual_brief: slide.visual_brief,
			freepik_query: slide.freepik_query
		};
		const newHistory = [historyEntry, ...existingHistory].slice(0, 3);

		const { data, error } = await supabase
			.from('carousel_slides')
			.update({
				headline: regeneratedSlide.headline,
				body: regeneratedSlide.body,
				cta: regeneratedSlide.cta,
				visual_brief: regeneratedSlide.visual_brief,
				freepik_query: regeneratedSlide.freepik_query,
				candidate_assets_json: [],
				selected_asset_json: null,
				selected_asset_storage_path: null,
				history_json: newHistory,
				updated_at: now
			})
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
