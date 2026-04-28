import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

interface PositionEntry {
	id: string;
	position: number;
}

export const PATCH: RequestHandler = async ({ params, request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	try {
		const body = await request.json();
		const positions: PositionEntry[] = Array.isArray(body.positions) ? body.positions : [];

		if (positions.length === 0) {
			return json({ error: 'positions array is required' }, { status: 400 });
		}

		for (const entry of positions) {
			if (typeof entry.id !== 'string' || typeof entry.position !== 'number' || entry.position < 1) {
				return json({ error: 'Each position entry must have a valid id and position >= 1' }, { status: 400 });
			}
		}

		// Verify all slides belong to this project
		const ids = positions.map((p) => p.id);
		const { data: existing, error: fetchError } = await supabase
			.from('carousel_slides')
			.select('id')
			.eq('project_id', params.id)
			.in('id', ids);

		if (fetchError) return json({ error: fetchError.message }, { status: 500 });
		if (!existing || existing.length !== ids.length) {
			return json({ error: 'One or more slide IDs do not belong to this project' }, { status: 400 });
		}

		const now = new Date().toISOString();

		// Phase 1: set positions to negative to avoid unique constraint collisions
		for (const entry of positions) {
			const { error } = await supabase
				.from('carousel_slides')
				.update({ position: -entry.position, updated_at: now })
				.eq('id', entry.id)
				.eq('project_id', params.id);
			if (error) return json({ error: error.message }, { status: 500 });
		}

		// Phase 2: set final positive positions
		for (const entry of positions) {
			const { error } = await supabase
				.from('carousel_slides')
				.update({ position: entry.position, updated_at: now })
				.eq('id', entry.id)
				.eq('project_id', params.id);
			if (error) return json({ error: error.message }, { status: 500 });
		}

		const { data: updatedSlides, error: refetchError } = await supabase
			.from('carousel_slides')
			.select('*')
			.eq('project_id', params.id)
			.order('position', { ascending: true });

		if (refetchError) return json({ error: refetchError.message }, { status: 500 });

		return json({ slides: updatedSlides });
	} catch (error) {
		return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
	}
};
