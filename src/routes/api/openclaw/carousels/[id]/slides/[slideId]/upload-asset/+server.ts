import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import type { CarouselAsset } from '$lib/types';
import { uploadCustomCarouselAsset } from '$lib/server/pexels';
import { recomputeCarouselStatus } from '$lib/server/carousel-store';

function normalizeCandidateAssets(value: unknown): CarouselAsset[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is CarouselAsset => Boolean(item && typeof item === 'object'));
}

export const POST: RequestHandler = async ({ params, request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	try {
		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File)) {
			return json({ error: 'file is required' }, { status: 400 });
		}

		const { data: slide, error: slideError } = await supabase
			.from('carousel_slides')
			.select('*')
			.eq('id', params.slideId)
			.eq('project_id', params.id)
			.single();

		if (slideError) {
			return json({ error: slideError.message }, { status: 404 });
		}

		const stored = await uploadCustomCarouselAsset(file, params.id, params.slideId);
		const currentCandidates = normalizeCandidateAssets(slide.candidate_assets_json);
		const nextCandidates = [
			stored.asset,
			...currentCandidates.filter(
				(asset) => asset.storage_url !== stored.asset.storage_url && asset.preview_url !== stored.asset.preview_url
			)
		];

		const { data, error } = await supabase
			.from('carousel_slides')
			.update({
				candidate_assets_json: nextCandidates,
				selected_asset_json: stored.asset,
				selected_asset_storage_path: stored.path,
				updated_at: new Date().toISOString()
			})
			.eq('id', params.slideId)
			.eq('project_id', params.id)
			.select('*')
			.single();

		if (error) {
			return json({ error: error.message }, { status: 500 });
		}

		const projectStatus = await recomputeCarouselStatus(params.id);
		return json({ slide: data, project_status: projectStatus, asset_url: stored.publicUrl });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
