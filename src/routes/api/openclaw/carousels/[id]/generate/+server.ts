import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import type { CarouselAsset } from '$lib/types';
import { generateCarouselDraft } from '$lib/server/carousel-ai';
import { downloadAndStorePexelsAsset, searchPexelsResources, hasPexelsConfig } from '$lib/server/pexels';
import { getCarouselBundle, getCarouselProjectById, recomputeCarouselStatus } from '$lib/server/carousel-store';

export const POST: RequestHandler = async ({ params }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });
	if (!hasPexelsConfig) return json({ error: 'PEXELS_API_KEY is required' }, { status: 500 });

	try {
		const project = await getCarouselProjectById(params.id);
		if (!project) {
			return json({ error: 'Carousel project not found' }, { status: 404 });
		}

		const idea = project.idea_backlog;
		if (!idea || (!idea.title?.trim() && !idea.description?.trim())) {
			return json({ error: 'Backlog item must contain title or description before generating' }, { status: 400 });
		}

		const draft = await generateCarouselDraft({
			title: idea.title ?? project.title ?? 'Untitled carousel',
			description: idea.description,
			notes: idea.notes,
			contentCategory: idea.content_category,
			slideCount: 6
		});

		const slides = await Promise.all(
			draft.slides.map(async (slide) => {
				let candidateAssets: CarouselAsset[] = [];
				try {
					candidateAssets = await searchPexelsResources(slide.freepik_query, 8);
				} catch {
					candidateAssets = [];
				}

				let selectedAssetJson: CarouselAsset | null = null;
				let selectedAssetStoragePath: string | null = null;
				const firstAsset = candidateAssets[0] ?? null;

				if (firstAsset) {
					try {
						const stored = await downloadAndStorePexelsAsset(firstAsset, params.id, `slide-${slide.position}`);
						selectedAssetJson = stored.asset;
						selectedAssetStoragePath = stored.path;
					} catch {
						selectedAssetJson = null;
						selectedAssetStoragePath = null;
					}
				}

				return {
					...slide,
					candidate_assets_json: candidateAssets,
					selected_asset_json: selectedAssetJson,
					selected_asset_storage_path: selectedAssetStoragePath
				};
			})
		);

		const now = new Date().toISOString();
		const { error: projectError } = await supabase
			.from('carousel_projects')
			.update({
				title: draft.title,
				visual_direction: draft.visual_direction,
				caption: draft.caption,
				hashtags_json: draft.hashtags,
				slide_count: slides.length,
				last_generated_at: now,
				status: 'draft',
				updated_at: now
			})
			.eq('id', params.id);

		if (projectError) {
			return json({ error: projectError.message }, { status: 500 });
		}

		const { error: deleteError } = await supabase.from('carousel_slides').delete().eq('project_id', params.id);
		if (deleteError) {
			return json({ error: deleteError.message }, { status: 500 });
		}

		const { error: insertError } = await supabase.from('carousel_slides').insert(
			slides.map((slide) => ({
				project_id: params.id,
				position: slide.position,
				role: slide.role,
				layout_variant: slide.layout_variant,
				headline: slide.headline,
				body: slide.body,
				cta: slide.cta,
				visual_brief: slide.visual_brief,
				freepik_query: slide.freepik_query,
				candidate_assets_json: slide.candidate_assets_json,
				selected_asset_json: slide.selected_asset_json,
				selected_asset_storage_path: slide.selected_asset_storage_path,
				updated_at: now
			}))
		);

		if (insertError) {
			return json({ error: insertError.message }, { status: 500 });
		}

		await recomputeCarouselStatus(params.id);
		const bundle = await getCarouselBundle(params.id);
		return json({
			...bundle.project,
			carousel_slides: bundle.slides
		});
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
