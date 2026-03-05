import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

export const GET: RequestHandler = async ({ params }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const { data, error } = await supabase
		.from('monitoring_content')
		.select('*, monitoring_content_platform(*)')
		.eq('id', params.id)
		.single();

	if (error) return json({ error: 'Content not found' }, { status: 404 });
	return json(data);
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });

	const body = await request.json();
	if (body.priority !== undefined && !PRIORITIES.has(String(body.priority))) {
		return json({ error: 'priority must be one of: low, normal, high, urgent' }, { status: 400 });
	}
	const updates: Record<string, unknown> = {};
	for (const key of ['title', 'description', 'notes', 'status', 'owner', 'priority']) {
		if (body[key] !== undefined) updates[key] = body[key];
	}

	const { data, error } = await supabase
		.from('monitoring_content')
		.update(updates)
		.eq('id', params.id)
		.select()
		.single();

	if (error) return json({ error: 'Content not found' }, { status: 404 });
	return json(data);
};

export const DELETE: RequestHandler = async ({ params }) => {
	if (!supabase) return json({ error: 'Supabase not configured' }, { status: 500 });
	await supabase.from('monitoring_content').delete().eq('id', params.id);
	return new Response(null, { status: 204 });
};
