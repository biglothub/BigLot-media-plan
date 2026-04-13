import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PRODUCTION_STAGES } from '$lib/media-plan';
import { supabase } from '$lib/supabase';

export const PATCH: RequestHandler = async ({ params, request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const body = await request.json();
	const updates: Record<string, unknown> = {};

	if (body.status !== undefined) {
		if (!PRODUCTION_STAGES.includes(body.status)) {
			return json({ error: `status must be one of: ${PRODUCTION_STAGES.join(', ')}` }, { status: 400 });
		}
		updates.status = body.status;
	}

	if (body.shoot_date !== undefined) updates.shoot_date = body.shoot_date;
	if (body.publish_deadline !== undefined) updates.publish_deadline = body.publish_deadline;
	if (body.notes !== undefined) updates.notes = body.notes;
	if (body.carousel_project_id !== undefined) updates.carousel_project_id = body.carousel_project_id;
	if (body.handoff_source !== undefined) updates.handoff_source = body.handoff_source;

	if (Object.keys(updates).length === 0) {
		return json({ error: 'No fields to update' }, { status: 400 });
	}

	const { data, error } = await supabase
		.from('production_calendar')
		.update(updates)
		.eq('id', params.id)
		.select()
		.single();

	if (error) return json({ error: 'Schedule not found' }, { status: 404 });
	return json(data);
};
