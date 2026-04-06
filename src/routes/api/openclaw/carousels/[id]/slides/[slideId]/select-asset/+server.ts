import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';
import type { CarouselAsset } from '$lib/types';
import { downloadAndStorePexelsAsset } from '$lib/server/pexels';
import { recomputeCarouselStatus } from '$lib/server/carousel-store';

function resolveSelectedAsset(value: unknown): CarouselAsset | null {
	if (!value || typeof value !== 'object') return null;
	const record = value as Record<string, unknown>;
	if (typeof record.id !== 'number' || typeof record.title !== 'string') return null;
	return value as CarouselAsset;
}

export const POST: RequestHandler = async ({ params, request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	try {
		const body = await request.json();
		const suppliedAsset = resolveSelectedAsset(body.asset);

		const { data: slide, error: slideError } = await supabase
			.from('carousel_slides')
			.select('*')
			.eq('id', params.slideId)
			.eq('project_id', params.id)
			.single();

		if (slideError) {
			return json({ error: slideError.message }, { status: 404 });
		}

		const candidates = Array.isArray(slide.candidate_assets_json) ? (slide.candidate_assets_json as CarouselAsset[]) : [];
		const selectedAsset =
			suppliedAsset ??
			(typeof body.asset_id === 'number' ? candidates.find((item) => item.id === body.asset_id) ?? null : null);

		if (!selectedAsset) {
			return json({ error: 'asset or asset_id is required' }, { status: 400 });
		}

		const stored = await downloadAndStorePexelsAsset(selectedAsset, params.id, params.slideId);
		const { data, error } = await supabase
			.from('carousel_slides')
			.update({
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
